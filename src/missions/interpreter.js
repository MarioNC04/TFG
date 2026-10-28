/**
 * Interpreta la frase del profesor usando un servicio externo (la API
 * simulada, un flujo de Node-RED o un servicio de IA) y, si no está
 * disponible, el intérprete local.
 *
 * El servicio externo recibe POST { transcript, subject } y debe devolver
 * { title, subject, type, modality, isMission }.
 */

const { parseMission } = require('./parser');

class MissionInterpreter {
    constructor({ url = null, timeoutMs = 3000, defaultSubject, volunteerKeywords }) {
        this.url = url;
        this.timeoutMs = timeoutMs;
        this.localOptions = { defaultSubject, volunteerKeywords };
    }

    /**
     * @param {string} transcript
     * @param {object} [context]
     * @param {string} [context.subject] Asignatura impuesta (tarjeta del profesor).
     * @param {string} [context.defaultSubject] Asignatura si la frase no menciona ninguna.
     */
    async interpret(transcript, { subject, defaultSubject } = {}) {
        const local = parseMission(transcript, {
            ...this.localOptions,
            subject,
            defaultSubject: defaultSubject || this.localOptions.defaultSubject
        });
        if (!this.url) return { ...local, interpreter: 'local' };

        try {
            const response = await fetch(this.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcript, subject, defaultSubject: local.subject }),
                signal: AbortSignal.timeout(this.timeoutMs)
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const remote = await response.json();
            // Lo que el servicio no devuelva se completa con el intérprete local.
            return { ...local, ...remote, transcript: local.transcript, interpreter: 'remoto' };
        } catch (error) {
            return { ...local, interpreter: 'local' };
        }
    }
}

module.exports = { MissionInterpreter };
