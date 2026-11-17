const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMission, countWords, limitWords } = require('../src/missions/parser');

test('detecta tipo, asignatura y modalidad en la frase del profesor', () => {
    const mission = parseMission('Necesito un voluntario para el ejercicio de matemáticas');
    assert.equal(mission.typeFound, true);
    assert.equal(mission.modality, 'individual');
    assert.equal(mission.subject, 'matematicas');
    assert.equal(mission.type, 'ejercicio');
    assert.equal(mission.title, 'Ejercicio de Matemáticas');
});

test('no hace falta decir "voluntario": basta con el tipo de actividad', () => {
    const mission = parseMission('Lucía, sal a la pizarra', { subject: 'lengua' });
    assert.equal(mission.typeFound, true);
    assert.equal(mission.type, 'pizarra');
    assert.equal(mission.modality, 'individual');
    assert.equal(mission.title, 'Pizarra de Lengua');
});

test('una actividad para toda la clase es grupal', () => {
    const mission = parseMission('Ahora vamos a leer todos juntos el cuento');
    assert.equal(mission.modality, 'grupal');
    assert.equal(mission.groupFound, true);
    assert.equal(mission.type, 'lectura');
});

test('si se pide a alguien en concreto no es grupal aunque se diga "todos"', () => {
    assert.equal(parseMission('Todos callados, que salga alguien a la pizarra').modality, 'individual');
});

test('la asignatura del horario tiene prioridad sobre la frase', () => {
    const mission = parseMission('Quién quiere salir a corregir el ejercicio de matemáticas', { subject: 'ingles' });
    assert.equal(mission.subject, 'ingles');
});

test('una frase normal de clase no aporta tipo', () => {
    assert.equal(parseMission('Abrid el libro por la página veinte').typeFound, false);
    assert.equal(parseMission('el todoterreno es rojo').groupFound, false);
});

test('cuenta y recorta palabras', () => {
    assert.equal(countWords('¿Quién sale?'), 2);
    assert.equal(countWords('  '), 0);
    assert.equal(limitWords('uno dos tres cuatro', 2), 'uno dos');
    assert.equal(limitWords('uno dos', 5), 'uno dos');
});
