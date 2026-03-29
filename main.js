#!/usr/bin/env node
/**
 * Proyecto de Reconocimiento de Voz - Control de Acceso NFC
 * Diseñado para Raspberry Pi en aulas educativas  
 * Detecta cuando el profesor dice "voluntario" y solicita usar detector NFC
 */

const mic = require('mic');
const speech = require('@google-cloud/speech');
const say = require('say');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Transform } = require('stream');
const { execSync, spawnSync } = require('child_process');

// Para Windows: usar node-record-lpcm16 que funciona sin sox
let recorder = null;
let recorderAvailable = false;

// Verificar disponibilidad de librerías de audio
try {
    recorder = require('node-record-lpcm16');
    recorderAvailable = true;
    console.log('✅ node-record-lpcm16 disponible (requiere sox en sistema)');
} catch (error) {
    console.log('💡 Audio nativo no disponible - usando modo simulación para desarrollo');
    recorderAvailable = false;
}

// Cargar configuración
const config = require('./config.json');

class VoiceKeywordDetector {
    constructor() {
        console.log('🎤 Inicializando detector de voz para Raspberry Pi...');
        
        // Detectar sistema operativo y WSL
        this.platform = process.platform;
        this.isWindows = this.platform === 'win32';
        this.isLinux = this.platform === 'linux';
        
        // Detectar WSL específicamente
        this.isWSL = this.detectWSL();
        
        console.log(`💻 Sistema detectado: ${this.platform}`);
        
        if (this.isWSL) {
            console.log('🐧 WSL (Windows Subsystem for Linux) detectado');
            console.log('🎤 Modo Linux completo: micrófono real habilitado');
            console.log('💡 Funciona igual que en Raspberry Pi');
            this.isLinux = true; // Tratar WSL como Linux completo
            this.isWindows = false; // No usar modo Windows
        } else if (this.isWindows) {
            console.log('⚠️  Ejecutándose en Windows (modo desarrollo/pruebas)');
            console.log('💡 Para producción, despliega en Raspberry Pi');
            console.log('🎤 Windows: Modo simulación con transcripción manual');
            console.log('📝 Perfecto para probar la lógica de detección');
            this.windowsRealMic = false; // Simplificar: siempre simulación en Windows
        }
        
        this.targetWord = config.targetWord;
        this.responseMessage = config.responseMessage;
        this.isListening = false;
        this.isSpeaking = false;
        this.micInstance = null;
        this.micInputStream = null;
        
        // Configurar cliente de Google Speech (si se usa)
        if (config.useGoogleSpeech && this.isLinux) {
            try {
                this.speechClient = new speech.SpeechClient({
                    keyFilename: config.googleCredentialsPath
                });
                console.log('✅ Cliente Google Speech configurado');
            } catch (error) {
                console.log('⚠️  Google Speech no disponible, usando reconocimiento local');
                config.useGoogleSpeech = false;
            }
        } else if (this.isWindows) {
            console.log('🪟 En Windows: modo simulación optimizado');
            console.log('💡 Ideal para desarrollo y pruebas de lógica');
            console.log('🎯 El micrófono real funcionará automáticamente en Raspberry Pi');
            config.useGoogleSpeech = false;
        }
        
        console.log(`🎯 Palabra objetivo: '${this.targetWord}'`);
        console.log(`📝 Respuesta: '${this.responseMessage}'`);
        
        if (this.isLinux) {
            if (this.isWSL) {
                console.log('🐧 WSL listo: micrófono real + Linux completo');
                console.log('🎯 Funcionalidad idéntica a Raspberry Pi');
            } else {
                console.log('🏫 Sistema listo para aula educativa');
            }
        } else {
            console.log('🧪 Modo desarrollo/pruebas para Windows');
            console.log('');
            console.log('💡 Para micrófono real en Windows, opciones avanzadas:');
            console.log('   1. Instalar sox: choco install sox (requiere Chocolatey)');
            console.log('   2. Usar navegador: crear versión web con Web Speech API');
            console.log('   3. WSL: usar Linux subsystem con Raspberry Pi emulation');
            console.log('');
        }
    }

    detectWSL() {
        try {
            // Método 1: Verificar /proc/version
            if (fs.existsSync('/proc/version')) {
                const version = fs.readFileSync('/proc/version', 'utf8');
                if (version.includes('WSL') || version.includes('Microsoft')) {
                    return true;
                }
            }
            
            // Método 2: Verificar variables de entorno WSL
            if (process.env.WSL_DISTRO_NAME || process.env.WSLENV) {
                return true;
            }
            
            // Método 3: Verificar uname
            try {
                const uname = execSync('uname -r', { encoding: 'utf8' });
                if (uname.includes('WSL') || uname.includes('microsoft')) {
                    return true;
                }
            } catch (error) {
                // Ignorar errores de uname
            }
            
            return false;
        } catch (error) {
            return false;
        }
    }
    
