/**
 * Captura de audio PCM (16 bits, little endian) desde el micrófono.
 *
 *  - Raspberry Pi / Linux: arecord (ALSA).
 *  - WSL: parecord contra el micrófono de Windows (RDPSource).
 *  - Windows: sin captura; el sistema pide la transcripción por teclado.
 */

const fs = require('fs');
const { spawn, execSync } = require('child_process');

function detectPlatform() {
    if (process.platform === 'win32') return 'windows';
    if (process.platform !== 'linux') return process.platform;
    try {
        const version = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
        if (version.includes('microsoft') || process.env.WSL_DISTRO_NAME) return 'wsl';
    } catch (error) {
        // sin /proc/version: Linux normal
    }
    return 'linux';
}

function commandExists(command) {
    try {
        execSync(`command -v ${command}`, { stdio: 'ignore' });
        return true;
    } catch (error) {
        return false;
    }
}

function buildCommand(platform, { device, sampleRate, channels }) {
    if (platform === 'wsl') {
        return ['parecord', [
            '--raw', `--device=${device === 'default' ? 'RDPSource' : device}`,
            '--format=s16le', `--rate=${sampleRate}`, `--channels=${channels}`
        ]];
    }
    return ['arecord', ['-q', '-D', device, '-f', 'S16_LE', '-r', String(sampleRate), '-c', String(channels), '-t', 'raw']];
}

class Recorder {
    constructor(audioConfig, platform = detectPlatform()) {
        this.config = audioConfig;
        this.platform = platform;
        const [command] = buildCommand(platform, audioConfig);
        this.available = (platform === 'linux' || platform === 'wsl') && commandExists(command);
    }

    /**
     * Empieza a grabar. Se detiene con stop() o al llegar a maxSeconds.
     * @returns {{ stop: () => void, done: Promise<Buffer> }}
     */
    record(maxSeconds = this.config.maxRecordSeconds) {
        if (!this.available) throw new Error(`No hay grabador de audio disponible en ${this.platform}`);

        const run = (device) => {
            const [command, args] = buildCommand(this.platform, { ...this.config, device });
            const child = spawn(command, args);
            const chunks = [];
            let stderr = '';
            child.stdout.on('data', (chunk) => chunks.push(chunk));
            child.stderr.on('data', (chunk) => { stderr += chunk; });
            const done = new Promise((resolve, reject) => {
                child.on('error', reject);
                child.on('close', (code) => {
                    const audio = Buffer.concat(chunks);
                    // arecord termina con código distinto de 0 al pararlo con SIGINT/SIGTERM
                    if (audio.length === 0 && code !== 0 && !child.stoppedByUser) {
                        reject(new Error(stderr.trim() || `${command} terminó con código ${code}`));
                    } else {
                        resolve(audio);
                    }
                });
            });
            return { child, done };
        };

        let current = run(this.config.device);
        let stopped = false;
        let timer = setTimeout(() => stop(), maxSeconds * 1000);

        const stop = () => {
            if (stopped) return;
            stopped = true;
            clearTimeout(timer);
            current.child.stoppedByUser = true;
            current.child.kill('SIGINT');
        };

        // Si el dispositivo configurado no existe, se reintenta con el de por defecto.
        const done = current.done.catch((error) => {
            if (this.config.device === 'default' || stopped) throw error;
            console.log(`⚠️  Micrófono '${this.config.device}' no disponible (${error.message}); probando 'default'`);
            current = run('default');
            timer = setTimeout(() => stop(), maxSeconds * 1000);
            return current.done;
        }).finally(() => clearTimeout(timer));

        return { stop, done };
    }
}

module.exports = { Recorder, detectPlatform, buildCommand, commandExists };
