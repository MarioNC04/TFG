/**
 * Cliente de la API de TecnoCRA (o del servidor local que la simula).
 *
 * Si el servidor no responde al crear una misión, la misión se guarda en una
 * cola local y se reenvía en la siguiente sincronización, para no perder nada
 * de lo que ocurre en el aula.
 */

const fs = require('fs');
const path = require('path');

class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

class ApiClient {
    constructor({ baseUrl, timeoutMs = 3000, queueFile = null }) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.timeoutMs = timeoutMs;
        this.queueFile = queueFile;
    }

    async request(method, route, body) {
        let response;
        try {
            response = await fetch(`${this.baseUrl}${route}`, {
                method,
                headers: body ? { 'Content-Type': 'application/json' } : undefined,
                body: body ? JSON.stringify(body) : undefined,
                signal: AbortSignal.timeout(this.timeoutMs)
            });
        } catch (error) {
            throw new ApiError(0, `No se pudo conectar con ${this.baseUrl} (${error.message})`);
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new ApiError(response.status, data.error || `HTTP ${response.status}`);
        return data;
    }

    health() { return this.request('GET', '/health'); }
    getCard(uid) { return this.request('GET', `/cards/${encodeURIComponent(uid)}`); }
    listCards() { return this.request('GET', '/cards'); }
    registerCard(card) { return this.request('POST', '/cards', card); }
    listStudents() { return this.request('GET', '/students'); }
    listMissions(status) { return this.request('GET', `/missions${status ? `?status=${status}` : ''}`); }
    completeMission(id, studentId) { return this.request('POST', `/missions/${id}/complete`, { studentId }); }
    closeMission(id) { return this.request('POST', `/missions/${id}/close`); }
    reward(studentId, points, reason) { return this.request('POST', `/students/${studentId}/rewards`, { points, reason }); }
    avatar() { return this.request('GET', '/avatar'); }

    /** Crea la misión; si no hay conexión la deja en cola y devuelve { queued: true }. */
    async createMission(mission) {
        try {
            return await this.request('POST', '/missions', mission);
        } catch (error) {
            if (error.status !== 0 || !this.queueFile) throw error;
            this.writeQueue([...this.readQueue(), mission]);
            return { ...mission, queued: true };
        }
    }

    /** Reenvía las misiones pendientes. Devuelve cuántas se han enviado. */
    async syncQueue() {
        const pending = this.readQueue();
        let sent = 0;
        for (const mission of pending) {
            try {
                await this.request('POST', '/missions', mission);
                sent++;
            } catch (error) {
                break;
            }
        }
        this.writeQueue(pending.slice(sent));
        return { sent, remaining: pending.length - sent };
    }

    readQueue() {
        if (!this.queueFile || !fs.existsSync(this.queueFile)) return [];
        return JSON.parse(fs.readFileSync(this.queueFile, 'utf8'));
    }

    writeQueue(missions) {
        if (!this.queueFile) return;
        fs.mkdirSync(path.dirname(this.queueFile), { recursive: true });
        fs.writeFileSync(this.queueFile, JSON.stringify(missions, null, 2));
    }
}

module.exports = { ApiClient, ApiError };
