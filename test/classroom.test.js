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

async function setup(t, phrases) {
    const app = createApp(new Store(null), { defaultSubject: 'matematicas' });
    await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
    t.after(() => app.close());
    const baseUrl = `http://127.0.0.1:${app.address().port}/api`;

    const api = new ApiClient({ baseUrl });
    const interpreter = new MissionInterpreter({ url: `${baseUrl}/interpret`, defaultSubject: 'matematicas' });
    const queue = [...phrases];
    const classroom = new Classroom({ api, interpreter, listen: async () => queue.shift() || '', defaultSubject: 'matematicas' });
    return { api, classroom };
}

test('flujo completo: tarjeta del profesor, voz, tarjeta del alumno y logro', async (t) => {
    const { api, classroom } = await setup(t, ['Necesito un voluntario para salir a la pizarra']);

    const teacher = await classroom.handleCard('PROF-LENGUA');
    assert.equal(teacher.kind, 'teacher');
    assert.equal(teacher.mission.title, 'Pizarra de Lengua');
    assert.equal(teacher.mission.source, 'tarjeta + voz');
    assert.equal(teacher.mission.notification, false);

    const student = await classroom.handleCard('ALU-002');
    assert.equal(student.kind, 'student');
    assert.equal(student.result.mission.id, teacher.mission.id);
    assert.equal(student.result.student.name, 'Hugo');
    assert.equal(student.result.newAchievements[0].title, 'Voluntario Valiente');

    assert.equal((await api.listMissions('pending')).length, 0);
});

test('tras la tarjeta del profesor cualquier frase crea misión', async (t) => {
    const { classroom } = await setup(t, ['Vamos a repasar las tablas']);
    const event = await classroom.handleCard('PROF-MATES');
    assert.equal(event.mission.subject, 'matematicas');
    assert.equal(event.mission.modality, 'individual');
});

test('escucha libre: solo crea misión cuando se pide un voluntario', async (t) => {
    const { classroom } = await setup(t, []);
    assert.equal(await classroom.handleTranscript('Sacad el cuaderno'), null);

    const mission = await classroom.handleTranscript('Necesito un voluntario para el ejercicio de inglés');
    assert.equal(mission.subject, 'ingles');
    assert.equal(mission.source, 'voz');
});

test('un alumno que sale y no completa la misión recibe menos puntos y la deja abierta', async (t) => {
    const { api, classroom } = await setup(t, ['Necesito un voluntario para el ejercicio de matemáticas']);
    const { mission } = await classroom.handleCard('PROF-MATES');

    const attempt = await api.attemptMission(mission.id, 'alu-001');
    assert.equal(attempt.pointsAwarded, 2);
    assert.equal(attempt.student.points, 2);
    assert.equal(attempt.student.achievements.length, 0);
    assert.equal(attempt.mission.status, 'pending');

    // Lucía ya participó: la siguiente misión abierta para ella no es esta
    assert.equal(await classroom.latestOpenMissionFor('alu-001'), null);
    await assert.rejects(api.completeMission(mission.id, 'alu-001'), /ya participó/);

    // Otro alumno sí puede completarla
    const done = await classroom.handleCard('ALU-002');
    assert.equal(done.result.mission.id, mission.id);
    assert.equal(done.result.pointsAwarded, 10);
    assert.equal(done.result.mission.status, 'completed');
});

test('alumno sin misiones abiertas', async (t) => {
    const { classroom } = await setup(t, []);
    const event = await classroom.handleCard('ALU-001');
    assert.equal(event.result, null);
    assert.equal(event.student.name, 'Lucía');
});

test('sin conexión la misión se guarda en cola y se sincroniza después', async (t) => {
    const queueFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-')), 'pending.json');
    const offline = new ApiClient({ baseUrl: 'http://127.0.0.1:9/api', timeoutMs: 500, queueFile });
    const queued = await offline.createMission({ title: 'Ejercicio de Matemáticas' });
    assert.equal(queued.queued, true);
    assert.equal(offline.readQueue().length, 1);

    const app = createApp(new Store(null));
    await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
    t.after(() => app.close());
    const online = new ApiClient({ baseUrl: `http://127.0.0.1:${app.address().port}/api`, queueFile });
    assert.deepEqual(await online.syncQueue(), { sent: 1, remaining: 0 });
    assert.equal((await online.listMissions('pending')).length, 1);
});

test('si el intérprete remoto no responde se usa el local', async () => {
    const interpreter = new MissionInterpreter({ url: 'http://127.0.0.1:9/interpret', timeoutMs: 500, defaultSubject: 'lengua' });
    const parsed = await interpreter.interpret('necesito un voluntario');
    assert.equal(parsed.interpreter, 'local');
    assert.equal(parsed.subject, 'lengua');
});
