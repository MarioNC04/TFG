const test = require('node:test');
const assert = require('node:assert/strict');
const { Store } = require('../server/store');
const { createApp } = require('../server/app');
const { ApiClient } = require('../src/api/client');

async function startServer() {
    const app = createApp(new Store(null), { defaultSubject: 'matematicas' });
    await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
    const api = new ApiClient({ baseUrl: `http://127.0.0.1:${app.address().port}/api` });
    return { app, api };
}

test('API simulada: misión individual, puntos y logro "Voluntario Valiente"', async (t) => {
    const { app, api } = await startServer();
    t.after(() => app.close());

    const mission = await api.createMission({ title: 'Ejercicio de Matemáticas', subject: 'matematicas', modality: 'individual' });
    assert.equal(mission.status, 'pending');
    assert.equal(mission.notification, false);

    const result = await api.completeMission(mission.id, 'alu-001');
    assert.equal(result.mission.status, 'completed');
    assert.equal(result.pointsAwarded, 10);
    assert.deepEqual(result.newAchievements.map((a) => a.id), ['voluntario-valiente']);

    await assert.rejects(api.completeMission(mission.id, 'alu-002'), /ya está completada/);
});

test('API simulada: misión grupal acumula participantes hasta cerrarla', async (t) => {
    const { app, api } = await startServer();
    t.after(() => app.close());

    const mission = await api.createMission({ title: 'Lectura de Lengua', subject: 'lengua', modality: 'grupal' });
    await api.completeMission(mission.id, 'alu-001');
    const second = await api.completeMission(mission.id, 'alu-002');
    assert.equal(second.mission.status, 'in_progress');
    assert.equal(second.mission.participants.length, 2);
    assert.equal(second.newAchievements[0].id, 'trabajo-en-equipo');

    const closed = await api.closeMission(mission.id);
    assert.equal(closed.status, 'completed');
});

test('API simulada: logros adaptativos por asignatura y recompensas del profesor', async (t) => {
    const { app, api } = await startServer();
    t.after(() => app.close());

    let last;
    for (let i = 0; i < 3; i++) {
        const mission = await api.createMission({ title: `Pregunta ${i}`, subject: 'ciencias', modality: 'individual' });
        last = await api.completeMission(mission.id, 'alu-003');
    }
    assert.ok(last.newAchievements.some((a) => a.id === 'experto-ciencias' && a.title === 'Experto en Ciencias'));

    const reward = await api.reward('alu-003', 80, 'Buen comportamiento');
    assert.equal(reward.student.points, 110);
    assert.deepEqual(reward.newAchievements.map((a) => a.id), ['estrella-de-clase']);

    const avatar = await api.avatar();
    assert.equal(avatar.name, 'Zorro');
    assert.equal(avatar.ranking[0].name, 'Martina');
    assert.match(avatar.message, /Estrella de la Clase/);
});

test('API simulada: tarjetas registradas y errores', async (t) => {
    const { app, api } = await startServer();
    t.after(() => app.close());

    const teacher = await api.getCard('PROF-MATES');
    assert.equal(teacher.role, 'teacher');
    assert.equal(teacher.subject, 'matematicas');

    const student = await api.registerCard({ uid: 'AB12CD34', role: 'student', name: 'Daniel' });
    assert.equal(student.student.name, 'Daniel');

    await assert.rejects(api.getCard('NO-EXISTE'), (error) => error.status === 404);
    await assert.rejects(api.reward('alu-001', 'muchos'), (error) => error.status === 400);
});

test('el intérprete del servidor responde como el servicio de IA', async (t) => {
    const { app, api } = await startServer();
    t.after(() => app.close());

    const parsed = await api.request('POST', '/interpret', { transcript: 'necesito un voluntario', subject: 'lengua' });
    assert.equal(parsed.title, 'Ejercicio de Lengua');
    assert.equal(parsed.isMission, true);
});
