const test = require('node:test');
const assert = require('node:assert/strict');
const { VoskListener, ManualListener } = require('../src/audio/listener');

// Sustitutos de arecord y de vosk_listener.py: el primero envía audio vacío y
// el segundo responde con una frase por cada bloque recibido.
const fakeAudio = [process.execPath, ['-e', 'process.stdout.write(Buffer.alloc(4000)); setTimeout(() => process.stdout.write(Buffer.alloc(4000)), 50)']];
const fakeRecognizer = [process.execPath, ['-e', `
    let n = 0;
    console.log(JSON.stringify({ ready: true }));
    process.stdin.on('data', () => console.log(JSON.stringify({ text: 'frase ' + (++n) })));
`]];

test('la escucha con Vosk entrega cada frase reconocida y se puede parar', async () => {
    const listener = new VoskListener({ audioCommand: fakeAudio, recognizerCommand: fakeRecognizer });
    const phrases = [];
    const listening = listener.start((text) => phrases.push(text));
    await new Promise((resolve) => setTimeout(resolve, 1500));
    listening.stop();
    assert.ok(phrases.length >= 1, 'debe llegar al menos una frase');
    assert.match(phrases[0], /^frase \d$/);
});

test('los errores del reconocedor se avisan sin romper el sistema', async () => {
    const failing = [process.execPath, ['-e', 'console.log(JSON.stringify({ error: "Falta el paquete vosk" }))']];
    const listener = new VoskListener({ audioCommand: fakeAudio, recognizerCommand: failing });
    const warnings = [];
    listener.on('warning', (w) => warnings.push(w));
    const listening = listener.start(() => {});
    await new Promise((resolve) => setTimeout(resolve, 800));
    listening.stop();
    assert.deepEqual(warnings, ['Falta el paquete vosk']);
});

test('la escucha manual solo acepta frases mientras está activa', () => {
    const listener = new ManualListener();
    const phrases = [];
    listener.feed('antes');
    const listening = listener.start((text) => phrases.push(text));
    assert.equal(listener.active, true);
    listener.feed('durante');
    listening.stop();
    listener.feed('después');
    assert.deepEqual(phrases, ['durante']);
});
