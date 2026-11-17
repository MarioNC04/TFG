/**
 * Escucha activa por frases.
 *
 * Todas las implementaciones tienen la misma forma:
 *   const listening = listener.start((frase) => ...);  // empieza a escuchar
 *   listening.stop();                                   // cierra el micrófono
 *
 *  - VoskListener: arecord envía el audio a scripts/vosk_listener.py, que lo
 *    transcribe en la propia Raspberry y devuelve una frase cada vez que el
 *    profesor hace una pausa. El audio no sale del aula ni se guarda.
 *  - GoogleListener: graba fragmentos de unos segundos y los envía a Google
 *    Cloud Speech (más preciso, pero el audio sale de la Raspberry).
 *  - ManualListener: las frases se escriben en la consola (Windows o pruebas).
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const readline = require('readline');
const { spawn, execFileSync } = require('child_process');
const { buildCommand } = require('./recorder');

class ManualListener {
    constructor() {
        this.name = 'manual (escribe las frases en la consola)';
        this.onPhrase = null;
    }

    get active() {
        return this.onPhrase !== null;
    }

    start(onPhrase) {
        this.onPhrase = onPhrase;
        return { stop: () => { this.onPhrase = null; } };
    }

    feed(text) {
        if (this.onPhrase) this.onPhrase(text);
    }
}

class VoskListener extends EventEmitter {
    /**
     * @param {object} opts
     * @param {[string, string[]]} opts.audioCommand Programa que escribe el audio PCM por stdout.
     * @param {[string, string[]]} opts.recognizerCommand Programa que lee el audio y escribe {"text"} por línea.
     */
    constructor({ audioCommand, recognizerCommand }) {
        super();
        this.name = 'Vosk (local, sin conexión)';
        this.audioCommand = audioCommand;
        this.recognizerCommand = recognizerCommand;
    }

    start(onPhrase) {
        const [recCmd, recArgs] = this.recognizerCommand;
        const [audioCmd, audioArgs] = this.audioCommand;
        const recognizer = spawn(recCmd, recArgs, { stdio: ['pipe', 'pipe', 'ignore'] });
        const audio = spawn(audioCmd, audioArgs, { stdio: ['ignore', 'pipe', 'ignore'] });
        let stopped = false;

        audio.stdout.pipe(recognizer.stdin);
        recognizer.stdin.on('error', () => {}); // el reconocedor puede cerrarse antes que arecord

        readline.createInterface({ input: recognizer.stdout }).on('line', (line) => {
            let message;
            try {
                message = JSON.parse(line);
            } catch (error) {
                return;
            }
            if (message.error) this.emit('warning', message.error);
            if (message.text && !stopped) onPhrase(message.text);
        });

        for (const [child, label] of [[audio, audioCmd], [recognizer, recCmd]]) {
            child.on('error', (error) => this.emit('warning', `${label}: ${error.message}`));
        }
        audio.on('close', (code) => {
            if (!stopped && code !== 0) this.emit('warning', `${audioCmd} se ha detenido (código ${code})`);
            recognizer.stdin.end();
        });

        return {
            stop: () => {
                if (stopped) return;
                stopped = true;
                audio.kill('SIGINT');
                recognizer.kill();
            }
        };
    }
}

class GoogleListener extends EventEmitter {
    constructor({ recorder, recognizer, seconds }) {
        super();
        this.name = 'Google Speech (fragmentos de audio)';
        this.recorder = recorder;
        this.recognizer = recognizer;
        this.seconds = seconds;
    }

    start(onPhrase) {
        let stopped = false;
        let current = null;
        const loop = async () => {
            while (!stopped) {
                current = this.recorder.record(this.seconds);
                const audio = await current.done.catch((error) => {
                    this.emit('warning', error.message);
                    stopped = true;
                    return Buffer.alloc(0);
                });
                if (stopped) break;
                const text = await this.recognizer.recognize(audio);
                if (text && !stopped) onPhrase(text);
            }
        };
        loop();
        return {
            stop: () => {
                stopped = true;
                if (current) current.stop();
            }
        };
    }
}

/** Comprueba que Python tiene instalado vosk. */
function voskInstalled(python) {
    try {
        execFileSync(python, ['-c', 'import vosk'], { stdio: 'ignore', timeout: 15000 });
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Elige la escucha según config.speech.provider ('vosk', 'google' o
 * 'manual'). Si la elegida no está disponible se usa la manual.
 * @returns {{ listener: object, warning: string|null }}
 */
function createListener(config, { recorder, recognizer }) {
    const provider = config.speech.provider;
    const manual = (warning) => ({ listener: new ManualListener(), warning });

    if (provider === 'manual') return manual(null);
    if (!recorder.available) return manual(`sin captura de audio en ${recorder.platform}`);

    if (provider === 'google') {
        if (!recognizer.available) return manual(`Google Speech ${recognizer.status}`);
        return { listener: new GoogleListener({ recorder, recognizer, seconds: config.audio.maxRecordSeconds }), warning: null };
    }

    const vosk = config.speech.vosk;
    const modelPath = path.resolve(config.root, vosk.modelPath);
    const python = vosk.python.includes('/') || vosk.python.includes('\\') ? path.resolve(config.root, vosk.python) : vosk.python;
    if (!fs.existsSync(modelPath)) return manual(`no se encuentra el modelo de Vosk en ${modelPath} (ejecuta ./instalar.sh)`);
    if (!voskInstalled(python)) return manual(`${python} no tiene instalado vosk (ejecuta ./instalar.sh)`);

    return {
        listener: new VoskListener({
            audioCommand: buildCommand(recorder.platform, config.audio),
            recognizerCommand: [python, [path.join(config.root, 'scripts', 'vosk_listener.py'), '--model', modelPath, '--rate', String(config.audio.sampleRate)]]
        }),
        warning: null
    };
}

module.exports = { createListener, ManualListener, VoskListener, GoogleListener };
