const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../server/store');
const { createApp } = require('../server/app');
const { ApiClient } = require('../src/api/client');
const { MissionInterpreter } = require('../src/missions/interpreter');
const { Classroom } = require('../src/classroom');

/** Reloj simulado: el lunes 16/11/2026 a la hora indicada. */
class FakeClock {
    constructor(hh, mm) {
        this.time = new Date(2026, 10, 16, hh, mm).getTime();
        this.timers = [];
    }
    now() { return new Date(this.time); }
    setTimeout(fn, ms) { const t = { fn, at: this.time + ms }; this.timers.push(t); return t; }
    clearTimeout(t) { this.timers = this.timers.filter((x) => x !== t); }
    setInterval() { return null; }
    clearInterval() {}
    set(hh, mm) { this.advance(new Date(2026, 10, 16, hh, mm).getTime() - this.time); }
    advance(ms) {
        this.time += ms;
        const due = this.timers.filter((t) => t.at <= this.time);
        this.timers = this.timers.filter((t) => t.at > this.time);
        due.forEach((t) => t.fn());
    }
}

class FakeListener {
    constructor() { this.active = false; this.starts = 0; }
    start() { this.active = true; this.starts++; return { stop: () => { this.active = false; } }; }
}

async function setup(t, { hh = 9, mm = 5, options = {} } = {}) {
    const app = createApp(new Store(null), { defaultSubject: 'matematicas' });
    await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
    t.after(() => app.close());
    const baseUrl = `http://127.0.0.1:${app.address().port}/api`;

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aula-'));
    const api = new ApiClient({ baseUrl });
    const clock = new FakeClock(hh, mm);
    const listener = new FakeListener();
    const classroom = new Classroom({
        api,
        interpreter: new MissionInterpreter({ url: `${baseUrl}/interpret` }),
        listener,
        clock,
        options,
        discardFile: path.join(dir, 'descartadas.json'),
        scheduleCacheFile: path.join(dir, 'horario.json')
    });
    const events = [];
    classroom.on('event', (e) => events.push(e));
    await classroom.loadSchedule();
    return { api, classroom, clock, listener, events, dir };
}

const kinds = (events) => events.map((e) => e.kind);
const discarded = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'descartadas.json'), 'utf8'));

test('flujo individual: el profesor empieza, sale un alumno que falla, otro la completa y el profesor la cierra', async (t) => {
    const { api, classroom, listener, events } = await setup(t);

    const start = await classroom.handleCard('PROF-ANA');
    assert.equal(start.kind, 'listening');
    assert.equal(classroom.session.subject, 'matematicas');
    assert.ok(listener.active);

    await classroom.handlePhrase('Vale');
    const ready = await classroom.handlePhrase('Que salga alguien a la pizarra a corregir el ejercicio');
    assert.equal(ready.kind, 'mission-ready');
    assert.equal(ready.title, 'Pizarra de Matemáticas');
    assert.equal(ready.modality, 'individual');
    assert.equal(listener.active, false, 'la escucha se cierra al tener los datos');

    await classroom.handleCard('ALU-001');
    const second = await classroom.handleCard('ALU-002');
    assert.deepEqual(second.attempts.map((s) => s.name), ['Lucía']);
    // Hasta que el profesor confirma, nadie recibe puntos.
    const points = async () => Object.fromEntries((await api.listStudents()).map((s) => [s.name, s.points]));
    assert.deepEqual(await points(), { 'Lucía': 0, Hugo: 0, Martina: 0, Pablo: 0 });

    const closed = await classroom.handleCard('PROF-ANA');
    assert.equal(closed.kind, 'confirmed');
    const byName = Object.fromEntries(closed.results.map((r) => [r.student.name, r]));
    assert.equal(byName.Hugo.pointsAwarded, 10);
    assert.equal(byName.Hugo.newAchievements[0].title, 'Voluntario Valiente');
    assert.equal(byName['Lucía'].pointsAwarded, 2);
    assert.deepEqual(await points(), { 'Lucía': 2, Hugo: 10, Martina: 0, Pablo: 0 });
    assert.equal(classroom.activity, null);

    const [mission] = await api.listMissions();
    assert.equal(mission.teacherId, 'prof-ana');
    assert.equal(mission.classroom, 'aula-1');
    assert.deepEqual(kinds(events), ['session-start', 'listening', 'phrase', 'mission-ready', 'student', 'student', 'confirmed']);
});

test('misión grupal: al cerrarla todos los alumnos reciben puntos', async (t) => {
    const { api, classroom } = await setup(t);
    await classroom.handleCard('PROF-ANA');
    await classroom.handlePhrase('Ahora vamos a resolver los problemas entre todos');
    const student = await classroom.handleCard('ALU-003');
    assert.equal(student.status, 'grupal');

    const closed = await classroom.handleCard('PROF-ANA');
    assert.equal(closed.mission.modality, 'grupal');
    assert.ok((await api.listStudents()).every((s) => s.points === 5));
});

