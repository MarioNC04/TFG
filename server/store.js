/**
 * Almacén de datos del servidor simulado (sustituye a la API de TecnoCRA).
 * Guarda tarjetas, alumnos y misiones en un fichero JSON.
 */

const fs = require('fs');
const path = require('path');
const { evaluateAchievements } = require('./achievements');

const POINTS_BY_MODALITY = { individual: 10, grupal: 5 };
// Puntos por salir a hacer una misión sin llegar a completarla.
const ATTEMPT_POINTS = 2;
const SEED_FILE = path.join(__dirname, 'seed.json');
// Durante este tiempo el zorro anuncia el último logro conseguido.
const ACHIEVEMENT_ANNOUNCE_MS = 2 * 60 * 1000;

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
        if (this.dataFile && fs.existsSync(this.dataFile)) {
            return JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
        }
        return JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
    }

    save() {
        if (!this.dataFile) return;
        fs.mkdirSync(path.dirname(this.dataFile), { recursive: true });
        fs.writeFileSync(this.dataFile, JSON.stringify(this.data, null, 2));
    }

    // --- Tarjetas -----------------------------------------------------------

    getCard(uid) {
        const card = this.data.cards[uid];
        if (!card) throw new HttpError(404, `Tarjeta ${uid} no registrada`);
        const result = { uid, ...card };
        if (card.role === 'student') result.student = this.getStudent(card.studentId);
        return result;
    }

    listCards() {
        return Object.entries(this.data.cards).map(([uid, card]) => ({ uid, ...card }));
    }

    registerCard(uid, { role, subject, name }) {
        if (!uid) throw new HttpError(400, 'Falta el UID de la tarjeta');
        if (role === 'teacher') {
            if (!subject) throw new HttpError(400, 'Una tarjeta de profesor necesita asignatura');
            this.data.cards[uid] = { role, name: name || `Tarjeta de ${subject}`, subject };
        } else if (role === 'student') {
            if (!name) throw new HttpError(400, 'Una tarjeta de alumno necesita el nombre del alumno');
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

    listMissions(status) {
        const missions = this.data.missions;
        return status ? missions.filter((m) => m.status === status) : missions;
    }

    getMission(id) {
        const mission = this.data.missions.find((m) => m.id === id);
        if (!mission) throw new HttpError(404, `Misión ${id} no encontrada`);
        return mission;
    }

    createMission({ title, subject, type, modality, transcript, source }) {
        if (!title) throw new HttpError(400, 'La misión necesita un título');
        const mission = {
            id: `mision-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            title,
            subject: subject || null,
            type: type || 'ejercicio',
            modality: modality === 'grupal' ? 'grupal' : 'individual',
            transcript: transcript || '',
            source: source || 'voz',
            status: 'pending',
            // Las misiones se guardan sin avisar a los alumnos: el profesor decide cuándo.
            notification: false,
            participants: [],
            createdAt: new Date().toISOString(),
            completedAt: null
        };
        this.data.missions.push(mission);
        this.save();
        return mission;
    }

    /**
     * Registra que un alumno ha realizado una misión. Las individuales se
     * cierran con el primer alumno; las grupales suman participantes hasta que
     * el profesor las cierra.
     */
    completeMission(missionId, studentId) {
        const mission = this.getMission(missionId);
        const student = this.getStudent(studentId);
        if (mission.status === 'completed') throw new HttpError(409, 'La misión ya está completada');
        if (mission.participants.includes(student.id) || (mission.attempts || []).includes(student.id)) {
            throw new HttpError(409, `${student.name} ya participó en esta misión`);
        }

        mission.participants.push(student.id);
        if (mission.modality === 'individual') {
            mission.status = 'completed';
            mission.completedAt = new Date().toISOString();
        } else {
            mission.status = 'in_progress';
        }

        const pointsAwarded = POINTS_BY_MODALITY[mission.modality];
        student.points += pointsAwarded;
        student.history.push({ points: pointsAwarded, reason: mission.title, missionId: mission.id, at: new Date().toISOString() });
        const newAchievements = this.refreshAchievements(student);
        this.save();
        return { mission, student, pointsAwarded, newAchievements };
    }

    /**
     * Registra que un alumno salió a hacer la misión pero no la completó.
     * Recibe menos puntos, no cuenta para los logros y la misión sigue abierta
     * para que la intente otro alumno.
     */
    attemptMission(missionId, studentId) {
        const mission = this.getMission(missionId);
        const student = this.getStudent(studentId);
        if (mission.status === 'completed') throw new HttpError(409, 'La misión ya está completada');
        mission.attempts = mission.attempts || [];
        if (mission.participants.includes(student.id) || mission.attempts.includes(student.id)) {
            throw new HttpError(409, `${student.name} ya participó en esta misión`);
        }

        mission.attempts.push(student.id);
        student.points += ATTEMPT_POINTS;
        student.history.push({ points: ATTEMPT_POINTS, reason: `Intento: ${mission.title}`, missionId: mission.id, at: new Date().toISOString() });
        this.save();
        return { mission, student, pointsAwarded: ATTEMPT_POINTS };
    }

    closeMission(missionId) {
        const mission = this.getMission(missionId);
        mission.status = 'completed';
        mission.completedAt = mission.completedAt || new Date().toISOString();
        this.save();
        return mission;
    }

    // --- Avatar -------------------------------------------------------------

    /** Estado del avatar (el zorro): misiones abiertas, logros recientes y ranking. */
    avatar() {
        const open = this.data.missions.filter((m) => m.status !== 'completed');
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
        } else if (open.length > 0) {
            message = `Tenemos ${open.length} misión(es) abierta(s). ¿Quién se anima?`;
        }

        return { name: 'Zorro', message, missions: open, recentAchievements, ranking };
    }
}

module.exports = { Store, HttpError, POINTS_BY_MODALITY, ATTEMPT_POINTS };