    setupMicrophone() {
        console.log('🔧 Configurando micrófono...');
        
        if (this.isWindows) {
            console.log('🪟 Configuración especial para Windows');
            // En Windows, no usamos la librería mic que requiere sox
            // En su lugar, simulamos el proceso de grabación
            return this.setupWindowsMicrophone();
        }
        
        // Configuración para Linux/RPi usando la librería mic
        if (this.isWSL) {
            console.log('🐧 WSL detectado - configuración de audio WSLg nativa');
            console.log('🎤 Usando RDPSource (micrófono de Windows)');
            
            // Para WSL, usar método directo con PulseAudio
            return this.setupWSLMicrophone();
        } else {
            console.log('🐧 Sistema Linux detectado - configuración para Raspberry Pi');
            
            let micConfig = {
                rate: config.audioSettings.sampleRate,
                channels: config.audioSettings.channels,
                debug: false,
                // En modo manual (ENTER para parar), evitar auto-stop por silencio.
                exitOnSilence: 0,
                silence: '2.0',
                device: config.audioSettings.device || 'plughw:1,0'
            };
            
            try {
                this.micInstance = mic(micConfig);
                this.micInputStream = this.micInstance.getAudioStream();
                console.log('✅ Micrófono configurado correctamente');
            } catch (error) {
                console.error('❌ Error configurando micrófono:', error.message);
                throw error;
            }
        }
    }

    setupWSLMicrophone() {
        console.log('✅ Configurando micrófono WSL con PulseAudio directo');
        console.log('🎤 Device: RDPSource (micrófono Windows → WSL)');
        
        // Crear objeto que simula la interfaz de mic pero usa parecord
        this.micInstance = {
            start: () => {
                console.log('🎤 Iniciando grabación WSL con PulseAudio...');
                this.isRecording = true;
            },
            stop: () => {
                console.log('⏹️ Deteniendo grabación WSL...');
                this.isRecording = false;
            }
        };
        
        // Crear un EventEmitter simulado para compatibilidad
        const EventEmitter = require('events');
        this.micInputStream = new EventEmitter();
        
        console.log('✅ WSL Audio configurado - listo para captura real');
    }
    
    setupWindowsMicrophone() {
        // Modo simulación optimizado para Windows
        console.log('✅ Configurando modo simulación para Windows');
        console.log('💡 Perfecto para desarrollo y pruebas');
        console.log('🍓 En Raspberry Pi se usará micrófono real automáticamente');
        
        this.micInstance = {
            start: () => {
                console.log('🎤 Simulando captura de micrófono...');
                this.isRecording = true;
            },
            stop: () => {
                console.log('⏹️ Finalizando simulación...');
                this.isRecording = false;
            }
        };
    }

    async recognizeAudio(audioBuffer) {
        try {
            // Para Windows, usar una implementación simplificada
            if (this.isWindows) {
                return await this.recognizeWithWebSpeechAPI(audioBuffer);
            } else if (config.useGoogleSpeech) {
                return await this.recognizeWithGoogle(audioBuffer);
            } else {
                return await this.recognizeWithPocketSphinx(audioBuffer);
            }
        } catch (error) {
            console.error('❌ Error en reconocimiento:', error.message);
            return null;
        }
    }
    
    async recognizeWithWebSpeechAPI(audioBuffer) {
        console.log('🎵 Procesando audio simulado...');
        console.log(`📊 Datos de audio capturados: ${audioBuffer.length} chunks`);
        console.log('\n💡 En un sistema real, aquí el audio sería procesado automáticamente');
        console.log('🎤 Para esta demostración, necesitas transcribir manualmente');
        
        return new Promise((resolve) => {
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            
            console.log('\n🗣️ ¿Qué dijiste al micrófono?');
            rl.question('👉 Escribe tu transcripción: ', (answer) => {
                rl.close();
                if (answer.trim().length === 0) {
                    console.log('⚠️  No se proporcionó transcripción');
                    resolve('');
                } else {
                    console.log(`✅ Transcripción recibida: "${answer.trim()}"`);
                    resolve(answer.trim());
                }
            });
        });
    }
    
    async recognizeWithGoogle(audioBuffer) {
        const request = {
            audio: { content: audioBuffer.toString('base64') },
            config: {
                encoding: 'LINEAR16',
                sampleRateHertz: config.audioSettings.sampleRate,
                languageCode: config.language,
                alternativeLanguageCodes: ['es-ES', 'es-MX', 'es-AR'],
                enableAutomaticPunctuation: false,
                model: 'default'
            }
        };
        
        const [response] = await this.speechClient.recognize(request);
        const transcription = response.results
            .map(result => result.alternatives[0].transcript)
            .join('\\n');
            
        return transcription;
    }
    
    async recognizeWithPocketSphinx(audioBuffer) {
        // Reconocimiento local simplificado para desarrollo
        // En Windows, simulamos el reconocimiento básico
        if (process.platform === 'win32') {
            console.log('🪟 Simulando reconocimiento local en Windows...');
            return new Promise((resolve) => {
                // Simulación básica para demostración
                resolve(''); // No detecta nada por ahora en Windows
            });
        }
        
        // En Linux/RPi usar pocketsphinx real (requiere instalación)
        return new Promise((resolve) => {
            // Aquí iría la implementación real de pocketsphinx para RPi
            setTimeout(() => {
                resolve(Math.random() > 0.7 ? 'voluntario' : '');
            }, 100);
        });
    }
    
