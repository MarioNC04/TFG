/**
 * Lógica del aula: une tarjetas NFC, voz del profesor y API.
 *
 *  - Tarjeta de profesor: fija la asignatura y escucha lo que dice a
 *    continuación para crear la misión (nombre, tipo, individual o grupal).
 *  - Escucha libre: si el profesor dice "voluntario" se crea una misión con la
 *    asignatura activa.
 *  - Tarjeta de alumno: registra que ese alumno ha hecho la misión abierta más
 *    reciente y devuelve los puntos y logros conseguidos.
 *
 * No depende del hardware: recibe la función `listen` que devuelve el texto
 * reconocido, lo que permite probarla sin micrófono.
 */

const { subjectLabel } = require('./missions/parser');

class Classroom {
    /**
     * @param {object} deps
     * @param {import('./api/client').ApiClient} deps.api
     * @param {import('./missions/interpreter').MissionInterpreter} deps.interpreter
     * @param {() => Promise<string>} deps.listen Graba y transcribe la voz del profesor.
     * @param {string} deps.defaultSubject
     */
    constructor({ api, interpreter, listen, defaultSubject }) {
        this.api = api;
        this.interpreter = interpreter;
        this.listen = listen;
        this.activeSubject = defaultSubject;
    }

    async handleCard(uid) {
        const card = await this.api.getCard(uid);
        if (card.role === 'teacher') return this.handleTeacherCard(card);
        return this.handleStudentCard(card);
    }

    async handleTeacherCard(card) {
        this.activeSubject = card.subject;
        const transcript = await this.listen();
        if (!transcript) return { kind: 'teacher', subject: card.subject, mission: null };

        // Tras pasar la tarjeta, cualquier frase del profesor es una misión de esa asignatura.
        const mission = await this.createMission(transcript, {
            force: true,
            source: 'tarjeta + voz',
            context: { subject: card.subject }
        });
        return { kind: 'teacher', subject: card.subject, mission };
    }

    async handleStudentCard(card) {
        const latest = await this.latestOpenMissionFor(card.student.id);
        if (!latest) return { kind: 'student', student: card.student, result: null };

        const result = await this.api.completeMission(latest.id, card.student.id);
        return { kind: 'student', student: result.student, result };
    }

    /** Misión abierta más reciente en la que el alumno todavía no ha participado. */
    async latestOpenMissionFor(studentId) {
        const open = [
            ...await this.api.listMissions('pending'),
            ...await this.api.listMissions('in_progress')
        ].filter((m) => !m.participants.includes(studentId) && !(m.attempts || []).includes(studentId));
        return open.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
    }

    /** Escucha libre: solo crea misión si la frase lo pide (p. ej. "voluntario"). */
    async handleTranscript(transcript) {
        return this.createMission(transcript, {
            force: false,
            source: 'voz',
            context: { defaultSubject: this.activeSubject }
        });
    }

    async createMission(transcript, { force, source, context }) {
        const parsed = await this.interpreter.interpret(transcript, context);
        if (!force && !parsed.isMission) return null;

        return this.api.createMission({
            title: parsed.title,
            subject: parsed.subject,
            type: parsed.type,
            modality: parsed.modality,
            transcript: parsed.transcript,
            source
        });
    }

    describeSubject() {
        return subjectLabel(this.activeSubject);
    }
}

module.exports = { Classroom };
