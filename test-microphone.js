#!/usr/bin/env node
/**
 * Test de Micrófono para Raspberry Pi
 * Verifica que el micrófono esté funcionando correctamente
 */

const mic = require('mic');
const fs = require('fs');
const wav = require('wav');
const path = require('path');

class MicrophoneTest {
    constructor() {
        console.log('🔧 Iniciando test de micrófono para Raspberry Pi...');
        this.outputFile = path.join(__dirname, 'test-audio.wav');
    }
    
    testBasicCapture() {
        return new Promise((resolve, reject) => {
            console.log('\n📊 Prueba 1: Captura básica de audio');
            
            const micInstance = mic({
                rate: '16000',
                channels: '1',
                debug: false,
                exitOnSilence: 3
            });
            
            const micInputStream = micInstance.getAudioStream();
            
            micInputStream.on('data', (data) => {
                console.log('🎵 Audio detectado:', data.length, 'bytes');
            });
            
            micInputStream.on('error', (err) => {
                console.error('❌ Error de micrófono:', err);
                reject(err);
            });
            
            micInputStream.on('silence', () => {
                console.log('🔇 Silencio detectado - deteniendo test');
                micInstance.stop();
                resolve(true);
            });
            
            console.log('🎤 Habla durante unos segundos...');
            micInstance.start();
            
            // Timeout de seguridad
            setTimeout(() => {
                micInstance.stop();
                resolve(true);
            }, 10000);
        });
    }
    
    testAudioDevices() {
        console.log('\n📊 Prueba 2: Listado de dispositivos de audio');
        
        // En Raspberry Pi, verificar dispositivos ALSA comunes
        const commonDevices = [
            'plughw:0,0',  // Audio onboard
            'plughw:1,0',  // USB Audio (común para micrófonos USB)
            'plughw:2,0',  // Segundo dispositivo USB
            'default'      // Dispositivo por defecto
        ];
        
        console.log('🎛️  Dispositivos típicos en Raspberry Pi:');
        commonDevices.forEach((device, index) => {
            console.log(`   ${index + 1}. ${device}`);
        });
        
        console.log('\n💡 Para listar dispositivos reales, ejecuta en terminal:');
        console.log('   arecord -l');
        console.log('   aplay -l');
    }
    
    recordSample() {
        return new Promise((resolve, reject) => {
            console.log('\n📊 Prueba 3: Grabación de muestra (5 segundos)');
            console.log('🗣️  Habla algo...');
            
            const micInstance = mic({
                rate: '16000',
                channels: '1',
                debug: false
            });
            
            const micInputStream = micInstance.getAudioStream();
            const writer = new wav.FileWriter(this.outputFile, {
                sampleRate: 16000,
                channels: 1
            });
            
            micInputStream.pipe(writer);
            
            micInputStream.on('error', (err) => {
                console.error('❌ Error:', err);
                reject(err);
            });
            
            writer.on('error', (err) => {
                console.error('❌ Error de archivo:', err);
                reject(err);
            });
            
            writer.on('done', () => {
                console.log(`✅ Archivo guardado: ${this.outputFile}`);
                this.checkFileSize();
                resolve(true);
            });
            
            micInstance.start();
            
            setTimeout(() => {
                micInstance.stop();
            }, 5000);
        });
    }
    
    checkFileSize() {
        try {
            const stats = fs.statSync(this.outputFile);
            const fileSizeKB = Math.round(stats.size / 1024);
            
            console.log(`📁 Tamaño del archivo: ${fileSizeKB} KB`);
            
            if (fileSizeKB > 50) {
                console.log('✅ El micrófono está capturando audio correctamente');
            } else if (fileSizeKB > 0) {
                console.log('⚠️  Audio capturado pero muy bajo - verificar volumen');
            } else {
                console.log('❌ No se capturó audio - problema con el micrófono');
            }
        } catch (error) {
            console.error('❌ Error verificando archivo:', error.message);
        }
    }
    
    showSystemInfo() {
        console.log('\n📊 Información del sistema:');
        console.log(`🖥️  Plataforma: ${process.platform}`);
        console.log(`📡 Arquitectura: ${process.arch}`);
        console.log(`⚡ Node.js: ${process.version}`);
        
        // Info específica de Raspberry Pi
        if (process.platform === 'linux') {
            console.log('\n🍓 Comandos útiles para Raspberry Pi:');
            console.log('   sudo raspi-config  # Habilitar audio');
            console.log('   alsamixer         # Ajustar volúmenes');
            console.log('   arecord -l        # Listar dispositivos de grabación');
            console.log('   speaker-test      # Probar altavoces');
        }
    }
    
    cleanup() {
        // Limpiar archivos de test
        try {
            if (fs.existsSync(this.outputFile)) {
                fs.unlinkSync(this.outputFile);
                console.log('🧹 Archivos de test eliminados');
            }
        } catch (error) {
            console.error('⚠️  Error limpiando archivos:', error.message);
        }
    }
}

async function runTests() {
    console.log('=' * 50);
    console.log('🔧 TEST DE MICRÓFONO - RASPBERRY PI');
    console.log('=' * 50);
    
    const tester = new MicrophoneTest();
    
    try {
        tester.showSystemInfo();
        tester.testAudioDevices();
        
        await tester.testBasicCapture();
        await tester.recordSample();
        
        console.log('\n✅ Tests completados');
        console.log('\n💡 Si hay problemas:');
        console.log('   1. Verifica conexión del micrófono USB');
        console.log('   2. Ejecuta: sudo raspi-config > Advanced > Audio');
        console.log('   3. Ajusta volumen: alsamixer');
        console.log('   4. Reinicia el sistema si es necesario');
        
    } catch (error) {
        console.error('\n❌ Error en tests:', error.message);
    } finally {
        tester.cleanup();
    }
}

if (require.main === module) {
    runTests();
}