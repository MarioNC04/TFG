/**
 * Almacén de datos del servidor simulado (sustituye a la API de TecnoCRA).
 * Guarda profesores, horario, tarjetas, alumnos y misiones en un fichero JSON.
 *
 * Los puntos solo se reparten cuando llega la misión cerrada (ver
 * confirmMission). Mientras está abierta, el panel muestra entre paréntesis
 * los puntos que obtendría cada alumno si se confirmase.
 *
 * Además guarda en memoria el estado en directo del aula (sesión y misión
 * abierta) que envía el dispositivo, para mostrarlo en el panel.
 */

const fs = require('fs');
const path = require('path');
const { evaluateAchievements, CATALOG } = require('./achievements');
const { readJson, writeJsonAtomic } = require('../src/storage');

const POINTS_BY_MODALITY = { individual: 10, grupal: 5 };
// Puntos por salir a hacer una misión sin llegar a completarla.
const ATTEMPT_POINTS = 2;
const SEED_FILE = path.join(__dirname, 'seed.json');
// Durante este tiempo el zorro anuncia el último logro conseguido.
const ACHIEVEMENT_ANNOUNCE_MS = 2 * 60 * 1000;
const RECENT_MISSIONS = 5;
// Si el dispositivo no envía su estado en este tiempo, se da por desconectado.
const LIVE_STALE_MS = 90 * 1000;
const DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeDay(day) {
    return String(day).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

class Store {
    /**
     * @param {string|null} dataFile Fichero donde persistir; null = solo memoria (tests).
     */
    constructor(dataFile) {
        this.dataFile = dataFile;
        this.data = this.load();
        this.live = null;
    }

    load() {
        const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
        let data = readJson(this.dataFile, seed);
        // Datos de la primera versión (tarjetas de profesor por asignatura, sin
        // profesores): no son compatibles, se apartan como copia y se empieza
        // con el ejemplo de server/seed.json.
        const oldTeacherCards = Object.values(data.cards || {}).some((c) => c.role === 'teacher' && !c.teacherId);
        if (this.dataFile && oldTeacherCards) {
            const backup = `${this.dataFile}.antiguo-${Date.now()}`;
            fs.renameSync(this.dataFile, backup);
            console.log(`⚠️  Datos de una versión anterior apartados en ${backup}; se usa server/seed.json`);
            data = seed;
        }
        // Ficheros de datos de versiones anteriores: se completan con el ejemplo.
        for (const key of Object.keys(seed)) {
            if (data[key] === undefined) data[key] = seed[key];
        }
        return data;
    }

    // --- Estado en directo del aula -------------------------------------------

    /** El dispositivo envía su estado (sesión, misión abierta, últimos avisos). */
    setLive(state) {
        if (!state || typeof state !== 'object') throw new HttpError(400, 'Estado no válido');
        this.live = { ...state, receivedAt: Date.now() };
        return { ok: true };
    }

    getLive() {
        if (!this.live) return null;
        const ageMs = Date.now() - this.live.receivedAt;
        return { ...this.live, ageMs, stale: ageMs > LIVE_STALE_MS };
    }

    save() {
        if (this.dataFile) writeJsonAtomic(this.dataFile, this.data);
    }

    // --- Profesores y horario ------------------------------------------------

    listTeachers() {
        return this.data.teachers;
    }

    getTeacher(id) {
        const teacher = this.data.teachers.find((t) => t.id === id);
        if (!teacher) throw new HttpError(404, `Profesor ${id} no encontrado`);
        return teacher;
    }

    getSchedule() {
        return this.data.schedule;
    }

    /**
     * Sustituye el horario (lo usa el editor del panel). Se valida antes de
     * guardar: horas HH:MM, inicio anterior al fin, días válidos, profesor
     * existente y sin franjas que se solapen el mismo día.
     */
    setSchedule(schedule) {
        if (!schedule || !Array.isArray(schedule.slots)) throw new HttpError(400, 'El horario necesita una lista "slots"');
        const slots = schedule.slots.map((slot, i) => {
            const where = `Franja ${i + 1}`;
            if (!slot || !slot.start || !slot.end || !slot.teacherId || !slot.subject || !Array.isArray(slot.days)) {
                throw new HttpError(400, `${where}: necesita días, hora de inicio y de fin, profesor y asignatura`);
            }
            if (!TIME.test(slot.start) || !TIME.test(slot.end)) throw new HttpError(400, `${where}: las horas deben tener el formato HH:MM`);
            if (slot.start >= slot.end) throw new HttpError(400, `${where}: la hora de inicio debe ser anterior a la de fin`);
            const days = [...new Set(slot.days.map(normalizeDay))];
            if (days.length === 0) throw new HttpError(400, `${where}: elige al menos un día`);
            const wrong = days.find((d) => !DAYS.includes(d));
            if (wrong) throw new HttpError(400, `${where}: día no válido "${wrong}"`);
            this.getTeacher(slot.teacherId);
            return { days, start: slot.start, end: slot.end, teacherId: slot.teacherId, subject: String(slot.subject) };
        });

        for (let a = 0; a < slots.length; a++) {
            for (let b = a + 1; b < slots.length; b++) {
                const day = slots[a].days.find((d) => slots[b].days.includes(d));
                if (day && slots[a].start < slots[b].end && slots[b].start < slots[a].end) {
                    throw new HttpError(400, `Las franjas ${a + 1} y ${b + 1} se solapan el ${day}`);
                }
            }
        }
        slots.sort((x, y) => x.start.localeCompare(y.start));

        // Franjas horarias del cuadro (filas de la tabla del panel), aunque estén vacías.
        const periods = new Map();
        for (const [i, p] of (Array.isArray(schedule.periods) ? schedule.periods : []).entries()) {
            if (!p || !TIME.test(p.start) || !TIME.test(p.end)) throw new HttpError(400, `Hora ${i + 1}: las horas deben tener el formato HH:MM`);
            if (p.start >= p.end) throw new HttpError(400, `Hora ${i + 1}: la hora de inicio debe ser anterior a la de fin`);
            periods.set(`${p.start}-${p.end}`, { start: p.start, end: p.end });
        }
        for (const s of slots) periods.set(`${s.start}-${s.end}`, { start: s.start, end: s.end });
        const sortedPeriods = [...periods.values()].sort((x, y) => x.start.localeCompare(y.start) || x.end.localeCompare(y.end));

        this.data.schedule = { classroom: schedule.classroom || this.data.schedule.classroom, periods: sortedPeriods, slots };
        this.save();
        return this.data.schedule;
    }

    // --- Tarjetas -----------------------------------------------------------

    getCard(uid) {
        const card = this.data.cards[uid];
        if (!card) throw new HttpError(404, `Tarjeta ${uid} no registrada`);
        const result = { uid, ...card };
        if (card.role === 'student') result.student = this.getStudent(card.studentId);
        if (card.role === 'teacher') result.teacher = this.getTeacher(card.teacherId);
        return result;
    }

    listCards() {
        return Object.entries(this.data.cards).map(([uid, card]) => ({ uid, ...card }));
    }

    registerCard(uid, { role, name, subjects }) {
        if (!uid) throw new HttpError(400, 'Falta el UID de la tarjeta');
        if (!name) throw new HttpError(400, 'Falta el nombre del titular de la tarjeta');

        if (role === 'teacher') {
            let teacher = this.data.teachers.find((t) => t.name.toLowerCase() === name.toLowerCase());
            if (!teacher) {
                teacher = { id: `prof-${Date.now()}`, name, subjects: [] };
                this.data.teachers.push(teacher);
            }
            if (Array.isArray(subjects) && subjects.length > 0) teacher.subjects = subjects;
            this.data.cards[uid] = { role, teacherId: teacher.id };
        } else if (role === 'student') {
            let student = this.data.students.find((s) => s.name.toLowerCase() === name.toLowerCase());
            if (!student) {
                student = { id: `alu-${Date.now()}`, name, points: 0, achievements: [], history: [] };
                this.data.students.push(student);
            }
            this.data.cards[uid] = { role, studentId: student.id };
        } else {
            throw new HttpError(400, 'El rol debe ser "teacher" o "student"');
        }
        this.save();
        return this.getCard(uid);
    }

    // --- Alumnos ------------------------------------------------------------

    listStudents() {
        return this.data.students;
    }

    getStudent(id) {
        const student = this.data.students.find((s) => s.id === id);
        if (!student) throw new HttpError(404, `Alumno ${id} no encontrado`);
        return student;
    }

    reward(studentId, points, reason) {
        const amount = Number(points);
        if (!Number.isFinite(amount) || amount === 0) throw new HttpError(400, 'Los puntos deben ser un número distinto de 0');
        const student = this.getStudent(studentId);
        student.points += amount;
        student.history.push({ points: amount, reason: reason || 'Recompensa del profesor', at: new Date().toISOString() });
        const newAchievements = this.refreshAchievements(student);
        this.save();
        return { student, newAchievements };
    }

    refreshAchievements(student) {
        const completed = this.data.missions.filter((m) => m.participants.includes(student.id));
        const owned = new Set(student.achievements.map((a) => a.id));
        const fresh = evaluateAchievements(student, completed)
            .filter((a) => !owned.has(a.id))
            .map((a) => ({ ...a, earnedAt: new Date().toISOString() }));
        student.achievements.push(...fresh);
        return fresh;
    }

    // --- Misiones -----------------------------------------------------------

    listMissions() {
        return this.data.missions;
    }

    getMission(id) {
        const mission = this.data.missions.find((m) => m.id === id);
        if (!mission) throw new HttpError(404, `Misión ${id} no encontrada`);
        return mission;
    }

    /**
     * Registra una misión y reparte los puntos. Los puntos solo se dan aquí,
     * nunca antes:
     *  - individual confirmada por el profesor: `completedBy` la completa
     *    (10 puntos) y los alumnos de `attempts` salieron sin completarla
     *    (2 puntos, no cuentan para logros);
     *  - grupal confirmada: todos los alumnos de la clase reciben 5 puntos;
     *  - sin confirmar (`confirmed: false`, la misión se cerró sola por tiempo
     *    o por fin de la sesión): nadie la completa, pero los alumnos que
     *    salieron (`attempts`) reciben los 2 puntos de intento.
     *
     * Si llega dos veces la misma misión (reenvío de la cola sin conexión) se
     * devuelve la ya registrada sin volver a dar puntos.
     */
    confirmMission({ id, title, subject, type, modality, transcript, classroom, teacherId, substitute, startedAt, completedBy, attempts, confirmed = true, reason }) {
        if (!title) throw new HttpError(400, 'La misión necesita un título');
        if (!teacherId) throw new HttpError(400, 'La misión necesita el profesor que la confirma');
        this.getTeacher(teacherId);

        if (id) {
            const existing = this.data.missions.find((m) => m.id === id);
            if (existing) return { mission: existing, results: [], duplicate: true };
        }

        const isConfirmed = confirmed !== false;
        const isGroup = modality === 'grupal';
        let participants = [];
        let attemptIds = [...new Set(attempts || [])];
        if (!isConfirmed) {
            if (attemptIds.length === 0) throw new HttpError(400, 'Una misión sin confirmar solo se registra si salió algún alumno');
        } else if (isGroup) {
            participants = this.data.students.map((s) => s.id);
            attemptIds = [];
        } else {
            if (!completedBy) throw new HttpError(400, 'Una misión individual necesita el alumno que la completó');
            participants = [completedBy];
            attemptIds = attemptIds.filter((s) => s !== completedBy);
        }
        [...participants, ...attemptIds].forEach((studentId) => this.getStudent(studentId));

        const now = new Date().toISOString();
        const mission = {
            id: id || `mision-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            title,
            subject: subject || null,
            type: type || 'ejercicio',
            modality: isGroup ? 'grupal' : 'individual',
            transcript: transcript || '',
            classroom: classroom || this.data.schedule.classroom || null,
            teacherId,
            substitute: Boolean(substitute),
            status: isConfirmed ? 'completed' : 'unconfirmed',
            reason: isConfirmed ? undefined : (reason || 'sin confirmar'),
            participants,
            attempts: attemptIds,
            startedAt: startedAt || now,
            confirmedAt: now
        };
        this.data.missions.push(mission);

        const results = [];
        for (const studentId of participants) {
            results.push(this.award(studentId, POINTS_BY_MODALITY[mission.modality], mission.title, mission.id, 'completada'));
        }
        for (const studentId of attemptIds) {
            results.push(this.award(studentId, ATTEMPT_POINTS, `Intento: ${mission.title}`, mission.id, 'intento'));
        }
        this.save();
        return { mission, results };
    }

    award(studentId, points, reason, missionId, outcome) {
        const student = this.getStudent(studentId);
        student.points += points;
        student.history.push({ points, reason, missionId, at: new Date().toISOString() });
        const newAchievements = outcome === 'completada' ? this.refreshAchievements(student) : [];
        return { student, outcome, pointsAwarded: points, newAchievements };
    }

    /**
     * Empieza de cero (por ejemplo, un nuevo trimestre): puntos a 0, sin
     * historial ni logros, y sin misiones registradas. Se conservan los
     * alumnos, los profesores, las tarjetas y el horario.
     */
    resetProgress() {
        const missions = this.data.missions.length;
        for (const student of this.data.students) {
            student.points = 0;
            student.achievements = [];
            student.history = [];
        }
        this.data.missions = [];
        this.save();
        return { ok: true, students: this.data.students.length, missions };
    }

    /** Logros que existen, cómo se consiguen y qué alumnos los tienen. */
    listAchievements() {
        return CATALOG.map((item) => {
            const holders = [];
            for (const student of this.data.students) {
                for (const a of student.achievements) {
                    const match = item.id === 'experto' ? a.id.startsWith('experto-') : a.id === item.id;
                    if (match) holders.push({ name: student.name, title: a.title });
                }
            }
            return { ...item, holders };
        });
    }

    // --- Avatar -------------------------------------------------------------

    /** Estado del avatar (el zorro): últimas misiones, logros recientes y ranking. */
    avatar() {
        const recentMissions = [...this.data.missions]
            .sort((a, b) => (b.confirmedAt || '').localeCompare(a.confirmedAt || ''))
            .slice(0, RECENT_MISSIONS);
        const recentAchievements = this.data.students
            .flatMap((s) => s.achievements.map((a) => ({ ...a, student: s.name })))
            .sort((a, b) => b.earnedAt.localeCompare(a.earnedAt))
            .slice(0, 5);
        const ranking = [...this.data.students]
            .sort((a, b) => b.points - a.points)
            .map(({ id, name, points }) => ({ id, name, points }));

        const last = recentAchievements[0];
        const lastIsFresh = last && Date.now() - Date.parse(last.earnedAt) < ACHIEVEMENT_ANNOUNCE_MS;

        let message = '¡Hola! Estoy esperando nuevas misiones.';
        if (lastIsFresh) {
            message = `¡${last.student} ha conseguido el logro "${last.title}"!`;
        } else if (recentMissions.length > 0) {
            message = `La última misión fue "${recentMissions[0].title}". ¡Seguid así!`;
        }

        return { name: 'Zorro', message, missions: recentMissions, recentAchievements, ranking, live: this.getLive() };
    }
}

module.exports = { Store, HttpError, POINTS_BY_MODALITY, ATTEMPT_POINTS };
