#!/usr/bin/env node
/**
 * Sistema de avatar pervasivo para el aula (Raspberry Pi).
 *
 * Escucha al profesor, interpreta las misiones que propone, las guarda en la
 * API de TecnoCRA (o en el servidor local que la simula) y registra con
 * tarjetas NFC qué alumno las realiza para darle puntos y logros.
 *
 * Uso: npm run server   (en otra terminal, API simulada)
 *      npm start
 */

const path = require('path');
const { loadConfig } = require('./src/config');
const { ApiClient } = require('./src/api/client');
const { MissionInterpreter } = require('./src/missions/interpreter');
const { Classroom } = require('./src/classroom');
const { Recorder } = require('./src/audio/recorder');
const { SpeechRecognizer } = require('./src/audio/recognizer');
const { speak } = require('./src/audio/tts');
const { NfcReader } = require('./src/nfc/reader');
const { Cli } = require('./src/cli');

async function main() {
    const config = loadConfig();

    const api = new ApiClient({
        baseUrl: config.api.url,
        timeoutMs: config.api.timeoutMs,
        queueFile: path.resolve(config.root, config.pendingQueueFile)
    });
    const interpreter = new MissionInterpreter({
        url: config.interpreter.url,
        timeoutMs: config.api.timeoutMs,
        defaultSubject: config.defaultSubject,
        volunteerKeywords: config.volunteerKeywords
    });
    const recorder = new Recorder(config.audio);
    const recognizer = new SpeechRecognizer(config);
    const nfc = new NfcReader(config.nfc.mode);

    let cli = null;
    const classroom = new Classroom({
        api,
        interpreter,
        listen: () => cli.listen(),
        defaultSubject: config.defaultSubject
    });
    cli = new Cli({ classroom, api, nfc, recorder, recognizer, config, speak });

    console.log('='.repeat(60));
    console.log('🦊 SISTEMA DE AVATAR PERVASIVO · AULA');
    console.log('='.repeat(60));

    try {
        await api.health();
        const { sent } = await api.syncQueue();
        console.log(`🌐 Conectado a ${config.api.url}${sent ? ` (${sent} misión/es pendientes enviadas)` : ''}`);
    } catch (error) {
        console.log(`⚠️  API no disponible (${error.message})`);
        console.log('💡 Arranca el servidor simulado con: npm run server');
    }

    nfc.start();
    cli.start();
}

main().catch((error) => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
});
