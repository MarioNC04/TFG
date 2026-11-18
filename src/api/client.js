/**
 * Cliente de la API de TecnoCRA (o del servidor local que la simula).
 *
 * Si el servidor no responde al confirmar una misión, la confirmación se
 * guarda en una cola local y se reenvía en la siguiente sincronización, para
 * no perder nada de lo que ocurre en el aula. Cada misión lleva un id propio,
 * así que reenviarla dos veces no duplica los puntos.
 */

const { readJson, writeJsonAtomic } = require('../storage');

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
    getSchedule() { return this.request('GET', '/schedule'); }
    listTeachers() { return this.request('GET', '/teachers'); }
    getCard(uid) { return this.request('GET', `/cards/${encodeURIComponent(uid)}`); }
    listCards() { return this.request('GET', '/cards'); }
    registerCard(card) { return this.request('POST', '/cards', card); }
    listStudents() { return this.request('GET', '/students'); }
    listMissions() { return this.request('GET', '/missions'); }
    reward(studentId, points, reason) { return this.request('POST', `/students/${studentId}/rewards`, { points, reason }); }
    avatar() { return this.request('GET', '/avatar'); }
    /** Estado en directo del aula para el panel. */
    reportLive(state) { return this.request('PUT', '/live', state); }

    /**
     * Envía una misión cerrada por el profesor. Si no hay conexión la deja en
     * cola y devuelve { queued: true }.
     */
    async confirmMission(mission) {
        try {
            return await this.request('POST', '/missions/confirmed', mission);
        } catch (error) {
            if (error.status !== 0 || !this.queueFile) throw error;
            this.writeQueue([...this.readQueue(), mission]);
            return { mission, results: [], queued: true };
        }
    }

    /** Reenvía las misiones pendientes. Devuelve cuántas se han enviado. */
    async syncQueue() {
        const pending = this.readQueue();
        let sent = 0;
        for (const mission of pending) {
            try {
                await this.request('POST', '/missions/confirmed', mission);
                sent++;
            } catch (error) {
                break;
            }
        }
        this.writeQueue(pending.slice(sent));
        return { sent, remaining: pending.length - sent };
    }

    readQueue() {
        return readJson(this.queueFile, []);
    }

    writeQueue(missions) {
        if (this.queueFile) writeJsonAtomic(this.queueFile, missions);
    }
}

module.exports = { ApiClient, ApiError };
