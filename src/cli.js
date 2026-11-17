/**
 * Consola del sistema en el aula.
 *
 * Una única interfaz readline atiende los comandos, los UID que escribe un
 * lector NFC de tipo teclado y, si no hay micrófono, las frases del profesor
 * escritas a mano. Lo que ocurre en el aula llega como eventos de Classroom.
 */

const readline = require('readline');
const { subjectLabel, SUBJECTS } = require('./missions/parser');
const { describeEvent, modalityLabel } = require('./messages');

const PROMPT = 'aula> ';

const HELP = `
Comandos:
  <UID>                          Pasar una tarjeta (el lector USB la escribe sola)
  tarjeta <UID>                  Igual que lo anterior, escrito a mano
  <frase>                        Sin micrófono: lo que dice el profesor mientras se escucha
  estado                         Sesión, franja y misión en curso
  horario [actualizar]           Horario de hoy (o volver a descargarlo)
  misiones                       Últimas misiones registradas
  alumnos                        Alumnos, puntos y logros
  puntos <alumno> <n> [motivo]   Dar (o quitar) puntos a un alumno
  avatar                         Ver lo que muestra el zorro
  registrar profesor <UID> <nombre> [asig1,asig2]
  registrar alumno <UID> <nombre>
  tarjetas                       Ver tarjetas registradas
  sincronizar                    Reenviar misiones guardadas sin conexión
  microfono [segundos]           Probar la escucha y el reconocimiento de voz
  ayuda | salir
`;

class Cli {
    constructor({ classroom, api, nfc, listener, config, speak }) {
        this.classroom = classroom;
        this.api = api;
        this.nfc = nfc;
        this.listener = listener;
        this.config = config;
        this.speak = speak;
        this.busy = false;
        this.rl = null;
        this.queue = Promise.resolve();

        // Una tarjeta pasada dos veces seguidas por el lector se ignora mientras
        // se atiende la primera.
        this.nfc.on('card', (uid) => {
            if (this.busy) return this.say('⏳ Espera a que termine la acción en curso');
            this.enqueue(() => this.onCard(uid));
        });
        this.classroom.on('event', (event) => this.printEvent(event));
    }

