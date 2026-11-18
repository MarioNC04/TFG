const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../server/store');
const { createApp } = require('../server/app');
const { ApiClient } = require('../src/api/client');

async function startServer(t) {
    const app = createApp(new Store(null), { defaultSubject: 'matematicas' });
    await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
    t.after(() => app.close());
    return new ApiClient({ baseUrl: `http://127.0.0.1:${app.address().port}/api` });
}

const base = { title: 'Pizarra de Matemáticas', subject: 'matematicas', type: 'pizarra', teacherId: 'prof-ana' };

test('misión individual: el que la completa recibe 10 puntos y logro, los que lo intentan 2', async (t) => {
    const api = await startServer(t);
    const { mission, results } = await api.confirmMission({ ...base, modality: 'individual', completedBy: 'alu-002', attempts: ['alu-001'] });

    assert.equal(mission.status, 'completed');
    assert.equal(mission.teacherId, 'prof-ana');
    assert.deepEqual(mission.participants, ['alu-002']);
    assert.deepEqual(mission.attempts, ['alu-001']);

    const hugo = results.find((r) => r.student.id === 'alu-002');
    assert.equal(hugo.outcome, 'completada');
    assert.equal(hugo.pointsAwarded, 10);
    assert.deepEqual(hugo.newAchievements.map((a) => a.id), ['voluntario-valiente']);

    const lucia = results.find((r) => r.student.id === 'alu-001');
    assert.equal(lucia.outcome, 'intento');
    assert.equal(lucia.pointsAwarded, 2);
    assert.equal(lucia.newAchievements.length, 0);
});

test('misión grupal: todos los alumnos de la clase reciben 5 puntos', async (t) => {
    const api = await startServer(t);
    const { mission, results } = await api.confirmMission({ ...base, title: 'Lectura de Lengua', modality: 'grupal' });
    const students = await api.listStudents();

    assert.equal(mission.participants.length, students.length);
    assert.ok(results.every((r) => r.pointsAwarded === 5));
    assert.ok(students.every((s) => s.points === 5));
    assert.equal(results[0].newAchievements[0].id, 'trabajo-en-equipo');
});

test('una misión sin confirmar da los puntos de intento a los que salieron', async (t) => {
    const api = await startServer(t);
    const { mission, results } = await api.confirmMission({ ...base, id: 'm-sola', confirmed: false, reason: 'fin de la franja', attempts: ['alu-001', 'alu-002'] });
    assert.equal(mission.status, 'unconfirmed');
    assert.deepEqual(mission.participants, []);
    assert.ok(results.every((r) => r.outcome === 'intento' && r.pointsAwarded === 2 && r.newAchievements.length === 0));
    const students = Object.fromEntries((await api.listStudents()).map((s) => [s.id, s.points]));
    assert.equal(students['alu-001'], 2);
    assert.equal(students['alu-002'], 2);
    await assert.rejects(api.confirmMission({ ...base, confirmed: false, attempts: [] }), (e) => e.status === 400);
});

test('reiniciar borra puntos, logros y misiones pero conserva alumnos, tarjetas y horario', async (t) => {
    const api = await startServer(t);
    await api.confirmMission({ ...base, modality: 'grupal' });
    await api.reward('alu-001', 30, 'Ayuda');
    const reset = await api.request('POST', '/reset');
    assert.equal(reset.missions, 1);

    const students = await api.listStudents();
    assert.equal(students.length, 4);
    assert.ok(students.every((s) => s.points === 0 && s.achievements.length === 0 && s.history.length === 0));
    assert.equal((await api.listMissions()).length, 0);
    const avatar = await api.avatar();
    assert.equal(avatar.recentAchievements.length, 0);
    assert.equal((await api.getCard('PROF-ANA')).teacher.name, 'Ana');
    assert.equal((await api.getSchedule()).slots.length, 5);
});

