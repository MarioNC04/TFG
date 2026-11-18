/**
 * Lógica del aula: une horario, tarjetas NFC, voz del profesor y API.
 *
 * Funciona como una máquina de estados:
 *
 *   sin sesión ──tarjeta del profesor (en su franja)──▶ sesión + escuchando
 *   escuchando ──frase con el tipo de actividad──▶ esperando el cierre
 *   escuchando ──15 min sin datos / tarjeta del profesor──▶ misión descartada
 *   esperando  ──tarjetas de alumnos──▶ se apuntan (el último es quien la completa)
 *   esperando  ──tarjeta del profesor──▶ misión confirmada y enviada a TecnoCRA
 *   en sesión, sin actividad ──tarjeta del profesor──▶ escuchando otra misión
 *
 * La sesión dura mientras siga la franja del profesor. Al terminar la franja:
 * si la siguiente es del mismo profesor solo cambia la asignatura; si no, la
 * sesión se cierra hasta que pase la tarjeta el siguiente profesor. Al acabar
 * el horario del día se cierra todo y se sincroniza la cola sin conexión.
 *
 * Todo lo que ocurre se notifica con el evento 'event' ({ kind, ... }) y
 * también se devuelve, para poder probarlo sin consola.
 */

const EventEmitter = require('events');
const { countWords, limitWords, missionTitle } = require('./missions/parser');
const { Schedule, slotKey } = require('./schedule');
const { readJson, writeJsonAtomic, appendJson } = require('./storage');

const realClock = {
    now: () => new Date(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id)
};

const DEFAULT_OPTIONS = {
    listenMinutes: 15,
    minWords: 3,
    maxWords: 25,
    allowSubstitutes: true,
    checkIntervalSeconds: 30,
    // Cada cuánto se vuelve a pedir el horario al servidor (cambios del panel).
    scheduleRefreshSeconds: 60
};