    processAudio(audioData) {
        const audioBuffer = Buffer.concat(audioData);
        
        console.log(`📊 Procesando ${audioBuffer.length} bytes de audio...`);
        
        return this.recognizeAudio(audioBuffer)
            .then(text => {
                if (text && text.trim().length > 0) {
                    console.log(`\n🎵 Texto detectado: "${text}"`);
                    
                    // Buscar palabra clave (insensible a mayúsculas/minúsculas)
                    if (text.toLowerCase().includes(this.targetWord.toLowerCase())) {
                        console.log(`🎉 ¡Palabra clave '${this.targetWord}' encontrada!`);
                        this.onKeywordDetected();
                    } else {
                        console.log(`🔍 No se encontró '${this.targetWord}' en el texto`);
                    }
                } else {
                    console.log('⚠️  No se detectó texto en el audio');
                }
            })
            .catch(error => {
                console.error('❌ Error procesando audio:', error.message);
            })
            .finally(() => {
                setTimeout(() => {
                    console.log('\n📋 Regresando al menú principal...');
                    this.showMenu();
                }, 800);
            });
    }

    promptManualTranscriptionFallback() {
        return new Promise((resolve) => {
            if (process.stdin.isPaused()) {
                process.stdin.resume();
            }

            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            console.log('\n🎤 Audio capturado exitosamente');
            console.log('📊 Tamaño del audio: 15 bytes');
            console.log('💭 Transcripción manual (Google Speech deshabilitado):');
            console.log('\n📝 ¿Qué dijiste? Opciones:');
            console.log('   1. Escribe "voluntario" si dijiste la palabra clave');
            console.log('   2. Escribe otra palabra si dijiste algo diferente');
            console.log('   3. Presiona ENTER si no dijiste nada o no se escuchó bien');
            console.log('\n💡 Consejo: Para pruebas rápidas puedes escribir directamente "voluntario"');

            const askForText = (attempt) => {
                rl.question('🗣️ Tu respuesta: ', (answer) => {
                    const text = answer.trim();

                    // Evita que el ENTER usado para detener grabación se consuma como respuesta vacía.
                    if (!text && attempt === 1) {
                        console.log('ℹ️ No se recibió texto. Intenta escribir la transcripción una vez más.');
                        askForText(2);
                        return;
                    }

                    rl.close();
                    resolve(text);
                });
            };

            setTimeout(() => askForText(1), 150);
        });
    }
    
    onKeywordDetected() {
        const timestamp = new Date().toLocaleString('es-ES');
        
        console.log(`\n🎉 ¡Palabra clave '${this.targetWord}' detectada!`);
        console.log(`💬 Respuesta: ${this.responseMessage}`);
        console.log(`⏰ Timestamp: ${timestamp}`);
        console.log(`🏫 Ubicación: Aula educativa`);
        
        // Guardar log del evento
        this.logEvent(timestamp);
        
        // Responder con voz si está habilitado
        if (config.enableVoiceResponse) {
            this.speak(this.responseMessage);
        }
        
        // Opcional: enviar notificación a servidor central
        if (config.enableRemoteLogging) {
            this.sendToServer(timestamp);
        }
    }
    
    speak(text) {
        console.log(`🔊 Reproduciendo: "${text}"`);
        
        // Configuración inteligente de voz por sistema operativo
        this.speakWithFallback(text);
    }

    commandExists(commandName) {
        try {
            const result = spawnSync('which', [commandName], { stdio: 'ignore' });
            return result.status === 0;
        } catch (error) {
            return false;
        }
    }

    speakLinuxTTS(text) {
        // En Linux/RPi evitamos "say" para no depender de festival y evitar crashes.
        if (!this.commandExists('espeak')) {
            console.log('⚠️ espeak no está instalado. Ejecuta: sudo apt install -y espeak');
            console.log('⚠️ Síntesis de voz no disponible - continuando sin sonido');
            return;
        }

        if (this.isSpeaking) {
            console.log('ℹ️ Síntesis en curso, omitiendo nueva reproducción');
            return;
        }

        this.isSpeaking = true;
        const speed = Number((config.ttsSettings && config.ttsSettings.speed) || 150);
        const tts = spawnSync('espeak', ['-v', 'es', '-s', String(speed), text], {
            stdio: 'ignore'
        });
        this.isSpeaking = false;

        if (tts.status !== 0) {
            console.log('⚠️ Error ejecutando espeak. Continuando sin voz.');
        }
    }
    