test('el catálogo de logros explica cómo conseguirlos y quién los tiene', async (t) => {
    const api = await startServer(t);
    await api.confirmMission({ ...base, modality: 'individual', completedBy: 'alu-002' });
    for (let i = 0; i < 3; i++) await api.confirmMission({ ...base, subject: 'ciencias', modality: 'individual', completedBy: 'alu-003' });

    const { achievements, points } = await api.request('GET', '/achievements');
    assert.deepEqual(points, { individual: 10, attempt: 2, group: 5 });
    const byId = Object.fromEntries(achievements.map((a) => [a.id, a]));
    assert.match(byId['racha-imparable'].howTo, /5 misiones/);
    assert.deepEqual(byId['voluntario-valiente'].holders.map((h) => h.name), ['Hugo', 'Martina']);
    assert.deepEqual(byId.experto.holders, [{ name: 'Martina', title: 'Experto en Ciencias' }]);
    assert.equal(byId['estrella-de-clase'].holders.length, 0);
});

test('los datos de la primera versión se apartan y se usa el ejemplo', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'datos-'));
    const file = path.join(dir, 'db.json');
    fs.writeFileSync(file, JSON.stringify({ cards: { 'PROF-MATES': { role: 'teacher', subject: 'matematicas' } }, students: [], missions: [] }));
    const store = new Store(file);
    assert.equal(store.getCard('PROF-ANA').teacher.name, 'Ana');
    assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('db.json.antiguo-')));
});

test('el estado en directo del aula llega al panel', async (t) => {
    const api = await startServer(t);
    assert.equal((await api.avatar()).live, null);
    await api.reportLive({ session: { teacher: { name: 'Ana' } }, activity: { phase: 'listening', listenRemainingMs: 900000 } });
    const { live } = await api.avatar();
    assert.equal(live.session.teacher.name, 'Ana');
    assert.equal(live.activity.phase, 'listening');
    assert.equal(live.stale, false);
});

test('una misión reenviada desde la cola no da los puntos dos veces', async (t) => {
    const api = await startServer(t);
    const payload = { ...base, id: 'mision-local-1', modality: 'individual', completedBy: 'alu-003' };
    await api.confirmMission(payload);
    const again = await api.confirmMission(payload);
    assert.equal(again.duplicate, true);
    assert.equal((await api.listMissions()).length, 1);
    assert.equal((await api.listStudents()).find((s) => s.id === 'alu-003').points, 10);
});

test('errores de validación al confirmar', async (t) => {
    const api = await startServer(t);
    await assert.rejects(api.confirmMission({ ...base, modality: 'individual' }), /necesita el alumno/);
    await assert.rejects(api.confirmMission({ ...base, teacherId: undefined, modality: 'grupal' }), /profesor/);
    await assert.rejects(api.confirmMission({ ...base, modality: 'individual', completedBy: 'nadie' }), (e) => e.status === 404);
});

test('logros adaptativos por asignatura y recompensas del profesor', async (t) => {
    const api = await startServer(t);
    let last;
    for (let i = 0; i < 3; i++) {
        last = await api.confirmMission({ ...base, title: `Pregunta ${i}`, subject: 'ciencias', modality: 'individual', completedBy: 'alu-003' });
    }
    assert.ok(last.results[0].newAchievements.some((a) => a.id === 'experto-ciencias' && a.title === 'Experto en Ciencias'));

    const reward = await api.reward('alu-003', 80, 'Buen comportamiento');
    assert.equal(reward.student.points, 110);
    assert.deepEqual(reward.newAchievements.map((a) => a.id), ['estrella-de-clase']);

    const avatar = await api.avatar();
    assert.equal(avatar.name, 'Zorro');
    assert.equal(avatar.ranking[0].name, 'Martina');
    assert.match(avatar.message, /Estrella de la Clase/);
    assert.equal(avatar.missions.length, 3);
});

