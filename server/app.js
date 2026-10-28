/**
 * API HTTP del servidor local que simula TecnoCRA.
 *
 *   GET  /api/health
 *   GET  /api/cards                      POST /api/cards {uid, role, subject|name}
 *   GET  /api/cards/:uid
 *   GET  /api/students                   GET  /api/students/:id
 *   POST /api/students/:id/rewards {points, reason}
 *   GET  /api/missions?status=pending    POST /api/missions
 *   POST /api/missions/:id/complete {studentId}
 *   POST /api/missions/:id/close
 *   POST /api/interpret {transcript, subject}   (simula el servicio de IA / Node-RED)
 *   GET  /api/avatar
 *   GET  /                               (panel web del avatar)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { HttpError } = require('./store');
const { parseMission } = require('../src/missions/parser');

const MAX_BODY_BYTES = 64 * 1024;
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
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(contentType.startsWith('application/json') ? JSON.stringify(body) : body);
}

function buildRoutes(store, options) {
    // Cada ruta: [método, patrón, manejador(params, body, query)]
    return [
        ['GET', /^\/api\/health$/, () => ({ status: 'ok' })],
        ['GET', /^\/api\/cards$/, () => store.listCards()],
        ['POST', /^\/api\/cards$/, (p, body) => store.registerCard(body.uid, body)],
        ['GET', /^\/api\/cards\/([^/]+)$/, ([uid]) => store.getCard(uid)],
        ['GET', /^\/api\/students$/, () => store.listStudents()],
        ['GET', /^\/api\/students\/([^/]+)$/, ([id]) => store.getStudent(id)],
        ['POST', /^\/api\/students\/([^/]+)\/rewards$/, ([id], body) => store.reward(id, body.points, body.reason)],
        ['GET', /^\/api\/missions$/, (p, b, query) => store.listMissions(query.get('status'))],
        ['POST', /^\/api\/missions$/, (p, body) => store.createMission(body)],
        ['POST', /^\/api\/missions\/([^/]+)\/complete$/, ([id], body) => store.completeMission(id, body.studentId)],
        ['POST', /^\/api\/missions\/([^/]+)\/close$/, ([id]) => store.closeMission(id)],
        ['POST', /^\/api\/interpret$/, (p, body) => parseMission(body.transcript, {
            subject: body.subject,
            defaultSubject: body.defaultSubject || options.defaultSubject
        })],
        ['GET', /^\/api\/avatar$/, () => store.avatar()]
    ];
}

function createApp(store, options = {}) {
    const routes = buildRoutes(store, options);

    return http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');

        if (req.method === 'OPTIONS') return send(res, 204, '', 'text/plain');
        if (req.method === 'GET' && url.pathname === '/') {
            return send(res, 200, fs.readFileSync(PANEL_FILE, 'utf8'), 'text/html; charset=utf-8');
        }

        try {
            for (const [method, pattern, handler] of routes) {
                const match = pattern.exec(url.pathname);
                if (!match || req.method !== method) continue;
                const params = match.slice(1).map(decodeURIComponent);
                const body = method === 'POST' ? await readJson(req) : {};
                const result = handler(params, body, url.searchParams);
                return send(res, method === 'POST' && /\/(missions|cards)$/.test(url.pathname) ? 201 : 200, result);
            }
            throw new HttpError(404, `Ruta no encontrada: ${req.method} ${url.pathname}`);
        } catch (error) {
            const status = error.status || 500;
            if (status === 500) console.error('❌ Error interno:', error);
            send(res, status, { error: error.message });
        }
    });
}

module.exports = { createApp };
