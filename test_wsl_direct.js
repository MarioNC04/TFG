// Test directo de la funcionalidad WSL para detectar voz
const fs = require('fs');
const { spawn, exec } = require('child_process');

console.log('🧪 Test directo de captura de audio WSL...');
console.log('');

// Verificar WSL
const isWSL = fs.existsSync('/proc/version') && 
              fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');

if (!isWSL) {
    console.log('❌ No estás en WSL - este test requiere WSL');
    process.exit(1);
}

console.log('✅ Entorno WSL detectado');
console.log('🎤 Iniciando test de captura de audio con RDPSource...');
console.log('');

// Test directo con parecord
const audioFile = '/tmp/test_wsl_audio.wav';

console.log('🔴 Iniciando captura de 3 segundos...');
console.log('🗣️ ¡Habla ahora! Di "voluntario" o cualquier palabra...');

const recordProcess = spawn('parecord', [
    '--device=RDPSource',
    '--format=s16le', 
    '--rate=44100',
    '--channels=1',
    audioFile
]);

recordProcess.on('error', (error) => {
    console.error('❌ Error en parecord:', error.message);
    console.log('🔄 Intentando con dispositivo por defecto...');
    
    // Fallback a dispositivo por defecto
    const fallbackProcess = spawn('parecord', [
        '--format=s16le',
        '--rate=44100', 
        '--channels=1',
        audioFile
    ]);
    
    setTimeout(() => {
        fallbackProcess.kill('SIGINT');
        checkAudioFile();
    }, 3000);
    
    return;
});

// Detener después de 3 segundos
setTimeout(() => {
    recordProcess.kill('SIGINT');
    
    // Verificar el archivo después de un momento
    setTimeout(checkAudioFile, 500);
}, 3000);

function checkAudioFile() {
    console.log('\n🛑 Captura completada');
    
    try {
        if (fs.existsSync(audioFile)) {
            const stats = fs.statSync(audioFile);
            console.log(`📊 Archivo de audio: ${stats.size} bytes`);
            
            if (stats.size > 1000) {
                console.log('✅ Audio capturado exitosamente');
                console.log('🎉 La implementación WSL está funcionando');
                console.log('');
                console.log('💡 Próximos pasos:');
                console.log('   1. Ejecuta: node main.js');
                console.log('   2. Selecciona opción 1');
                console.log('   3. Habla cuando veas "🎤 Grabando desde micrófono WSL..."');
                console.log('   4. Presiona ENTER cuando termines');
                
                // Limpiar archivo
                fs.unlinkSync(audioFile);
            } else {
                console.log('⚠️ Audio muy pequeño o vacío');
                console.log('💡 Verifica que tu micrófono esté funcionando en Windows');
            }
        } else {
            console.log('❌ No se creó archivo de audio');
            console.log('💡 Verifica configuración de PulseAudio');
        }
    } catch (error) {
        console.error('❌ Error verificando archivo:', error.message);
    }
}