#!/usr/bin/env node
/**
 * Prueba del micrófono y del reconocimiento de voz.
 * Graba unos segundos, muestra el nivel de audio y, si Google Speech está
 * configurado, la transcripción. Uso: npm run test-mic
 */

const { loadConfig } = require('../src/config');
const { Recorder } = require('../src/audio/recorder');
const { SpeechRecognizer } = require('../src/audio/recognizer');

const SECONDS = 4;

async function main() {
    const config = loadConfig();
    const recorder = new Recorder(config.audio);

    console.log(`💻 Plataforma: ${recorder.platform} · dispositivo: ${config.audio.device}`);
    if (!recorder.available) {
        console.log('❌ No hay grabador disponible (instala alsa-utils en la Raspberry: sudo apt install alsa-utils)');
        process.exit(1);
    }

    console.log(`🎤 Habla durante ${SECONDS} segundos...`);
    const audio = await recorder.record(SECONDS).done;

    let peak = 0;
    for (let i = 0; i + 1 < audio.length; i += 2) peak = Math.max(peak, Math.abs(audio.readInt16LE(i)));
    console.log(`📊 ${audio.length} bytes capturados · pico ${Math.round((peak / 32768) * 100)} %`);
    if (peak < 500) console.log('⚠️  Nivel muy bajo: revisa el dispositivo con "arecord -l" y el volumen con "alsamixer"');

    const recognizer = new SpeechRecognizer(config);
    console.log(`🗣️  Reconocimiento: ${recognizer.status}`);
    if (recognizer.available) {
        const text = await recognizer.recognize(audio);
        console.log(text ? `✅ Texto: "${text}"` : '⚠️  No se reconoció texto');
    }
}

main().catch((error) => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
});
