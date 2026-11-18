/**
 * Estado en directo del aula para el panel de TecnoCRA.
 *
 * Cada vez que ocurre algo en el aula (empieza una sesión, se abre una misión,
 * sale un alumno...) se envía al servidor un resumen: la sesión en curso, la
 * misión abierta con su temporizador y los últimos avisos. También se envía
 * cada 20 segundos para que el panel sepa que el dispositivo sigue conectado.
 *
 * Los tiempos se envían como duraciones (lo que queda de escucha, lo que lleva
 * abierta la misión) y no como horas, para que no importe si el reloj de la
 * Raspberry y el del servidor no coinciden.
 */

const { describeEvent } = require('./messages');
const { subjectLabel } = require('./missions/parser');

const FEED_SIZE = 8;
const HEARTBEAT_MS = 20 * 1000;
// Eventos que no interesan en el panel.
const HIDDEN = new Set(['phrase', 'error']);

/** Tarjetas que no han servido para nada: se resaltan en el panel. */
function isInvalidCard(event) {
    if (['unknown-card', 'card-error', 'rejected'].includes(event.kind)) return true;
    return event.kind === 'student' && event.status !== 'apuntado';
}

class LiveReporter {
    /**
     * @param {import('./classroom').Classroom} classroom
     * @param {import('./api/client').ApiClient} api
     */
    constructor(classroom, api) {
        this.classroom = classroom;
        this.api = api;
        this.feed = [];
        this.pending = null;
        this.heartbeat = null;
        this.onEvent = (event) => this.record(event);
    }

    start() {
        this.classroom.on('event', this.onEvent);
        this.heartbeat = setInterval(() => this.send(), HEARTBEAT_MS);
        this.heartbeat.unref();
        return this.send();
    }

    stop() {
        this.classroom.off('event', this.onEvent);
        clearInterval(this.heartbeat);
    }

    record(event) {
        if (!HIDDEN.has(event.kind)) {
            const text = describeEvent(event);
            if (text) {
                const at = this.classroom.clock.now().toTimeString().slice(0, 5);
                this.feed.unshift({ at, kind: event.kind, warn: isInvalidCard(event), text: text.split('\n').map((l) => l.trim()).join('\n') });
                this.feed.length = Math.min(this.feed.length, FEED_SIZE);
            }
        }
        // Varios eventos seguidos se envían juntos.
        if (!this.pending) this.pending = setImmediate(() => { this.pending = null; this.send(); });
    }

    snapshot() {
        const { classroom } = this;
        const now = classroom.clock.now();
        const slot = classroom.schedule.slotAt(now);
        const { session, activity } = classroom;
        const listenMs = classroom.options.listenMinutes * 60 * 1000;
        const elapsedMs = activity ? now.getTime() - Date.parse(activity.startedAt) : 0;
        return {
            classroom: classroom.schedule.classroom,
            deviceTime: now.toTimeString().slice(0, 5),
            slot: slot && { start: slot.start, end: slot.end, teacherId: slot.teacherId, subject: slot.subject, subjectLabel: subjectLabel(slot.subject) },
            session: session && {
                teacher: { id: session.teacher.id, name: session.teacher.name },
                subject: session.subject,
                subjectLabel: subjectLabel(session.subject),
                slot: { start: session.slot.start, end: session.slot.end },
                substitute: session.substitute
            },
            activity: activity && {
                id: activity.id,
                phase: activity.phase,
                title: activity.title,
                modality: activity.modality,
                subjectLabel: subjectLabel(activity.subject),
                students: activity.students.map((s) => ({ id: s.id, name: s.name })),
                elapsedMs,
                listenTotalMs: listenMs,
                listenRemainingMs: activity.phase === 'listening' ? Math.max(0, listenMs - elapsedMs) : null
            },
            feed: this.feed
        };
    }

    async send() {
        try {
            await this.api.reportLive(this.snapshot());
        } catch (error) {
            // Sin conexión: el panel mostrará que el dispositivo no responde.
        }
    }
}

module.exports = { LiveReporter };
