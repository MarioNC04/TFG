#!/usr/bin/env node
/**
 * Sistema de avatar pervasivo para el aula (Raspberry Pi).
 *
 * El profesor pasa su tarjeta para empezar una misión, el sistema escucha lo
 * que pide hasta saber de qué actividad se trata, los alumnos que salen pasan
 * su tarjeta y el profesor la cierra con la suya: entonces se envía a la API
 * de TecnoCRA (o al servidor local que la simula) y se reparten los puntos.
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
const { createListener } = require('./src/audio/listener');
const { speak } = require('./src/audio/tts');
const { NfcReader } = require('./src/nfc/reader');
const { isClockSynchronized } = require('./src/timesync');
const { Cli } = require('./src/cli');

async function main() {
    const config = loadConfig();
    const file = (relative) => path.resolve(config.root, relative);

    const api = new ApiClient({
        baseUrl: config.api.url,
        timeoutMs: config.api.timeoutMs,
        queueFile: file(config.pendingQueueFile)
    });
    const interpreter = new MissionInterpreter({
        url: config.interpreter.url,
        timeoutMs: config.api.timeoutMs,
        defaultSubject: config.defaultSubject
    });
    const recorder = new Recorder(config.audio);
    const recognizer = new SpeechRecognizer(config);
    const { listener, warning } = createListener(config, { recorder, recognizer });
    const nfc = new NfcReader(config.nfc.mode);

    const classroom = new Classroom({
        api,
        interpreter,
        listener,
        options: config.session,
        discardFile: file(config.discardedMissionsFile),
        scheduleCacheFile: file(config.scheduleCacheFile),
        isClockSynchronized: config.session.requireTimeSync ? isClockSynchronized : () => true
    });
    const cli = new Cli({ classroom, api, nfc, listener, config, speak });

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

    const source = await classroom.loadSchedule();
    console.log(`📅 Horario: ${source} (${classroom.schedule.slots.length} franjas)`);
    console.log(`🎤 Escucha: ${listener.name}${warning ? ` · ${warning}` : ''}`);
    if (listener.on) listener.on('warning', (message) => cli.say(`⚠️  Escucha: ${message}`));
    if (!classroom.isClockSynchronized()) console.log('🕘 Esperando a sincronizar la hora para poder iniciar sesiones');

    nfc.start();
    cli.start();
    classroom.start();
    classroom.tick().catch(() => {});
}

main().catch((error) => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
});