test('los datos pueden llegar en varias frases', async (t) => {
    const { classroom } = await setup(t);
    await classroom.handleCard('PROF-ANA');
    const first = await classroom.handlePhrase('Esto lo vamos a hacer todos juntos');
    assert.equal(first.used, false);
    const ready = await classroom.handlePhrase('Abrid el libro y leemos la página diez');
    assert.equal(ready.modality, 'grupal');
    assert.equal(ready.title, 'Lectura de Matemáticas');
});

test('frases demasiado cortas se descartan y las largas se recortan', async (t) => {
    const { classroom } = await setup(t, { options: { minWords: 3, maxWords: 6 } });
    await classroom.handleCard('PROF-ANA');
    assert.equal((await classroom.handlePhrase('¿Quién sale?')).used, false);
    // La palabra "pizarra" queda fuera de las 6 primeras palabras.
    const long = await classroom.handlePhrase('Bueno chicos ahora lo que vamos a hacer es salir a la pizarra');
    assert.equal(long.used, false);
});

test('sin datos en 15 minutos la escucha se cierra y la misión se descarta', async (t) => {
    const { classroom, clock, listener, dir } = await setup(t);
    await classroom.handleCard('PROF-ANA');
    await classroom.handlePhrase('Sacad el cuaderno de clase');
    clock.advance(15 * 60 * 1000);
    assert.equal(listener.active, false);
    assert.equal(classroom.activity, null);
    assert.match(discarded(dir)[0].reason, /sin datos tras 15 minutos/);
    assert.ok(classroom.session, 'la sesión sigue abierta');
});

test('la tarjeta del profesor durante la escucha la cancela, y cerrar sin alumnos la descarta', async (t) => {
    const { classroom, dir, listener } = await setup(t);
    await classroom.handleCard('PROF-ANA');
    const cancelled = await classroom.handleCard('PROF-ANA');
    assert.equal(cancelled.kind, 'discarded');
    assert.equal(listener.active, false);

    await classroom.handleCard('PROF-ANA');
    assert.equal(listener.starts, 2, 'otra pasada empieza otra misión');
    await classroom.handlePhrase('Necesito un voluntario para el ejercicio');
    const empty = await classroom.handleCard('PROF-ANA');
    assert.equal(empty.kind, 'discarded');
    assert.deepEqual(discarded(dir).map((d) => d.reason), ['cancelada por el profesor', 'no ha salido ningún alumno']);
});

test('fuera del horario no se inicia la sesión y los alumnos no crean nada', async (t) => {
    const { api, classroom } = await setup(t, { hh: 8, mm: 30 });
    const rejected = await classroom.handleCard('PROF-ANA');
    assert.equal(rejected.kind, 'rejected');
    assert.equal(classroom.session, null);

    const student = await classroom.handleCard('ALU-001');
    assert.equal(student.status, 'sin-sesion');
    assert.equal((await api.listMissions()).length, 0);
});

test('un sustituto puede iniciar la sesión con la asignatura del horario', async (t) => {
    const { classroom } = await setup(t);
    const start = await classroom.handleCard('PROF-MARTA');
    assert.equal(start.kind, 'listening');
    assert.equal(classroom.session.substitute, true);
    assert.equal(classroom.session.subject, 'matematicas');
});

test('sin sustitutos permitidos se rechaza la tarjeta de otro profesor', async (t) => {
    const { classroom } = await setup(t, { options: { allowSubstitutes: false } });
    assert.equal((await classroom.handleCard('PROF-LUIS')).kind, 'rejected');
});

test('cambio de franja: mismo profesor cambia de asignatura; otro profesor cierra la sesión', async (t) => {
    const { classroom, clock, events, dir } = await setup(t, { hh: 9, mm: 32 });
    await classroom.handleCard('PROF-ANA');
    await classroom.handlePhrase('Lucía sal a la pizarra por favor');

    clock.set(10, 0);
    await classroom.tick();
    assert.equal(classroom.session.subject, 'ciencias');
    assert.equal(classroom.activity.subject, 'matematicas', 'la misión en curso conserva su asignatura');

    clock.set(11, 0);
    await classroom.tick();
    assert.equal(classroom.session, null);
    assert.ok(kinds(events).includes('subject-change'));
    assert.match(discarded(dir)[0].reason, /fin de la franja/);
});

test('otro profesor que pasa su tarjeta cierra la sesión anterior', async (t) => {
    const { classroom } = await setup(t);
    await classroom.handleCard('PROF-ANA');
    await classroom.handleCard('PROF-LUIS');
    assert.equal(classroom.session.teacher.id, 'prof-luis');
});

test('al acabar el horario se cierra todo y se avisa de que se puede apagar', async (t) => {
    const { classroom, clock, events } = await setup(t, { hh: 13, mm: 40 });
    await classroom.handleCard('PROF-MARTA');
    clock.set(14, 0);
    await classroom.tick();
    await classroom.tick();
    assert.equal(classroom.session, null);
    assert.equal(kinds(events).filter((k) => k === 'day-end').length, 1);
    assert.equal(events.find((e) => e.kind === 'day-end').afterHours, false);
});

