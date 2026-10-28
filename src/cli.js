/**
 * Consola del sistema en el aula.
 *
 * Una única interfaz readline atiende los comandos, las preguntas de
 * transcripción manual y los UID que escribe un lector NFC de tipo teclado,
 * evitando que varios lectores compitan por la entrada estándar.
 */

const readline = require('readline');
const { subjectLabel, SUBJECTS } = require('./missions/parser');

const PROMPT = 'aula> ';

const HELP = `
Comandos:
  <UID>                          Pasar una tarjeta (el lector USB la escribe sola)
  tarjeta <UID>                  Igual que lo anterior, escrito a mano
  escuchar                       Escuchar al profesor; si pide un voluntario se crea una misión
  misiones                       Ver misiones abiertas
  alumnos                        Ver alumnos, puntos y logros
  puntos <alumno> <n> [motivo]   Dar (o quitar) puntos a un alumno
  cerrar [idMisión]              Cerrar una misión de toda la clase (por defecto la última)
  avatar                         Ver lo que muestra el zorro
  registrar profesor <UID> <asignatura>
  registrar alumno <UID> <nombre>
  tarjetas                       Ver tarjetas registradas
  sincronizar                    Reenviar misiones guardadas sin conexión
  microfono                      Probar el micrófono y el reconocimiento de voz
  estado                         Ver la configuración y el estado del sistema
  ayuda | salir
`;

function formatMission(m) {
    const who = m.modality === 'grupal' ? 'toda la clase' : 'voluntario';
    return `${m.title} [${who}] (${m.status}) · id ${m.id}`;
}

