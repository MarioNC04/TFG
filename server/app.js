/**
 * API HTTP del servidor local que simula TecnoCRA.
 *
 *   GET  /api/health
 *   GET  /api/teachers                   GET  /api/teachers/:id
 *   GET  /api/schedule                   PUT  /api/schedule {classroom, slots}
 *   GET  /api/subjects                   (asignaturas conocidas, para el editor del horario)
 *   GET  /api/cards                      POST /api/cards {uid, role, name, subjects}
 *   GET  /api/cards/:uid
 *   GET  /api/students                   GET  /api/students/:id
 *   POST /api/students/:id/rewards {points, reason}
 *   GET  /api/missions                   GET  /api/missions/:id
 *   POST /api/missions/confirmed         Misión cerrada por el profesor:
 *        {id, title, subject, type, modality, teacherId, completedBy, attempts, ...}
 *        Con confirmed: false se registra una misión que se cerró sola: los que salieron reciben 2 puntos.
 *   GET  /api/live                       PUT  /api/live (estado en directo del aula)
 *   GET  /api/events                     (Server-Sent Events: avisa al panel de cada cambio)
 *   POST /api/interpret {transcript, subject}   (simula el servicio de IA / Node-RED)
 *   GET  /api/avatar
 *   GET  /api/achievements               (logros que existen, cómo se consiguen y quién los tiene)
 *   POST /api/reset                      (puntos, logros y misiones a cero; se conservan alumnos, tarjetas y horario)
 *   GET  /                               (panel web del avatar)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { HttpError, POINTS_BY_MODALITY, ATTEMPT_POINTS } = require('./store');
const { parseMission, SUBJECTS } = require('../src/missions/parser');

const MAX_BODY_BYTES = 64 * 1024;
const SSE_UPDATE = 'data: update\n\n';
const SSE_RETRY = 'retry: 2000\n\n';
const SSE_PING = ': ping\n\n';
const PANEL_FILE = path.join(__dirname, 'public', 'index.html');

function readJson(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new HttpError(413, 'Cuerpo de la petición demasiado grande'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (chunks.length === 0) return resolve({});
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch (error) {
                reject(new HttpError(400, 'JSON no válido'));
            }
        });
        req.on('error', reject);
    });
}

function send(res, status, body, contentType = 'application/json; charset=utf-8') {
    res.writeHead(status, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS'
    });
    res.end(contentType.startsWith('application/json') ? JSON.stringify(body) : body);
}

function buildRoutes(store, options) {
    // Cada ruta: [método, patrón, manejador(params, body)]
    return [
        ['GET', /^\/api\/health$/, () => ({ status: 'ok' })],
        ['GET', /^\/api\/teachers$/, () => store.listTeachers()],
        ['GET', /^\/api\/teachers\/([^/]+)$/, ([id]) => store.getTeacher(id)],
        ['GET', /^\/api\/schedule$/, () => store.getSchedule()],
        ['PUT', /^\/api\/schedule$/, (p, body) => store.setSchedule(body)],
        ['GET', /^\/api\/subjects$/, () => Object.entries(SUBJECTS).map(([id, s]) => ({ id, label: s.label }))],
        ['GET', /^\/api\/cards$/, () => store.listCards()],
        ['POST', /^\/api\/cards$/, (p, body) => store.registerCard(body.uid, body)],
        ['GET', /^\/api\/cards\/([^/]+)$/, ([uid]) => store.getCard(uid)],
        ['GET', /^\/api\/students$/, () => store.listStudents()],
        ['GET', /^\/api\/students\/([^/]+)$/, ([id]) => store.getStudent(id)],
        ['POST', /^\/api\/students\/([^/]+)\/rewards$/, ([id], body) => store.reward(id, body.points, body.reason)],
        ['GET', /^\/api\/missions$/, () => store.listMissions()],
        ['POST', /^\/api\/missions\/confirmed$/, (p, body) => store.confirmMission(body)],
        ['GET', /^\/api\/live$/, () => store.getLive()],
        ['PUT', /^\/api\/live$/, (p, body) => store.setLive(body)],
        ['GET', /^\/api\/missions\/([^/]+)$/, ([id]) => store.getMission(id)],
        ['POST', /^\/api\/interpret$/, (p, body) => parseMission(body.transcript, {
            subject: body.subject,
            defaultSubject: body.defaultSubject || options.defaultSubject
        })],
        ['GET', /^\/api\/avatar$/, () => store.avatar()],
        ['POST', /^\/api\/reset$/, () => store.resetProgress()],
        ['GET', /^\/api\/achievements$/, () => ({
            achievements: store.listAchievements(),
            points: { individual: POINTS_BY_MODALITY.individual, attempt: ATTEMPT_POINTS, group: POINTS_BY_MODALITY.grupal }
        })]
    ];
}

function createApp(store, options = {}) {
    const routes = buildRoutes(store, options);
    // Paneles conectados que reciben un aviso en cuanto cambia algo.
    const clients = new Set();
    const broadcast = () => {
        for (const client of clients) client.write(SSE_UPDATE);
    };

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');

        if (req.method === 'OPTIONS') return send(res, 204, '', 'text/plain');
        if (req.method === 'GET' && url.pathname === '/api/events') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
                'Access-Control-Allow-Origin': '*'
            });
            res.write(SSE_RETRY);
            clients.add(res);
            req.on('close', () => clients.delete(res));
            return undefined;
        }
        if (req.method === 'GET' && url.pathname === '/') {
            return send(res, 200, fs.readFileSync(PANEL_FILE, 'utf8'), 'text/html; charset=utf-8');
        }

        try {
            for (const [method, pattern, handler] of routes) {
                const match = pattern.exec(url.pathname);
                if (!match || req.method !== method) continue;
                const params = match.slice(1).map(decodeURIComponent);
                const body = method === 'GET' ? {} : await readJson(req);
                const result = handler(params, body);
                const created = method === 'POST' && /\/(confirmed|cards)$/.test(url.pathname) && !result.duplicate;
                send(res, created ? 201 : 200, result);
                if (method !== 'GET') broadcast();
                return undefined;
            }
            throw new HttpError(404, `Ruta no encontrada: ${req.method} ${url.pathname}`);
        } catch (error) {
            const status = error.status || 500;
            if (status === 500) console.error('❌ Error interno:', error);
            send(res, status, { error: error.message });
        }
    });

    // Mantiene abiertas las conexiones de los paneles.
    const keepAlive = setInterval(() => {
        for (const client of clients) client.write(SSE_PING);
    }, 25000);
    keepAlive.unref();
    server.on('close', () => clearInterval(keepAlive));
    const close = server.close.bind(server);
    server.close = (callback) => {
        for (const client of clients) client.end();
        clients.clear();
        return close(callback);
    };
    return server;
}

module.exports = { createApp };
