/**
 * Carga config.json y aplica las variables de entorno (.env) que lo sobrescriben.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const DEFAULTS = {
    language: 'es-ES',
    volunteerKeywords: ['voluntario', 'voluntaria'],
    defaultSubject: 'matematicas',
    speech: { provider: 'google', credentialsPath: './credentials/google-cloud-key.json' },
    audio: { device: 'default', sampleRate: 16000, channels: 1, maxRecordSeconds: 8 },
    voiceResponse: { enabled: false, speed: 150 },
    nfc: { mode: 'keyboard' },
    api: { url: 'http://localhost:3000/api', timeoutMs: 3000 },
    interpreter: { url: 'http://localhost:3000/api/interpret' },
    server: { host: '0.0.0.0', port: 3000, dataFile: './data/db.json' },
    pendingQueueFile: './logs/pending-missions.json'
};

function merge(base, override) {
    const result = { ...base };
    for (const [key, value] of Object.entries(override || {})) {
        if (key.startsWith('_')) continue;
        const isObject = value && typeof value === 'object' && !Array.isArray(value);
        result[key] = isObject ? merge(base[key] || {}, value) : value;
    }
    return result;
}

function loadConfig(file = path.join(ROOT, 'config.json')) {
    try {
        require('dotenv').config({ path: path.join(ROOT, '.env') });
    } catch (error) {
        // dotenv es opcional
    }

    const fromFile = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    const config = merge(DEFAULTS, fromFile);
    const env = process.env;

    if (env.API_URL) config.api.url = env.API_URL;
    if (env.INTERPRETER_URL) config.interpreter.url = env.INTERPRETER_URL;
    if (env.AUDIO_DEVICE) config.audio.device = env.AUDIO_DEVICE;
    if (env.SPEECH_PROVIDER) config.speech.provider = env.SPEECH_PROVIDER;
    if (env.NFC_MODE) config.nfc.mode = env.NFC_MODE;
    if (env.PORT) config.server.port = Number(env.PORT);

    config.root = ROOT;
    return config;
}

module.exports = { loadConfig, DEFAULTS };
