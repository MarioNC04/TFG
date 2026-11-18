#!/usr/bin/env node
/**
 * Demo sin hardware: simula una mañana de clase con un reloj ficticio y
 * escribe las frases del profesor como si las hubiera reconocido el micrófono.
 *
 * Si el servidor (npm run server) está en marcha, la demo trabaja contra él:
 * las misiones, puntos y logros se guardan de verdad y el panel de
 * http://localhost:3000 se va actualizando paso a paso. Si no está en marcha,
 * usa un servidor en memoria que no guarda nada.
 *
 * La demo usa siempre el horario de ejemplo (server/seed.json) sin modificar
 * el horario guardado en el servidor.
 *
 * Uso: npm run demo                 (con el servidor si está en marcha)
 *      npm run demo -- --memoria    (no toca los datos del servidor)
 *      npm run demo -- --rapido     (sin pausas entre pasos)
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
const { loadConfig } = require('../src/config');
const { LiveReporter } = require('../src/live');
const seed = require('../server/seed.json');

const args = process.argv.slice(2);
const STEP_MS = 2000;

/** Devuelve la URL de la API del servidor real si responde. */
async function runningServer() {
    if (args.includes('--memoria')) return null;
    const url = loadConfig().api.url.replace(/\/$/, '');
    try {
        const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1000) });
        return res.ok ? url : null;
    } catch (error) {
        return null;
    }
}

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
    let app = null;
    let baseUrl = await runningServer();
    const live = Boolean(baseUrl);
    if (!live) {
        app = createApp(new Store(null));
        await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
        baseUrl = `http://127.0.0.1:${app.address().port}/api`;
    }
    const pause = live && !args.includes('--rapido') ? () => new Promise((r) => setTimeout(r, STEP_MS)) : async () => {};
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-aula-'));

    const clock = new DemoClock(at(9, 32));
    const listener = new ManualListener();
    const api = new ApiClient({ baseUrl });
    const classroom = new Classroom({
        api,
        interpreter: new MissionInterpreter({ url: `${baseUrl}/interpret` }),
        listener,
        clock,
        // El horario de la demo es fijo: no se recarga el del servidor.
        options: { scheduleRefreshSeconds: Infinity },
        discardFile: path.join(tmp, 'descartadas.json')
    });
    classroom.on('event', (event) => {
        const text = describeEvent(event);
        if (text) console.log(text);
    });
    classroom.useSchedule(seed.schedule);
    const reporter = new LiveReporter(classroom, api);
    await reporter.start();

    const time = () => clock.now().toTimeString().slice(0, 5);
    const card = async (uid) => {
        await pause();
        console.log(`\n[${time()}] 💳 ${uid}`);
        try {
            await classroom.handleCard(uid);
        } catch (error) {
            console.log(`❌ ${error.message}${error.status === 404 ? ' (la demo usa las tarjetas de ejemplo de server/seed.json)' : ''}`);
        }
    };
    const says = async (text) => { await pause(); console.log(`[${time()}] 🗣️  "${text}"`); await classroom.handlePhrase(text); };

    if (live) {
        console.log(`📡 Usando el servidor de ${baseUrl.replace(/\/api$/, '')}: abre el panel en el navegador para ver cómo se actualiza.`);
        console.log('   Las misiones, puntos y logros se guardan en sus datos (usa --memoria para no tocarlos).\n');
    } else {
        console.log('💡 El servidor no está en marcha: la demo usa uno en memoria y no se verá en el panel.');
        console.log('   Arranca "npm run server" en otra terminal para verla en http://localhost:3000\n');
    }
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
    reporter.stop();
    await reporter.send();
    if (app) app.close();
}

main().catch((error) => {
    console.error('❌', error);
    process.exit(1);
});
