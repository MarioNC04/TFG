/**
 * Reconocimiento de voz (Speech to Text) con Google Cloud Speech.
 * Si no está disponible, recognize() devuelve null y quien lo llama pide la
 * transcripción por teclado.
 */

const fs = require('fs');
const path = require('path');

class SpeechRecognizer {
    constructor({ speech, audio, language, root }) {
        this.audio = audio;
        this.language = language;
        this.client = null;
        this.status = 'desactivado (transcripción manual)';

        if (speech.provider !== 'google') return;

        try {
            const { SpeechClient } = require('@google-cloud/speech');
            const keyFile = speech.credentialsPath && path.resolve(root, speech.credentialsPath);
            if (keyFile && fs.existsSync(keyFile)) {
                this.client = new SpeechClient({ keyFilename: keyFile });
                this.status = 'Google Speech (clave de cuenta de servicio)';
            } else {
                // Credenciales por defecto: gcloud auth application-default login
                this.client = new SpeechClient();
                this.status = 'Google Speech (credenciales de gcloud)';
            }
        } catch (error) {
            this.status = `no disponible: ${error.message}`;
        }
    }

    get available() {
        return this.client !== null;
    }

    /** @returns {Promise<string|null>} texto reconocido, o null si no se pudo reconocer. */
    async recognize(audioBuffer) {
        if (!this.client || audioBuffer.length === 0) return null;
        try {
            const [response] = await this.client.recognize({
                audio: { content: audioBuffer.toString('base64') },
                config: {
                    encoding: 'LINEAR16',
                    sampleRateHertz: this.audio.sampleRate,
                    audioChannelCount: this.audio.channels,
                    languageCode: this.language,
                    maxAlternatives: 1
                }
            });
            return (response.results || [])
                .map((result) => result.alternatives[0].transcript)
                .join(' ')
                .trim();
        } catch (error) {
            console.log(`⚠️  Error de Google Speech: ${error.message}`);
            return null;
        }
    }
}

module.exports = { SpeechRecognizer };