    /** Se llama cuando el sistema ya ha arrancado, para no perder lo que se escriba antes. */
    start() {
        // Prompt solo con ASCII: los emojis ocupan anchos distintos según la
        // terminal y descolocan el cursor al editar la línea.
        this.rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: PROMPT });
        this.rl.on('line', (line) => this.onLine(line));
        this.rl.on('close', () => this.queue.then(() => process.exit(0)));
        console.log(HELP);
        this.rl.prompt();
    }

    /** Escribe un mensaje sin romper la línea que se esté escribiendo. */
    say(message) {
        if (this.busy || !this.rl) return console.log(message);
        process.stdout.write('\r\x1b[K');
        console.log(message);
        this.rl.prompt(true);
    }

    onLine(line) {
        if (!line.trim()) return this.rl.prompt();
        this.enqueue(() => this.dispatch(line.trim()));
    }

    /** Las acciones se atienden de una en una, en el orden en que llegan. */
    enqueue(action) {
        this.queue = this.queue.then(() => this.run(action));
        return this.queue;
    }

    async run(action) {
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

    async dispatch(line) {
        const [command, ...args] = line.split(/\s+/);
        switch (command.toLowerCase()) {
            case 'ayuda': return console.log(HELP);
            case 'salir': return this.rl.close();
            case 'tarjeta': return this.onCard(args[0] || '');
            case 'estado': return this.showStatus();
            case 'horario': return this.showSchedule(args[0]);
            case 'misiones': return this.showMissions();
            case 'alumnos': return this.showStudents();
            case 'puntos': return this.givePoints(args);
            case 'avatar': return this.showAvatar();
            case 'registrar': return this.registerCard(args);
            case 'tarjetas': return this.showCards();
            case 'sincronizar': return this.sync();
            case 'microfono': return this.testMicrophone(Number(args[0]) || 20);
            default:
                // Un lector NFC de tipo teclado escribe solo el UID.
                if (args.length === 0 && this.nfc.mode === 'keyboard') return this.onCard(command);
                // Sin micrófono, las frases del profesor se escriben a mano.
                if (this.listener.feed && this.listener.active) return this.listener.feed(line);
                if (this.listener.feed) return console.log('❓ Comando no reconocido. Si es lo que dice el profesor, primero tiene que pasar su tarjeta.');
                console.log('❓ Comando no reconocido. Escribe "ayuda".');
        }
    }

    async onCard(uid) {
        if (!uid) return console.log('Uso: tarjeta <UID>');
        await this.classroom.handleCard(uid.toUpperCase());
    }

    printEvent(event) {
        if (event.kind === 'mission-ready' && this.config.voiceResponse.enabled) {
            this.speak('Misión preparada', this.config.voiceResponse);
        }
        const lines = describeEvent(event, { manual: Boolean(this.listener.feed) });
        if (lines) this.say(lines);
    }

    async showStatus() {
        let server = 'conectado';
        try {
            await this.api.health();
        } catch (error) {
            server = `sin conexión (${error.message})`;
        }
        const { slot, session, activity } = this.classroom.status();
        console.log(`  🌐 API: ${this.config.api.url} → ${server}`);
        console.log(`  🎤 Escucha: ${this.listener.name}`);
        console.log(`  💳 Lector NFC: ${this.nfc.status}`);
        console.log(`  🕘 Franja actual: ${slot ? `${slot.start}-${slot.end} · ${subjectLabel(slot.subject)} (${slot.teacherId})` : 'ninguna'}`);
        console.log(`  👩‍🏫 Sesión: ${session ? `${session.teacher.name} · ${subjectLabel(session.subject)}${session.substitute ? ' (sustituto)' : ''}` : 'cerrada'}`);
        if (activity) {
            const what = activity.phase === 'listening' ? 'escuchando al profesor' : `${activity.title} [${modalityLabel(activity.modality)}]`;
            const who = activity.students.length ? ` · han salido: ${activity.students.join(', ')}` : '';
            console.log(`  🎯 Misión en curso: ${what}${who}`);
        }
        console.log(`  📦 Misiones en cola sin conexión: ${this.api.readQueue().length}`);
    }

    async showSchedule(action) {
        if (action === 'actualizar') {
            console.log(`📅 Horario cargado desde: ${await this.classroom.loadSchedule()}`);
        }
        const today = this.classroom.schedule.slotsOn(this.classroom.clock.now());
        if (today.length === 0) return console.log('📅 Hoy no hay clases en el horario');
        let names = {};
        try {
            names = Object.fromEntries((await this.api.listTeachers()).map((t) => [t.id, t.name]));
        } catch (error) {
            // sin conexión: se muestran los identificadores
        }
        const current = this.classroom.status().slot;
        for (const s of today) {
            const mark = current && s.start === current.start ? '▶' : ' ';
            console.log(`  ${mark} ${s.start}-${s.end}  ${subjectLabel(s.subject)} · ${names[s.teacherId] || s.teacherId}`);
        }
    }

    async showMissions() {
        const missions = (await this.api.listMissions()).slice(-10).reverse();
        if (missions.length === 0) return console.log('📭 Todavía no hay misiones registradas');
        for (const m of missions) {
            const time = new Date(m.confirmedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            const attempts = m.attempts && m.attempts.length ? ` · ${m.attempts.length} intento/s` : '';
            console.log(`  • ${time} ${m.title} [${modalityLabel(m.modality)}] · ${m.participants.length} completada/s${attempts}`);
        }
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
        for (const a of result.newAchievements) console.log(`🏆 ¡${student.name} consigue el logro "${a.title}"! (${a.description})`);
    }

    async showAvatar() {
        const avatar = await this.api.avatar();
        console.log(`🦊 ${avatar.name}: "${avatar.message}"`);
        avatar.missions.forEach((m) => console.log(`   📜 ${m.title} [${modalityLabel(m.modality)}]`));
        console.log(`   🏅 Ranking: ${avatar.ranking.map((r) => `${r.name} ${r.points}`).join(' · ')}`);
    }

    async registerCard([role, uid, ...rest]) {
        if (!['profesor', 'alumno'].includes(role) || !uid || rest.length === 0) {
            return console.log('Uso: registrar profesor <UID> <nombre> [asig1,asig2] | registrar alumno <UID> <nombre>');
        }
        if (role === 'profesor') {
            // Si la última palabra es una lista de asignaturas conocidas, se separa del nombre.
            const last = rest[rest.length - 1].toLowerCase().split(',');
            const hasSubjects = rest.length > 1 && last.every((s) => SUBJECTS[s]);
            const name = (hasSubjects ? rest.slice(0, -1) : rest).join(' ');
            const card = await this.api.registerCard({ uid: uid.toUpperCase(), role: 'teacher', name, subjects: hasSubjects ? last : undefined });
            const subjects = card.teacher.subjects.map(subjectLabel).join(', ') || 'sin asignaturas';
            return console.log(`💳 Tarjeta ${card.uid} → profesor ${card.teacher.name} (${subjects})`);
        }
        const card = await this.api.registerCard({ uid: uid.toUpperCase(), role: 'student', name: rest.join(' ') });
        console.log(`💳 Tarjeta ${card.uid} → alumno ${card.student.name}`);
    }

    async showCards() {
        for (const card of await this.api.listCards()) {
            const owner = card.role === 'teacher' ? `profesor · ${card.teacherId}` : `alumno · ${card.studentId}`;
            console.log(`  • ${card.uid}: ${owner}`);
        }
    }

    async sync() {
        const { sent, remaining } = await this.api.syncQueue();
        console.log(`🔄 Enviadas ${sent} misión/es pendientes; quedan ${remaining}`);
    }

    /** Escucha durante unos segundos y muestra las frases reconocidas, sin crear misiones. */
    async testMicrophone(seconds) {
        if (this.listener.feed) {
            return console.log(`🎤 Escucha manual: ${this.listener.name}. Revisa "estado" y la configuración de speech.`);
        }
        if (this.classroom.activity) return console.log('⏳ Hay una misión en curso; prueba el micrófono cuando termine');
        console.log(`🎤 Escuchando ${seconds} s con ${this.listener.name}. Habla con normalidad...`);
        let count = 0;
        const listening = this.listener.start((text) => {
            count++;
            console.log(`   🗣️  "${text}"`);
        });
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
        listening.stop();
        console.log(count ? `✅ ${count} frase/s reconocida/s` : '⚠️  No se reconoció ninguna frase');
    }
}

module.exports = { Cli };