function dateKey(date) {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

class Classroom extends EventEmitter {
    /**
     * @param {object} deps
     * @param {import('./api/client').ApiClient} deps.api
     * @param {import('./missions/interpreter').MissionInterpreter} deps.interpreter
     * @param {{ start: (onPhrase: (text: string) => void) => { stop: () => void } }} deps.listener
     * @param {object} [deps.clock] Reloj (se sustituye en las pruebas).
     * @param {object} [deps.options] listenMinutes, minWords, maxWords, allowSubstitutes...
     * @param {string} [deps.discardFile] Registro local de misiones descartadas.
     * @param {string} [deps.scheduleCacheFile] Copia local del horario.
     * @param {() => boolean} [deps.isClockSynchronized]
     */
    constructor({ api, interpreter, listener, clock = realClock, options = {}, discardFile = null, scheduleCacheFile = null, isClockSynchronized = () => true }) {
        super();
        this.api = api;
        this.interpreter = interpreter;
        this.listener = listener;
        this.clock = clock;
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.discardFile = discardFile;
        this.scheduleCacheFile = scheduleCacheFile;
        this.isClockSynchronized = isClockSynchronized;

        this.schedule = new Schedule();
        this.scheduleJson = null;
        this.scheduleLoadedAt = null;
        this.session = null;
        this.activity = null;
        this.dayClosedOn = null;
        this.sawClassTime = false;
        this.ticker = null;
    }

    report(event) {
        this.emit('event', event);
        return event;
    }

    // --- Horario --------------------------------------------------------------

    /** Descarga el horario del servidor; si no hay conexión usa la copia local. */
    async loadSchedule() {
        this.scheduleLoadedAt = this.clock.now().getTime();
        try {
            const data = await this.api.getSchedule();
            if (this.scheduleCacheFile) writeJsonAtomic(this.scheduleCacheFile, data);
            this.useSchedule(data);
            return 'servidor';
        } catch (error) {
            const cached = readJson(this.scheduleCacheFile, null);
            if (!cached) return 'sin horario';
            this.useSchedule(cached);
            return 'copia local';
        }
    }

    /** Aplica un horario; devuelve true si ha cambiado respecto al anterior. */
    useSchedule(data) {
        const json = JSON.stringify(data);
        const changed = this.scheduleJson !== null && json !== this.scheduleJson;
        this.scheduleJson = json;
        this.schedule = new Schedule(data);
        return changed;
    }

    /** Vuelve a pedir el horario si ha pasado el intervalo; avisa si ha cambiado. */
    async refreshSchedule() {
        const now = this.clock.now().getTime();
        if (this.scheduleLoadedAt !== null && now - this.scheduleLoadedAt < this.options.scheduleRefreshSeconds * 1000) return;
        const before = this.scheduleJson;
        const source = await this.loadSchedule();
        if (source === 'servidor' && before !== null && before !== this.scheduleJson) {
            this.report({ kind: 'schedule-updated', slots: this.schedule.slots.length });
        }
    }

    /** Revisa periódicamente los cambios de franja y el fin del horario. */
    start() {
        this.ticker = this.clock.setInterval(() => {
            this.tick().catch((error) => this.report({ kind: 'error', message: error.message }));
        }, this.options.checkIntervalSeconds * 1000);
    }

    stop() {
        if (this.ticker) this.clock.clearInterval(this.ticker);
        if (this.activity) this.stopListening(this.activity);
    }

    async tick() {
        await this.refreshSchedule();
        const now = this.clock.now();
        if (this.schedule.slotAt(now)) this.sawClassTime = true;

        if (this.session) {
            const current = this.schedule.slotAt(now);
            if (slotKey(current) !== slotKey(this.session.slot)) {
                const { teacher, slot, substitute } = this.session;
                // Sigue el mismo profesor (o el sustituto cubre al mismo profesor).
                const continues = current && current.startMin === slot.endMin &&
                    (current.teacherId === teacher.id || (substitute && current.teacherId === slot.teacherId));
                if (continues) {
                    this.session.slot = current;
                    this.session.subject = current.subject;
                    this.report({ kind: 'subject-change', teacher, subject: current.subject, slot: current });
                } else {
                    await this.endSession('fin de la franja');
                }
            }
        }

        if (this.schedule.dayFinished(now) && this.dayClosedOn !== dateKey(now)) {
            this.dayClosedOn = dateKey(now);
            if (this.session) await this.endSession('fin del horario');
            let sync;
            try {
                sync = await this.api.syncQueue();
            } catch (error) {
                sync = { sent: 0, remaining: this.api.readQueue().length };
            }
            // Si el sistema se enciende cuando ya han acabado las clases, solo se avisa.
            this.report({ kind: 'day-end', sync, afterHours: !this.sawClassTime });
            this.sawClassTime = false;
        }
    }

    // --- Tarjetas ---------------------------------------------------------------

    async handleCard(uid) {
        let card;
        try {
            card = await this.api.getCard(uid);
        } catch (error) {
            // Tarjeta no registrada o sin conexión: se avisa (también en el panel).
            if (error.status === 404) return this.report({ kind: 'unknown-card', uid });
            return this.report({ kind: 'card-error', uid, message: error.message });
        }
        if (card.role === 'teacher') return this.handleTeacherCard(card.teacher);
        return this.handleStudentCard(card.student);
    }

    async handleTeacherCard(teacher) {
        if (!this.isClockSynchronized()) {
            return this.report({ kind: 'rejected', teacher, reason: 'la hora todavía no está sincronizada; espera a tener conexión' });
        }
        const slot = this.schedule.slotAt(this.clock.now());
        if (!slot) return this.report({ kind: 'rejected', teacher, reason: 'ahora no hay ninguna clase en el horario' });

        const substitute = slot.teacherId !== teacher.id;
        if (substitute && !this.options.allowSubstitutes) {
            return this.report({ kind: 'rejected', teacher, reason: 'esta franja es de otro profesor' });
        }

        if (!this.session || this.session.teacher.id !== teacher.id) {
            if (this.session) await this.endSession('ha pasado su tarjeta otro profesor');
            this.session = { teacher, slot, subject: slot.subject, substitute, startedAt: this.clock.now().toISOString() };
            this.sawClassTime = true;
            this.report({ kind: 'session-start', teacher, subject: slot.subject, slot, substitute });
            return this.startActivity();
        }

        if (!this.activity) return this.startActivity();
        // Mientras escucha, si no ha salido nadie la tarjeta cancela la misión;
        // si ya ha salido algún alumno, la cierra como ejercicio (ver closeActivity).
        if (this.activity.phase === 'listening' && this.activity.students.length === 0) {
            return this.discard(this.activity, 'cancelada por el profesor');
        }
        return this.closeActivity();
    }

    async handleStudentCard(student) {
        const activity = this.activity;
        if (!this.session) return this.report({ kind: 'student', student, status: 'sin-sesion' });
        if (!activity) return this.report({ kind: 'student', student, status: 'sin-actividad' });
        if (activity.phase === 'waiting' && activity.modality === 'grupal') {
            return this.report({ kind: 'student', student, status: 'grupal' });
        }

        // Si vuelve a pasar la tarjeta, pasa a ser el último (quien la completa).
        // Los puntos no se dan aquí: solo al confirmar la misión.
        activity.students = activity.students.filter((s) => s.id !== student.id);
        activity.students.push(student);
        return this.report({
            kind: 'student',
            student,
            status: 'apuntado',
            attempts: activity.students.slice(0, -1),
            title: activity.title
        });
    }

    // --- Actividad (misión en curso) ---------------------------------------------

    startActivity() {
        const now = this.clock.now();
        const activity = {
            id: `${this.schedule.classroom || 'aula'}-${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
            phase: 'listening',
            subject: this.session.subject,
            startedAt: now.toISOString(),
            groupFound: false,
            title: null,
            type: null,
            modality: null,
            transcript: null,
            students: [],
            listening: null,
            timer: null
        };
        this.activity = activity;
        activity.timer = this.clock.setTimeout(() => {
            if (this.activity === activity && activity.phase === 'listening') {
                this.abandon(activity, `sin datos tras ${this.options.listenMinutes} minutos`)
                    .catch((error) => this.report({ kind: 'error', message: error.message }));
            }
        }, this.options.listenMinutes * 60 * 1000);
        activity.listening = this.listener.start((text) => {
            this.handlePhrase(text, activity).catch((error) => this.report({ kind: 'error', message: error.message }));
        });
        return this.report({ kind: 'listening', subject: activity.subject, minutes: this.options.listenMinutes });
    }

    stopListening(activity) {
        this.clock.clearTimeout(activity.timer);
        if (activity.listening) activity.listening.stop();
        activity.listening = null;
    }

    /**
     * Analiza una frase reconocida durante la escucha activa. Las frases que
     * no aportan nada se descartan en el acto y no se guardan.
     */
    async handlePhrase(text, activity = this.activity) {
        if (!activity || this.activity !== activity || activity.phase !== 'listening') return null;

        const words = countWords(text);
        if (words < this.options.minWords) return this.report({ kind: 'phrase', used: false, reason: `frase corta (${words} ${words === 1 ? 'palabra' : 'palabras'})` });
        const phrase = words > this.options.maxWords ? limitWords(text, this.options.maxWords) : text;

        const parsed = await this.interpreter.interpret(phrase, { subject: activity.subject });
        if (this.activity !== activity || activity.phase !== 'listening') return null;

        if (parsed.groupFound) activity.groupFound = true;
        if (!parsed.typeFound) return this.report({ kind: 'phrase', used: false, reason: 'no indica ninguna actividad', words });

        this.stopListening(activity);
        activity.phase = 'waiting';
        activity.type = parsed.type;
        activity.title = parsed.title || missionTitle(parsed.type, activity.subject);
        activity.modality = activity.groupFound || parsed.modality === 'grupal' ? 'grupal' : 'individual';
        activity.transcript = parsed.transcript;
        return this.report({ kind: 'mission-ready', title: activity.title, modality: activity.modality, subject: activity.subject });
    }

    /**
     * Tarjeta del profesor que cierra la misión: se confirma y se reparten los
     * puntos. Si todavía se estaba escuchando (no se detectó el tipo de
     * actividad) pero ya ha salido algún alumno, se cierra como un ejercicio
     * individual: así el alumno no pierde sus puntos porque el reconocimiento
     * de voz no entendiera la frase.
     */
    async closeActivity() {
        const activity = this.activity;
        let defaulted = false;
        if (activity.phase === 'listening') {
            this.stopListening(activity);
            activity.phase = 'waiting';
            activity.type = 'ejercicio';
            activity.title = missionTitle('ejercicio', activity.subject);
            activity.modality = 'individual';
            defaulted = true;
        }
        if (activity.modality !== 'grupal' && activity.students.length === 0) {
            return this.discard(activity, 'no ha salido ningún alumno');
        }

        const isGroup = activity.modality === 'grupal';
        const last = activity.students[activity.students.length - 1];
        const payload = {
            ...this.missionPayload(activity),
            completedBy: isGroup ? undefined : last.id,
            attempts: isGroup ? [] : activity.students.slice(0, -1).map((s) => s.id)
        };
        this.activity = null;
        const result = await this.api.confirmMission(payload);
        return this.report({ kind: 'confirmed', mission: payload, defaulted, results: result.results || [], queued: Boolean(result.queued) });
    }

    missionPayload(activity) {
        return {
            id: activity.id,
            title: activity.title || missionTitle('ejercicio', activity.subject),
            subject: activity.subject,
            type: activity.type || 'ejercicio',
            modality: activity.modality || 'individual',
            transcript: activity.transcript,
            classroom: this.schedule.classroom,
            teacherId: this.session.teacher.id,
            substitute: this.session.substitute,
            startedAt: activity.startedAt
        };
    }

    /**
     * La misión termina sin que el profesor la confirme (tiempo de escucha
     * agotado, fin de la franja, otro profesor...). Si ya había salido algún
     * alumno, se registra como «sin confirmar» y cada uno recibe los puntos de
     * intento; si no, simplemente se descarta.
     */
    async abandon(activity, reason) {
        if (activity.students.length === 0 || !this.session) return this.discard(activity, reason);
        this.stopListening(activity);
        if (this.activity === activity) this.activity = null;
        const payload = {
            ...this.missionPayload(activity),
            confirmed: false,
            reason,
            attempts: activity.students.map((s) => s.id)
        };
        const result = await this.api.confirmMission(payload);
        return this.report({ kind: 'unconfirmed', mission: payload, reason, results: result.results || [], queued: Boolean(result.queued) });
    }

    discard(activity, reason) {
        this.stopListening(activity);
        if (this.activity === activity) this.activity = null;
        if (this.discardFile) {
            appendJson(this.discardFile, {
                at: this.clock.now().toISOString(),
                reason,
                classroom: this.schedule.classroom,
                teacherId: this.session ? this.session.teacher.id : null,
                subject: activity.subject,
                title: activity.title,
                modality: activity.modality,
                students: activity.students.map((s) => s.id)
            });
        }
        return this.report({ kind: 'discarded', reason, title: activity.title });
    }

    async endSession(reason) {
        if (this.activity) await this.abandon(this.activity, `misión sin cerrar (${reason})`);
        const { teacher } = this.session;
        this.session = null;
        return this.report({ kind: 'session-end', teacher, reason });
    }

    /** Resumen del estado para la consola. */
    status() {
        const slot = this.schedule.slotAt(this.clock.now());
        return {
            slot,
            session: this.session,
            activity: this.activity && {
                phase: this.activity.phase,
                title: this.activity.title,
                modality: this.activity.modality,
                students: this.activity.students.map((s) => s.name)
            }
        };
    }
}

module.exports = { Classroom, realClock };