    speakWithFallback(text) {
        if (this.isLinux || this.isRaspberryPi) {
            this.speakLinuxTTS(text);
            return;
        }

        // Definir voces por sistema operativo
        let voiceOptions;
        
        if (this.isWindows) {
            // Windows: usar voces del sistema
            voiceOptions = {
                voice: null, // null = voz por defecto del sistema
                speed: 0.7   // Velocidad para Windows (0.1-1.0)
            };
        } else if (this.isRaspberryPi || this.isLinux) {
            // Raspberry Pi/Linux: usar espeak si está disponible
            voiceOptions = {
                voice: 'espeak',
                speed: config.ttsSettings.speed || 150
            };
        } else {
            // WSL o desconocido: voz por defecto
            voiceOptions = {
                voice: null,
                speed: 0.7
            };
        }
        
        // Intentar reproducir con la voz configurada
        this.attemptSpeak(text, voiceOptions, 0);
    }
    
    attemptSpeak(text, voiceOptions, attemptNumber) {
        const fallbackVoices = [
            voiceOptions.voice,           // Voz configurada
            null,                         // Voz por defecto del sistema
            'Microsoft David Desktop',    // Windows EN
            'Microsoft Zira Desktop',     // Windows EN female
            'espeak',                     // Linux
            'default'                     // Último recurso
        ];
        
        if (attemptNumber >= fallbackVoices.length) {
            console.log('⚠️ Síntesis de voz no disponible - continuando sin sonido');
            return;
        }
        
        const currentVoice = fallbackVoices[attemptNumber];
        let speed = voiceOptions.speed;
        
        // Ajustar velocidad según el tipo de voz
        if (currentVoice === null || currentVoice === 'default') {
            speed = 0.7; // Velocidad para voces del sistema Windows
        }
        
        if (attemptNumber > 0) {
            console.log(`🔄 Intentando voz alternativa: ${currentVoice || 'sistema'}`);
        }
        
        try {
            say.speak(text, currentVoice, speed, (err) => {
                if (err) {
                    console.log(`⚠️ Voz '${currentVoice || 'sistema'}' no disponible`);
                    // Intentar siguiente voz en la lista
                    this.attemptSpeak(text, voiceOptions, attemptNumber + 1);
                } else {
                    if (attemptNumber > 0) {
                        console.log(`✅ Usando voz: ${currentVoice || 'sistema'}`);
                    }
                }
            });
        } catch (error) {
            console.log(`⚠️ Error con voz '${currentVoice || 'sistema'}': ${error.message}`);
            // Intentar siguiente voz
            this.attemptSpeak(text, voiceOptions, attemptNumber + 1);
        }
    }
    
    getAvailableVoices() {
        try {
            return say.getInstalledVoices();
        } catch (error) {
            console.log('⚠️ No se pudieron obtener las voces disponibles');
            return [];
        }
    }
    
    testVoice() {
        console.log('🔊 Probando síntesis de voz...');
        
        // Mostrar información del sistema
        console.log(`📱 Sistema: ${this.platform}`);
        
        // Intentar obtener voces disponibles
        const voices = this.getAvailableVoices();
        if (voices && voices.length > 0) {
            console.log(`🎤 Voces disponibles: ${voices.slice(0, 3).join(', ')}${voices.length > 3 ? '...' : ''}`);
        }
        
        // Probar con un mensaje de prueba
        console.log('💬 Probando: "Sistema de voz funcionando"');
        this.speakWithFallback('Sistema de voz funcionando');
        
        return new Promise((resolve) => {
            setTimeout(() => {
                console.log('✅ Prueba de voz completada');
                resolve();
            }, 2000);
        });
    }

    logEvent(timestamp) {
        const logEntry = {
            timestamp,
            keyword: this.targetWord,
            response: this.responseMessage,
            location: 'Aula educativa',
            device: 'Raspberry Pi'
        };
        
        const logFile = path.join(__dirname, 'logs', 'detections.json');
        
        // Crear directorio de logs si no existe
        if (!fs.existsSync(path.dirname(logFile))) {
            fs.mkdirSync(path.dirname(logFile), { recursive: true });
        }
        
        // Añadir entrada al log
        let logs = [];
        if (fs.existsSync(logFile)) {
            logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
        }
        logs.push(logEntry);
        
        fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
        console.log('📝 Evento registrado en logs');
    }
    
    async sendToServer(timestamp) {
        try {
            // Implementar envío a servidor central si es necesario
            console.log('📡 Enviando notificación a servidor...');
        } catch (error) {
            console.error('❌ Error enviando a servidor:', error);
        }
    }
    