test('si se enciende después de las clases solo avisa de que ya han terminado', async (t) => {
    const { classroom, events } = await setup(t, { hh: 16, mm: 0 });
    await classroom.tick();
    assert.equal(events.find((e) => e.kind === 'day-end').afterHours, true);
});

test('sin conexión se usa la copia local del horario', async (t) => {
    const { dir } = await setup(t);
    const offline = new Classroom({
        api: new ApiClient({ baseUrl: 'http://127.0.0.1:9/api', timeoutMs: 300 }),
        interpreter: new MissionInterpreter({}),
        listener: new FakeListener(),
        scheduleCacheFile: path.join(dir, 'horario.json')
    });
    assert.equal(await offline.loadSchedule(), 'copia local');
    assert.equal(offline.schedule.slots.length, 5);
});

test('el dispositivo recoge los cambios del horario hechos en el panel', async (t) => {
    const { api, classroom, clock, events } = await setup(t, { hh: 8, mm: 30 });
    assert.equal((await classroom.handleCard('PROF-ANA')).kind, 'rejected', 'a las 8:30 no hay clase');

    const { slots } = await api.getSchedule();
    await api.request('PUT', '/schedule', { slots: [{ days: ['lunes'], start: '08:00', end: '09:00', teacherId: 'prof-ana', subject: 'musica' }, ...slots] });

    clock.advance(30 * 1000);
    await classroom.tick();
    assert.ok(!kinds(events).includes('schedule-updated'), 'todavía no ha pasado el intervalo de recarga');

    clock.advance(30 * 1000);
    await classroom.tick();
    assert.ok(kinds(events).includes('schedule-updated'));
    const start = await classroom.handleCard('PROF-ANA');
    assert.equal(start.kind, 'listening');
    assert.equal(classroom.session.subject, 'musica');
});

test('si no se detecta la actividad pero ha salido un alumno, el profesor la cierra como ejercicio', async (t) => {
    const { api, classroom } = await setup(t);
    await classroom.handleCard('PROF-ANA');
    await classroom.handlePhrase('Venga chicos atentos ahora');
    await classroom.handleCard('ALU-001');
    await classroom.handleCard('ALU-002');

    const closed = await classroom.handleCard('PROF-ANA');
    assert.equal(closed.kind, 'confirmed');
    assert.equal(closed.defaulted, true);
    assert.equal(closed.mission.title, 'Ejercicio de Matemáticas');
    assert.equal(closed.mission.modality, 'individual');
    const points = Object.fromEntries((await api.listStudents()).map((s) => [s.name, s.points]));
    assert.equal(points.Hugo, 10);
    assert.equal(points['Lucía'], 2);
});

test('una misión que no se confirma da los puntos de intento a quien salió', async (t) => {
    const { api, classroom, clock } = await setup(t);
    await classroom.handleCard('PROF-ANA');
    await classroom.handleCard('ALU-003');
    clock.advance(15 * 60 * 1000);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(classroom.activity, null);

    const [mission] = await api.listMissions();
    assert.equal(mission.status, 'unconfirmed');
    assert.match(mission.reason, /15 minutos/);
    assert.deepEqual(mission.participants, []);
    assert.equal((await api.listStudents()).find((s) => s.name === 'Martina').points, 2);
});

test('al acabar la franja con alumnos apuntados la misión queda sin confirmar', async (t) => {
    const { api, classroom, clock, events } = await setup(t, { hh: 10, mm: 50 });
    await classroom.handleCard('PROF-ANA');
    await classroom.handlePhrase('Que salga alguien a la pizarra');
    await classroom.handleCard('ALU-002');
    clock.set(11, 0);
    await classroom.tick();
    assert.ok(kinds(events).includes('unconfirmed'));
    const [mission] = await api.listMissions();
    assert.equal(mission.title, 'Pizarra de Ciencias');
    assert.equal((await api.listStudents()).find((s) => s.name === 'Hugo').points, 2);
});

test('las tarjetas no válidas aparecen en el registro del panel', async (t) => {
    const { LiveReporter } = require('../src/live');
    const { api, classroom } = await setup(t, { hh: 8, mm: 30 });
    const reporter = new LiveReporter(classroom, api);
    await reporter.start();
    t.after(() => reporter.stop());

    assert.equal((await classroom.handleCard('ALU-001')).status, 'sin-sesion');
    assert.equal((await classroom.handleCard('NO-EXISTE')).kind, 'unknown-card');
    await reporter.send();

    const { feed } = (await api.avatar()).live;
    assert.match(feed[0].text, /Tarjeta NO-EXISTE no registrada/);
    assert.match(feed[1].text, /Lucía: no hay ninguna clase en marcha/);
    assert.ok(feed[0].warn && feed[1].warn);
});

test('con la hora sin sincronizar no se inicia la sesión', async (t) => {
    const { classroom } = await setup(t);
    classroom.isClockSynchronized = () => false;
    assert.match((await classroom.handleCard('PROF-ANA')).reason, /sincronizada/);
});
