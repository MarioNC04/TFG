#!/usr/bin/env node
/**
 * Demo sin hardware: simula una mañana de clase con un reloj ficticio.
 * Usa el servidor simulado en memoria (no toca data/db.json) y escribe las
 * frases del profesor como si las hubiera reconocido el micrófono.
 *
 * Uso: npm run demo
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../server/store');
const { createApp } = require('../server/app');
const { ApiClient } = require('../src/api/client');
const { MissionInterpreter } = require('../src/missions/interpreter');
const { ManualListener } = require('../src/audio/listener');
const { Classroom } = require('../src/classroom');
const { describeEvent } = require('../src/messages');

// Lunes 16 de noviembre de 2026
const at = (hh, mm) => new Date(2026, 10, 16, hh, mm);

class DemoClock {
    constructor(date) { this.time = date.getTime(); this.timers = []; }
    now() { return new Date(this.time); }
    setTimeout(fn, ms) { const t = { fn, at: this.time + ms }; this.timers.push(t); return t; }
    clearTimeout(t) { this.timers = this.timers.filter((x) => x !== t); }
    setInterval() { return null; }
    clearInterval() {}
    async goTo(date, classroom) {
        this.time = date.getTime();
        const due = this.timers.filter((t) => t.at <= this.time);
        this.timers = this.timers.filter((t) => t.at > this.time);
        due.forEach((t) => t.fn());
        await classroom.tick();
    }
}

async function main() {
    const app = createApp(new Store(null));
    await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${app.address().port}/api`;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-aula-'));

    const clock = new DemoClock(at(9, 32));
    const listener = new ManualListener();
    const classroom = new Classroom({
        api: new ApiClient({ baseUrl }),
        interpreter: new MissionInterpreter({ url: `${baseUrl}/interpret` }),
        listener,
        clock,
        discardFile: path.join(tmp, 'descartadas.json')
    });
    classroom.on('event', (event) => {
        const text = describeEvent(event);
        if (text) console.log(text);
    });
    await classroom.loadSchedule();

    const time = () => clock.now().toTimeString().slice(0, 5);
    const card = async (uid) => { console.log(`\n[${time()}] 💳 ${uid}`); await classroom.handleCard(uid); };
    const says = async (text) => { console.log(`[${time()}] 🗣️  "${text}"`); await classroom.handlePhrase(text); };

    console.log('=== Demo: lunes por la mañana en el aula-1 ===');
    await card('ALU-001');
    await card('PROF-ANA');
    await says('Venga');
    await says('Sacad el cuaderno de matemáticas');
    await says('Que salga alguien a la pizarra a corregir el ejercicio');
    await card('ALU-001');
    await card('ALU-002');
    await card('PROF-ANA');

    await clock.goTo(at(9, 45), classroom);
    await card('PROF-ANA');
    await says('Ahora vamos a leer todos juntos la página doce');
    await card('PROF-ANA');

    console.log(`\n[10:00] ⏰ Cambio de franja`);
    await clock.goTo(at(10, 0), classroom);
    await card('PROF-ANA');
    await says('Abrid el libro por la página veinte');
    console.log('[10:20] ⏰ Pasan 15 minutos sin decir ninguna actividad');
    await clock.goTo(at(10, 20), classroom);

    console.log(`\n[11:00] ⏰ Cambio de franja`);
    await clock.goTo(at(11, 0), classroom);
    await card('PROF-MARTA');
    await says('Martina sal a leer el texto en voz alta');
    await card('ALU-003');
    await card('PROF-MARTA');

    console.log(`\n[12:00] ⏰ Fin de la franja`);
    await clock.goTo(at(12, 0), classroom);
    console.log(`\n[14:00] ⏰ Fin del horario`);
    await clock.goTo(at(14, 0), classroom);

    const students = await new ApiClient({ baseUrl }).listStudents();
    console.log(`\n🏅 Puntos: ${students.map((s) => `${s.name} ${s.points}`).join(' · ')}`);
    app.close();
}

main().catch((error) => {
    console.error('❌', error);
    process.exit(1);
});