test('profesores, horario y tarjetas', async (t) => {
    const api = await startServer(t);

    const teacher = await api.getCard('PROF-ANA');
    assert.equal(teacher.role, 'teacher');
    assert.deepEqual(teacher.teacher.subjects, ['matematicas', 'ciencias']);

    const schedule = await api.getSchedule();
    assert.equal(schedule.slots[0].teacherId, 'prof-ana');

    const created = await api.registerCard({ uid: 'AA11', role: 'teacher', name: 'Elena', subjects: ['plastica'] });
    assert.equal(created.teacher.name, 'Elena');
    assert.equal((await api.listTeachers()).length, 4);

    const student = await api.registerCard({ uid: 'AB12CD34', role: 'student', name: 'Daniel' });
    assert.equal(student.student.name, 'Daniel');

    await assert.rejects(api.getCard('NO-EXISTE'), (error) => error.status === 404);
    await assert.rejects(api.reward('alu-001', 'muchos'), (error) => error.status === 400);
    await assert.rejects(api.request('PUT', '/schedule', { slots: [{ start: '08:00' }] }), (error) => error.status === 400);
});

test('el horario se edita desde el panel y se valida antes de guardar', async (t) => {
    const api = await startServer(t);
    const slot = { days: ['Lunes', 'miércoles'], start: '09:00', end: '10:00', teacherId: 'prof-ana', subject: 'matematicas' };

    const saved = await api.request('PUT', '/schedule', { slots: [{ ...slot, start: '10:00', end: '11:00' }, slot] });
    assert.deepEqual(saved.slots[0].days, ['lunes', 'miercoles'], 'los días se normalizan');
    assert.equal(saved.slots[0].start, '09:00', 'las franjas se ordenan por hora');
    assert.equal(saved.classroom, 'aula-1', 'se conserva el aula');
    assert.equal((await api.getSchedule()).slots.length, 2);

    const bad = (slots, pattern) => assert.rejects(api.request('PUT', '/schedule', { slots }), (e) => e.status === 400 && pattern.test(e.message));
    await bad([{ ...slot, start: '9:00' }], /HH:MM/);
    await bad([{ ...slot, start: '11:00' }], /anterior/);
    await bad([{ ...slot, days: [] }], /al menos un día/);
    await bad([{ ...slot, days: ['festivo'] }], /no válido/);
    await bad([slot, { ...slot, days: ['miercoles'], start: '09:30', end: '10:30' }], /se solapan el miercoles/);
    await assert.rejects(api.request('PUT', '/schedule', { slots: [{ ...slot, teacherId: 'prof-nadie' }] }), (e) => e.status === 404);

    // Las franjas horarias vacías también se guardan (filas del cuadro del panel).
    const withPeriods = await api.request('PUT', '/schedule', { periods: [{ start: '12:00', end: '12:30' }], slots: [slot] });
    assert.deepEqual(withPeriods.periods, [{ start: '09:00', end: '10:00' }, { start: '12:00', end: '12:30' }]);
    await assert.rejects(api.request('PUT', '/schedule', { periods: [{ start: '13:00', end: '12:00' }], slots: [] }), (e) => e.status === 400);

    const subjects = await api.request('GET', '/subjects');
    assert.ok(subjects.some((s) => s.id === 'matematicas' && s.label === 'Matemáticas'));
});

test('el intérprete del servidor responde como el servicio de IA', async (t) => {
    const api = await startServer(t);
    const parsed = await api.request('POST', '/interpret', { transcript: 'quién sale a la pizarra', subject: 'lengua' });
    assert.equal(parsed.title, 'Pizarra de Lengua');
    assert.equal(parsed.typeFound, true);
});

test('sin conexión la confirmación se guarda en cola y se sincroniza después', async (t) => {
    const queueFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-')), 'pending.json');
    const offline = new ApiClient({ baseUrl: 'http://127.0.0.1:9/api', timeoutMs: 500, queueFile });
    const queued = await offline.confirmMission({ ...base, id: 'm-1', modality: 'grupal' });
    assert.equal(queued.queued, true);
    assert.equal(offline.readQueue().length, 1);

    const online = await startServer(t);
    online.queueFile = queueFile;
    assert.deepEqual(await online.syncQueue(), { sent: 1, remaining: 0 });
    assert.equal((await online.listMissions()).length, 1);
});
