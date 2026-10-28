const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMission } = require('../src/missions/parser');

test('detecta voluntario, asignatura y tipo en la frase del profesor', () => {
    const mission = parseMission('Necesito un voluntario para el ejercicio de matemáticas');
    assert.equal(mission.isMission, true);
    assert.equal(mission.modality, 'individual');
    assert.equal(mission.subject, 'matematicas');
    assert.equal(mission.type, 'ejercicio');
    assert.equal(mission.title, 'Ejercicio de Matemáticas');
});

test('una actividad para toda la clase es grupal', () => {
    const mission = parseMission('Ahora vamos a leer todos juntos el cuento de lengua');
    assert.equal(mission.isMission, true);
    assert.equal(mission.modality, 'grupal');
    assert.equal(mission.subject, 'lengua');
    assert.equal(mission.type, 'lectura');
});

test('la asignatura de la tarjeta tiene prioridad sobre la frase', () => {
    const mission = parseMission('Quién quiere salir a la pizarra', { subject: 'ingles' });
    assert.equal(mission.subject, 'ingles');
    assert.equal(mission.type, 'pizarra');
    assert.equal(mission.title, 'Pizarra de Inglés');
});

test('sin asignatura en la frase usa la asignatura por defecto', () => {
    const mission = parseMission('necesito una voluntaria', { defaultSubject: 'ciencias' });
    assert.equal(mission.subject, 'ciencias');
    assert.equal(mission.title, 'Ejercicio de Ciencias');
});

test('una frase normal de clase no es una misión', () => {
    const mission = parseMission('Abrid el libro por la página veinte');
    assert.equal(mission.isMission, false);
});

test('no confunde palabras que contienen otra (todos / todoterreno)', () => {
    assert.equal(parseMission('el todoterreno es rojo').isMission, false);
});
