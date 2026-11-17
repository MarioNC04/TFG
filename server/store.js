/**
 * Almacén de datos del servidor simulado (sustituye a la API de TecnoCRA).
 * Guarda profesores, horario, tarjetas, alumnos y misiones en un fichero JSON.
 *
 * Las misiones solo llegan aquí cuando el profesor las ha cerrado con su
 * tarjeta: el dispositivo del aula envía de una vez la misión, quién la
 * completó y quién lo intentó. Lo que no se confirma nunca sale del aula.
 */

const fs = require('fs');
const path = require('path');
const { evaluateAchievements } = require('./achievements');
const { readJson, writeJsonAtomic } = require('../src/storage');

const POINTS_BY_MODALITY = { individual: 10, grupal: 5 };
// Puntos por salir a hacer una misión sin llegar a completarla.
const ATTEMPT_POINTS = 2;
const SEED_FILE = path.join(__dirname, 'seed.json');
// Durante este tiempo el zorro anuncia el último logro conseguido.
const ACHIEVEMENT_ANNOUNCE_MS = 2 * 60 * 1000;
const RECENT_MISSIONS = 5;

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
    }

    load() {
        const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
        const data = readJson(this.dataFile, seed);
        // Ficheros de datos de versiones anteriores: se completan con el ejemplo.
        for (const key of Object.keys(seed)) {
            if (data[key] === undefined) data[key] = seed[key];
        }
        return data;
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

    setSchedule(schedule) {
        if (!schedule || !Array.isArray(schedule.slots)) throw new HttpError(400, 'El horario necesita una lista "slots"');
        for (const slot of schedule.slots) {
            if (!slot.start || !slot.end || !slot.teacherId || !slot.subject || !Array.isArray(slot.days)) {
                throw new HttpError(400, 'Cada franja necesita days, start, end, teacherId y subject');
            }
            this.getTeacher(slot.teacherId);
        }
        this.data.schedule = { classroom: schedule.classroom || this.data.schedule.classroom, slots: schedule.slots };
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
     * Registra una misión que el profesor ha cerrado con su tarjeta y reparte
     * los puntos:
     *  - individual: `completedBy` la completa (10 puntos) y los alumnos de
     *    `attempts` salieron sin completarla (2 puntos, no cuentan para logros);
     *  - grupal: todos los alumnos de la clase reciben 5 puntos.
     *
     * Si llega dos veces la misma misión (reenvío de la cola sin conexión) se
     * devuelve la ya registrada sin volver a dar puntos.
     */
    confirmMission({ id, title, subject, type, modality, transcript, classroom, teacherId, substitute, startedAt, completedBy, attempts }) {
        if (!title) throw new HttpError(400, 'La misión necesita un título');
        if (!teacherId) throw new HttpError(400, 'La misión necesita el profesor que la confirma');
        this.getTeacher(teacherId);

        if (id) {
            const existing = this.data.missions.find((m) => m.id === id);
            if (existing) return { mission: existing, results: [], duplicate: true };
        }

        const isGroup = modality === 'grupal';
        const attemptIds = isGroup ? [] : [...new Set(attempts || [])].filter((s) => s !== completedBy);
        let participants;
        if (isGroup) {
            participants = this.data.students.map((s) => s.id);
        } else {
            if (!completedBy) throw new HttpError(400, 'Una misión individual necesita el alumno que la completó');
            participants = [completedBy];
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
            status: 'completed',
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

        return { name: 'Zorro', message, missions: recentMissions, recentAchievements, ranking };
    }
}

module.exports = { Store, HttpError, POINTS_BY_MODALITY, ATTEMPT_POINTS };