class Cli {
    constructor({ classroom, api, nfc, recorder, recognizer, config, speak }) {
        this.classroom = classroom;
        this.api = api;
        this.nfc = nfc;
        this.recorder = recorder;
        this.recognizer = recognizer;
        this.config = config;
        this.speak = speak;
        this.waiter = null;
        this.busy = false;

        // Prompts solo con ASCII: los emojis ocupan anchos distintos según la
        // terminal y descolocan el cursor al editar la línea.
        this.rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: PROMPT });
        this.rl.on('line', (line) => this.onLine(line));
        this.rl.on('close', () => process.exit(0));
        this.nfc.on('card', (uid) => this.run(() => this.onCard(uid)));
    }

    start() {
        console.log(HELP);
        this.rl.prompt();
    }

    onLine(line) {
        if (this.waiter) {
            const resolve = this.waiter;
            this.endAsk();
            resolve(line.trim());
            return;
        }
        if (!line.trim()) return this.rl.prompt();
        this.run(() => this.dispatch(line.trim()));
    }

    /** Ejecuta una acción de una en una; lo que llegue mientras tanto se descarta. */
    async run(action) {
        if (this.busy) {
            console.log('⏳ Espera a que termine la acción en curso');
            return;
        }
        this.busy = true;
        try {
            await action();
        } catch (error) {
            console.log(`❌ ${error.message}`);
        } finally {
            this.busy = false;
            this.rl.prompt();
        }
    }

    /**
     * Pide una línea al usuario. La pregunta se pone como prompt de readline
     * para que, al borrar o corregir, readline redibuje la línea correctamente.
     */
    ask(question) {
        this.rl.setPrompt(question);
        this.rl.prompt();
        return new Promise((resolve) => { this.waiter = resolve; });
    }

    endAsk() {
        this.waiter = null;
        this.rl.setPrompt(PROMPT);
    }

    /** Graba la voz del profesor y la transcribe; si no se puede, la pide por teclado. */
    async listen() {
        if (this.recorder.available) {
            const seconds = this.config.audio.maxRecordSeconds;
            console.log(`🎤 Escuchando (máx. ${seconds} s). Pulsa ENTER cuando termines de hablar...`);
            const recording = this.recorder.record(seconds);
            const enter = this.ask('');
            const audio = await Promise.race([recording.done, enter.then(() => { recording.stop(); return recording.done; })]);
            this.endAsk();
            console.log(`📊 Audio capturado: ${audio.length} bytes`);

            const text = await this.recognizer.recognize(audio);
            if (text !== null) {
                console.log(`🗣️  Texto reconocido: "${text}"`);
                return text;
            }
        }
        return this.ask('Escribe lo que ha dicho el profesor: ');
    }

    async dispatch(line) {
        const [command, ...args] = line.split(/\s+/);
        switch (command.toLowerCase()) {
            case 'ayuda': return console.log(HELP);
            case 'salir': return this.rl.close();
            case 'tarjeta': return this.onCard(args[0] || '');
            case 'escuchar': return this.freeListen();
            case 'misiones': return this.showMissions();
            case 'alumnos': return this.showStudents();
            case 'puntos': return this.givePoints(args);
            case 'cerrar': return this.closeMission(args[0]);
            case 'avatar': return this.showAvatar();
            case 'registrar': return this.registerCard(args);
            case 'tarjetas': return this.showCards();
            case 'sincronizar': return this.sync();
            case 'microfono': return this.testMicrophone();
            case 'estado': return this.showStatus();
            default:
                // Un lector NFC de tipo teclado escribe solo el UID.
                if (args.length === 0 && this.nfc.mode === 'keyboard') return this.onCard(command);
                console.log('❓ Comando no reconocido. Escribe "ayuda".');
        }
    }

    async onCard(uid) {
        if (!uid) return console.log('Uso: tarjeta <UID>');
        const event = await this.classroom.handleCard(uid.toUpperCase());

        if (event.kind === 'teacher') {
            console.log(`👩‍🏫 Tarjeta de profesor: ${subjectLabel(event.subject)}`);
            if (!event.mission) return console.log('⭕ No se ha dicho nada; no se crea misión');
            return this.reportMission(event.mission);
        }

        const name = event.student.name;
        if (!event.result) return console.log(`🙋 ${name}: no hay misiones abiertas ahora mismo`);
        const { mission, pointsAwarded, newAchievements, student } = event.result;
        console.log(`✅ ${name} ha realizado "${mission.title}" (+${pointsAwarded} puntos, total ${student.points})`);
        this.reportAchievements(name, newAchievements);
    }

    reportMission(mission) {
        const where = mission.queued ? 'guardada sin conexión (se enviará al sincronizar)' : 'guardada';
        console.log(`🎯 Misión ${where}: ${formatMission(mission)}`);
        if (this.config.voiceResponse.enabled) {
            this.speak('Pasa tu tarjeta por el lector cuando termines', this.config.voiceResponse);
        }
    }

    reportAchievements(name, achievements) {
        for (const achievement of achievements) {
            console.log(`🏆 ¡${name} consigue el logro "${achievement.title}"! (${achievement.description})`);
        }
    }

    async freeListen() {
        const text = await this.listen();
        if (!text) return console.log('⭕ Sin transcripción');
        const mission = await this.classroom.handleTranscript(text);
        if (!mission) return console.log('🔍 La frase no pide ninguna misión');
        this.reportMission(mission);
    }

    async showMissions() {
        const open = [...await this.api.listMissions('pending'), ...await this.api.listMissions('in_progress')];
        if (open.length === 0) return console.log('📭 No hay misiones abiertas');
        open.forEach((m) => console.log(`  • ${formatMission(m)}`));
    }

    async showStudents() {
        for (const s of await this.api.listStudents()) {
            const badges = s.achievements.map((a) => a.title).join(', ') || 'sin logros';
            console.log(`  • ${s.name} (${s.id}): ${s.points} puntos · ${badges}`);
        }
    }

    async findStudent(nameOrId) {
        const wanted = (nameOrId || '').toLowerCase();
        const student = (await this.api.listStudents())
            .find((s) => s.id.toLowerCase() === wanted || s.name.toLowerCase() === wanted);
        if (!student) throw new Error(`No existe el alumno "${nameOrId}"`);
        return student;
    }

    async givePoints([who, points, ...reason]) {
        if (!who || !points) return console.log('Uso: puntos <alumno> <n> [motivo]');
        const student = await this.findStudent(who);
        const result = await this.api.reward(student.id, Number(points), reason.join(' ') || undefined);
        console.log(`⭐ ${student.name}: ${Number(points) > 0 ? '+' : ''}${points} puntos (total ${result.student.points})`);
        this.reportAchievements(student.name, result.newAchievements);
    }

    async closeMission(id) {
        let missionId = id;
        if (!missionId) {
            const open = [...await this.api.listMissions('in_progress'), ...await this.api.listMissions('pending')];
            if (open.length === 0) return console.log('📭 No hay misiones abiertas');
            missionId = open.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0].id;
        }
        const mission = await this.api.closeMission(missionId);
        console.log(`🔒 Misión cerrada: ${mission.title} (${mission.participants.length} participante/s)`);
    }

    async showAvatar() {
        const avatar = await this.api.avatar();
        console.log(`🦊 ${avatar.name}: "${avatar.message}"`);
        avatar.missions.forEach((m) => console.log(`   📜 ${formatMission(m)}`));
        console.log(`   🏅 Ranking: ${avatar.ranking.map((r) => `${r.name} ${r.points}`).join(' · ')}`);
    }

    async registerCard([role, uid, ...rest]) {
        const value = rest.join(' ');
        if (!['profesor', 'alumno'].includes(role) || !uid || !value) {
            return console.log('Uso: registrar profesor <UID> <asignatura> | registrar alumno <UID> <nombre>');
        }
        if (role === 'profesor') {
            const subject = Object.keys(SUBJECTS).find((key) => key === value.toLowerCase()) || value.toLowerCase();
            await this.api.registerCard({ uid: uid.toUpperCase(), role: 'teacher', subject });
            return console.log(`💳 Tarjeta ${uid.toUpperCase()} → profesor de ${subjectLabel(subject)}`);
        }
        const card = await this.api.registerCard({ uid: uid.toUpperCase(), role: 'student', name: value });
        console.log(`💳 Tarjeta ${card.uid} → alumno ${card.student.name}`);
    }

    async showCards() {
        for (const card of await this.api.listCards()) {
            const owner = card.role === 'teacher' ? `profesor · ${subjectLabel(card.subject)}` : `alumno · ${card.studentId}`;
            console.log(`  • ${card.uid}: ${owner}`);
        }
    }

    async sync() {
        const { sent, remaining } = await this.api.syncQueue();
        console.log(`🔄 Enviadas ${sent} misión/es pendientes; quedan ${remaining}`);
    }

    async testMicrophone() {
        if (!this.recorder.available) {
            return console.log(`🎤 Sin captura de audio en ${this.recorder.platform}: se usará transcripción manual`);
        }
        const text = await this.listen();
        console.log(text ? `✅ Reconocido: "${text}"` : '⚠️  No se reconoció texto');
    }

    async showStatus() {
        let server = 'conectado';
        try {
            await this.api.health();
        } catch (error) {
            server = `sin conexión (${error.message})`;
        }
        const queued = this.api.readQueue().length;
        console.log(`  🌐 API: ${this.config.api.url} → ${server}`);
        console.log(`  🧠 Intérprete: ${this.config.interpreter.url || 'local'}`);
        console.log(`  🎤 Micrófono: ${this.recorder.available ? `${this.recorder.platform} · ${this.config.audio.device}` : 'manual (teclado)'}`);
        console.log(`  🗣️  Reconocimiento: ${this.recognizer.status}`);
        console.log(`  💳 Lector NFC: ${this.nfc.status}`);
        console.log(`  📚 Asignatura activa: ${this.classroom.describeSubject()}`);
        console.log(`  📦 Misiones en cola sin conexión: ${queued}`);
    }
}

module.exports = { Cli };