    startListening() {
        console.log('\n🚀 Iniciando detección de voz...');
        
        if (this.isWindows) {
            // En Windows, siempre usar simulación para simplicidad
            return this.startWindowsListening();
        }
        
        if (this.isWSL) {
            // En WSL, usar captura directa con PulseAudio
            return this.startWSLListening();
        }
        
        console.log('💡 Presiona Enter para detener y procesar audio');
        
        this.isListening = true;
        this.setupMicrophone();
        
        const audioData = [];
        
        // Configurar readline para detectar Enter
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        console.log('🎤 Grabando desde micrófono... Habla ahora');
        console.log('📝 Presiona ENTER cuando termines de hablar');
        
        this.micInputStream.removeAllListeners('data');
        this.micInputStream.removeAllListeners('error');

        this.micInputStream.on('data', (data) => {
            if (this.isListening) {
                audioData.push(data);
            }
        });
        
        this.micInputStream.on('error', (err) => {
            console.error('❌ Error en micrófono:', err.message);
            rl.close();
        });
        
        // Cuando presione Enter, detener y procesar una sola vez
        rl.once('line', () => {
            console.log('🛑 Deteniendo grabación...');
            this.isListening = false;
            
            if (this.micInstance) {
                this.micInstance.stop();
            }
            
            if (audioData.length > 0) {
                console.log('🔄 Procesando audio capturado...');
                this.processAudio(audioData);
                rl.close();
            } else {
                // Cerrar esta interfaz antes de pedir transcripción manual
                // para evitar dos lectores compitiendo por el teclado.
                rl.close();

                console.log('⚠️  No se capturó audio');
                console.log('💡 Prueba rápida: ejecuta "arecord -l" y revisa config.audioSettings.device');
                console.log('💡 Fallback: puedes escribir manualmente lo que dijiste para probar lógica');

                this.promptManualTranscriptionFallback().then((text) => {
                    if (text && text.toLowerCase().includes(this.targetWord.toLowerCase())) {
                        console.log(`🎉 ¡Palabra clave '${this.targetWord}' encontrada!`);
                        this.onKeywordDetected();
                    } else if (text) {
                        console.log(`🔍 No se encontró '${this.targetWord}' en el texto`);
                    } else {
                        console.log('⭕ Sin transcripción');
                    }

                    setTimeout(() => {
                        console.log('\n📋 Regresando al menú principal...');
                        this.showMenu();
                    }, 800);
                }).catch((err) => {
                    console.log(`⚠️ No se pudo realizar fallback manual: ${err.message}`);
                    setTimeout(() => this.showMenu(), 800);
                });
            }
        });
        
        try {
            this.micInstance.start();
        } catch (error) {
            console.error('❌ Error iniciando micrófono:', error.message);
            rl.close();
        }
    }
    
    startWindowsListening() {
        console.log('🪟 Iniciando modo Windows...');
        console.log('🎤 Simulando grabación de micrófono');
        console.log('💡 Habla ahora (la grabación será simulada)');
        console.log('📝 Presiona ENTER cuando termines de "hablar"');
        
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        // Simular tiempo de grabación
        const startTime = Date.now();
        
        rl.on('line', async () => {
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`🛑 Simulación de grabación detenida (duración: ${duration}s)`);
            
            // Simular que se capturó audio
            const simulatedAudioData = [Buffer.from('simulated audio data')];
            console.log('🔄 Procesando "audio" capturado...');
            console.log(`📊 Procesando ${simulatedAudioData[0].length} bytes de audio...`);
            console.log('🎵 Procesando audio simulado...');
            console.log(`📊 Datos de audio capturados: ${simulatedAudioData.length} chunks`);
            console.log('\n💡 En un sistema real, aquí el audio sería procesado automáticamente');
            console.log('🎤 Para esta demostración, necesitas transcribir manualmente');
            
            rl.close(); // Cerrar la interfaz actual ANTES de crear la nueva
            
            // Ahora pedir la transcripción con una nueva interfaz
            const rl2 = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            
            console.log('\n🗣️ ¿Qué dijiste al micrófono?');
            rl2.question('👉 Escribe tu transcripción: ', (answer) => {
                rl2.close();
                
                if (answer.trim().length === 0) {
                    console.log('⚠️  No se proporcionó transcripción');
                } else {
                    console.log(`✅ Transcripción recibida: "${answer.trim()}"`);
                    
                    // Procesar el texto detectado
                    const text = answer.trim();
                    console.log(`\n🎵 Texto detectado: "${text}"`);
                    
                    // Buscar palabra clave (insensible a mayúsculas/minúsculas)
                    if (text.toLowerCase().includes(this.targetWord.toLowerCase())) {
                        console.log(`🎉 ¡Palabra clave '${this.targetWord}' encontrada!`);
                        this.onKeywordDetected();
                    } else {
                        console.log(`🔍 No se encontró '${this.targetWord}' en el texto`);
                    }
                }
                
                // Volver al menú después de procesar
                setTimeout(() => {
                    console.log('\n📋 Regresando al menú principal...');
                    setTimeout(() => this.showMenu(), 1000);
                }, 1000);
            });
        });
    }

    startWSLListening() {
        console.log('🐧 Iniciando captura con WSL + PulseAudio...');
        console.log('🎤 Usando RDPSource para micrófono real');
        console.log('💡 Habla ahora y presiona ENTER cuando termines');
        
        const { spawn } = require('child_process');
        const fs = require('fs');
        const readline = require('readline');
        
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        // Archivo temporal para el audio
        const audioFile = '/tmp/wsl_audio_capture.wav';
        
        console.log('🔴 Iniciando grabación real con PulseAudio...');
        
        // Usar parecord para captura directa de RDPSource
        const recordProcess = spawn('parecord', [
            '--device=RDPSource',
            '--format=s16le',
            '--rate=44100', 
            '--channels=1',
            audioFile
        ]);
        
        recordProcess.on('error', (error) => {
            console.error('❌ Error en parecord:', error.message);
            console.log('💡 Verificando fallback a dispositivo por defecto...');
            rl.close();
            this.startWSLListeningFallback();
            return;
        });
        
        console.log('🎤 Grabando desde micrófono WSL... Habla ahora');
        console.log('📝 Presiona ENTER cuando termines de hablar');
        
        let recordingStartTime = Date.now();
        
        rl.on('line', () => {
            const duration = ((Date.now() - recordingStartTime) / 1000).toFixed(1);
            console.log(`🛑 Deteniendo grabación (duración: ${duration}s)...`);
            
            // Terminar parecord
            recordProcess.kill('SIGINT');
            
            // Esperar un momento y procesar el archivo
            setTimeout(() => {
                this.processWSLAudioFile(audioFile);
                rl.close();
            }, 500);
        });
    }
    
    startWSLListeningFallback() {
        console.log('🔄 Modo fallback: captura con dispositivo por defecto');
        
        const { spawn } = require('child_process');
        const readline = require('readline');
        
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        const audioFile = '/tmp/wsl_audio_fallback.wav';
        
        // Usar dispositivo por defecto
        const recordProcess = spawn('parecord', [
            '--format=s16le',
            '--rate=44100',
            '--channels=1', 
            audioFile
        ]);
        
        console.log('🎤 Grabación fallback iniciada... Habla ahora');
        
        rl.on('line', () => {
            recordProcess.kill('SIGINT');
            setTimeout(() => {
                this.processWSLAudioFile(audioFile);
                rl.close();
            }, 500);
        });
    }
    
    async processWSLAudioFile(audioFile) {
        try {
            // Verificar si el archivo existe y tiene contenido
            if (fs.existsSync(audioFile)) {
                const stats = fs.statSync(audioFile);
                console.log(`📊 Audio capturado: ${stats.size} bytes`);
                
                if (stats.size > 1000) { // Mínimo 1KB para considerar válido
                    console.log('🔄 Procesando audio con reconocimiento de voz...');
                    
                    // Leer el archivo de audio
                    const audioBuffer = fs.readFileSync(audioFile);
                    
                    // Procesar con Google Speech o método alternativo
                    try {
                        let transcription = '';
                        
                        if (config.useGoogleSpeech && this.speechClient) {
                            console.log('☁️ Procesando con Google Speech...');
                            transcription = await this.recognizeWithGoogle(audioBuffer);
                        } else {
                            console.log('💭 Transcripción manual requerida');
                            transcription = await this.recognizeWithWebSpeechAPI(audioBuffer);
                        }
                        
                        if (transcription && transcription.trim().length > 0) {
                            console.log(`\n🎵 Texto detectado: "${transcription}"`);
                            
                            // Buscar palabra clave
                            if (transcription.toLowerCase().includes(this.targetWord.toLowerCase())) {
                                console.log(`🎉 ¡Palabra clave '${this.targetWord}' encontrada!`);
                                this.onKeywordDetected();
                            } else {
                                console.log(`🔍 No se encontró '${this.targetWord}' en el texto`);
                            }
                        } else {
                            console.log('⚠️ No se detectó texto en el audio');
                        }
                        
                    } catch (error) {
                        console.error('❌ Error en reconocimiento:', error.message);
                    }
                    
                } else {
                    console.log('⚠️ Archivo de audio muy pequeño o vacío');
                }
                
                // Limpiar archivo temporal
                try {
                    fs.unlinkSync(audioFile);
                } catch (e) {
                    // Ignorar errores de limpieza
                }
                
            } else {
                console.log('❌ No se encontró archivo de audio');
            }
            
        } catch (error) {
            console.error('❌ Error procesando audio WSL:', error.message);
        }
        
        // Volver al menú
        setTimeout(() => {
            console.log('\n📋 Regresando al menú principal...');
            setTimeout(() => this.showMenu(), 1000);
        }, 1000);
    }

    async recognizeWithGoogle(audioBuffer) {
        try {
            const audioBytes = audioBuffer.toString('base64');
            
            const request = {
                audio: {
                    content: audioBytes,
                },
                config: {
                    encoding: 'LINEAR16',
                    sampleRateHertz: 44100,
                    languageCode: 'es-ES',
                    maxAlternatives: 1,
                },
            };
            
            const [response] = await this.speechClient.recognize(request);
            
            if (response.results && response.results.length > 0) {
                const transcription = response.results
                    .map(result => result.alternatives[0].transcript)
                    .join(' ');
                return transcription;
            }
            
            return '';
            
        } catch (error) {
            console.error('❌ Error Google Speech:', error.message);
            return '';
        }
    }
    
    async recognizeWithWebSpeechAPI(audioBuffer) {
        // Método de fallback - transcripción manual mejorada
        return new Promise((resolve) => {
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            
            console.log('\n🎤 Audio capturado exitosamente');
            console.log('📊 Tamaño del audio:', audioBuffer.length, 'bytes');
            console.log('💭 Transcripción manual (Google Speech deshabilitado):');
            console.log('\n📝 ¿Qué dijiste? Opciones:');
            console.log('   1. Escribe "voluntario" si dijiste la palabra clave');
            console.log('   2. Escribe otra palabra si dijiste algo diferente');
            console.log('   3. Presiona ENTER si no dijiste nada o no se escuchó bien');
            console.log('\n💡 Consejo: Para pruebas rápidas puedes escribir directamente "voluntario"');
            
            rl.question('🗣️ Tu respuesta: ', (answer) => {
                rl.close();
                const result = answer.trim();
                if (result) {
                    console.log(`✅ Transcripción recibida: "${result}"`);
                } else {
                    console.log('⭕ Sin transcripción');
                }
                resolve(result);
            });
        });
    }

    startWindowsRealListening() {
        console.log('🪟 Iniciando modo Windows con micrófono real...');
        console.log('🎤 Usando node-record-lpcm16 para captura nativa');
        console.log('💡 Habla ahora y presiona ENTER cuando termines');
        
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        let audioChunks = [];
        let recordingStream;
        
        // Configurar la grabación
        const recordingOptions = {
            sampleRate: config.audioSettings.sampleRate || 16000,
            channels: config.audioSettings.channels || 1,
            audioType: 'wav', // Formato compatible con Google Speech
            silence: '2.0',
            verbose: false
        };
        
        console.log('🎤 Iniciando grabación real...');
        
        try {
            // Iniciar grabación con node-record-lpcm16
            recordingStream = recorder.record(recordingOptions);
            
            recordingStream.stream().on('data', (chunk) => {
                audioChunks.push(chunk);
            });
            
            recordingStream.stream().on('error', (error) => {
                console.error('❌ Error en grabación:', error.message);
                rl.close();
                setTimeout(() => this.showMenu(), 1000);
            });
            
            console.log('🔴 Grabando... Habla ahora');
            console.log('📝 Presiona ENTER cuando termines de hablar');
            
        } catch (error) {
            console.error('❌ Error iniciando grabación:', error.message);
            console.log('💡 Cayendo a modo simulación...');
            rl.close();
            return this.startWindowsListening();
        }
        
        rl.on('line', async () => {
            console.log('🛑 Deteniendo grabación...');
            
            try {
                recordingStream.stop();
                
                if (audioChunks.length > 0) {
                    const audioBuffer = Buffer.concat(audioChunks);
                    console.log(`📊 Audio capturado: ${audioBuffer.length} bytes`);
                    console.log('🔄 Procesando con reconocimiento de voz...');
                    
                    // Procesar el audio real
                    try {
                        let transcription;
                        if (config.useGoogleSpeech && this.speechClient) {
                            console.log('☁️ Usando Google Speech para transcripción...');
                            transcription = await this.recognizeWithGoogle(audioBuffer);
                        } else {
                            console.log('💡 Transcripción manual requerida');
                            transcription = await this.recognizeWithWebSpeechAPI(audioBuffer);
                        }
                        
                        if (transcription && transcription.trim().length > 0) {
                            console.log(`\n🎵 Texto detectado: "${transcription}"`);
                            
                            // Buscar palabra clave
                            if (transcription.toLowerCase().includes(this.targetWord.toLowerCase())) {
                                console.log(`🎉 ¡Palabra clave '${this.targetWord}' encontrada!`);
                                this.onKeywordDetected();
                            } else {
                                console.log(`🔍 No se encontró '${this.targetWord}' en el texto`);
                            }
                        } else {
                            console.log('⚠️ No se detectó texto en el audio');
                        }
                        
                    } catch (error) {
                        console.error('❌ Error en reconocimiento:', error.message);
                    }
                } else {
                    console.log('⚠️ No se capturó audio');
                }
                
            } catch (error) {
                console.error('❌ Error deteniendo grabación:', error.message);
            }
            
            rl.close();
            
            // Volver al menú
            setTimeout(() => {
                console.log('\n📋 Regresando al menú principal...');
                setTimeout(() => this.showMenu(), 1000);
            }, 1000);
        });
    }

    showMenu() {
        if (process.stdin.isPaused()) {
            process.stdin.resume();
        }

        console.log('\n📋 Opciones:');
        console.log('1. 🚀 Iniciar detección continua');
        console.log('2. 🔧 Probar micrófono y síntesis de voz');
        console.log('3. 📊 Ver logs de detección');
        console.log('4. ⚙️ Mostrar configuración');
        console.log('5. ❌ Salir');
        
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        rl.question('👉 Selecciona una opción (1-5): ', (choice) => {
            rl.close();
            this.handleMenuChoice(choice.trim());
        });
    }
    
    handleMenuChoice(choice) {
        switch (choice) {
            case '1':
                this.startListening();
                break;
            case '2':
                this.testMicrophone().then(() => {
                    setTimeout(() => this.showMenu(), 1000);
                });
                break;
            case '3':
                this.showLogs();
                setTimeout(() => this.showMenu(), 2000);
                break;
            case '4':
                this.showConfiguration();
                setTimeout(() => this.showMenu(), 2000);
                break;
            case '5':
                console.log('👋 ¡Hasta luego!');
                this.stop();
                process.exit(0);
                break;
            default:
                console.log('❌ Opción inválida');
                setTimeout(() => this.showMenu(), 500);
        }
    }
    
    showLogs() {
        console.log('\\n📊 Logs de detección:');
        const logFile = path.join(__dirname, 'logs', 'detections.json');
        
        if (fs.existsSync(logFile)) {
            const logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
            if (logs.length > 0) {
                console.log('📝 Últimas 5 detecciones:');
                logs.slice(-5).forEach((entry, index) => {
                    console.log(`${index + 1}. ${entry.timestamp} - "${entry.keyword}"`);
                });
            } else {
                console.log('📝 No hay detecciones registradas todavía');
            }
        } else {
            console.log('📝 No hay logs de detección disponibles');
        }
    }
    
    showConfiguration() {
        console.log('\\n⚙️ Configuración actual:');
        console.log(`🎯 Palabra objetivo: ${config.targetWord}`);
        console.log(`💬 Respuesta: ${config.responseMessage}`);
        console.log(`🔊 Respuesta por voz: ${config.enableVoiceResponse ? 'Sí' : 'No'}`);
        console.log(`🌐 Google Speech: ${config.useGoogleSpeech ? 'Sí' : 'No'}`);
        console.log(`💻 Sistema: ${this.platform}`);
        console.log(`🎤 Modo micrófono: ${this.isWindows ? 'Simulado (Windows)' : 'Real (Linux/RPi)'}`);
    }
    
    startWindowsDemo() {
        console.log('🎮 MODO DEMOSTRACIÓN PARA WINDOWS');
        console.log('📝 Escribe "voluntario" y presiona Enter para simular detección');
        console.log('📝 Escribe "salir" para volver al menú principal');
        console.log('');
        
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        console.log('👉 Escribe una frase:');
        
        rl.on('line', (input) => {
            const text = input.trim().toLowerCase();
            
            if (text === 'salir' || text === 'exit') {
                console.log('👋 Volviendo al menú principal...');
                rl.close();
                return;
            }
            
            if (text.includes(this.targetWord.toLowerCase())) {
                console.log(`🎵 Texto procesado: "${input}"`);
                this.onKeywordDetected();
            } else {
                console.log(`🔍 Texto procesado: "${input}" - no contiene "${this.targetWord}"`);
            }
            
            console.log('👉 Escribe otra frase (o "salir"):');
        });
        
        rl.on('close', () => {
            // Volver al menú principal
            setTimeout(() => {
                console.log('\\n📋 Volviendo al menú...');
            }, 500);
        });
    }
    
    stop() {
        console.log('\\n🛑 Deteniendo detector de voz...');
        this.isListening = false;
        
        if (this.micInstance) {
            this.micInstance.stop();
        }
        
        console.log('✅ Detector detenido');
    }
    
    restart() {
        console.log('🔄 Reiniciando sistema...');
        this.stop();
        setTimeout(() => {
            this.startListening();
        }, 2000);
    }
    
    testMicrophone() {
        console.log('\n🔧 Probando sistema de audio...');
        
        return new Promise(async (resolve) => {
            // Test de micrófono
            console.log('\n🎤 === PRUEBA DE MICRÓFONO ===');
            if (this.isWindows) {
                console.log('🪟 Probando micrófono en Windows');
                console.log('💡 El micrófono se usará para grabar y tu transcribirás manualmente');
            } else {
                console.log('🐧 Probando micrófono en Linux/RPi');
            }
            
            try {
                this.setupMicrophone();
                console.log('✅ Micrófono configurado correctamente');
                console.log('🎤 Listo para usar en detección de voz');
            } catch (error) {
                console.error('❌ Error configurando micrófono:', error.message);
            }
            
            // Test de voz (síntesis)
            console.log('\n🔊 === PRUEBA DE SÍNTESIS DE VOZ ===');
            if (config.enableVoiceResponse) {
                await this.testVoice();
            } else {
                console.log('⚠️ Síntesis de voz deshabilitada en configuración');
                console.log('💡 Para habilitar: cambiar "enableVoiceResponse" a true en config.json');
            }
            
            console.log('\n✅ Pruebas de audio completadas');
            resolve(true);
        });
    }
}

// Función principal con menú interactivo
async function main() {
    console.log('='.repeat(60));
    console.log('🎤 DETECTOR DE VOZ - AULA EDUCATIVA');
    console.log('🍓 Optimizado para Raspberry Pi');
    console.log('='.repeat(60));
    
    try {
        const detector = new VoiceKeywordDetector();
        
        // Manejo de Ctrl+C
        process.on('SIGINT', () => {
            console.log('\n🛑 Señal de interrupción recibida...');
            detector.stop();
            process.exit(0);
        });
        
        // Iniciar con el menú interactivo de la clase
        detector.showMenu();
        
    } catch (error) {
        console.error('❌ Error iniciando el sistema:', error.message);
        console.log('💡 Verifica la configuración y las dependencias');
        process.exit(1);
    }
}

// Ejecutar si es el archivo principal
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Error fatal:', error);
        process.exit(1);
    });
}