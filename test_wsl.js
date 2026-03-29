// Test básico para verificar entorno WSL
const fs = require('fs');
const { spawn, exec } = require('child_process');

console.log('🧪 Test de entorno WSL...');

// Verificar si estamos en WSL
const isWSL = fs.existsSync('/proc/version') && 
              fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');

console.log(`📊 ¿Es WSL? ${isWSL}`);
console.log(`📊 Entorno: ${process.platform}`);

if (isWSL) {
    console.log('\n🔧 Verificando PulseAudio en WSL...');
    
    // Test de PulseAudio
    exec('pactl info', (error, stdout, stderr) => {
        if (error) {
            console.log('❌ PulseAudio no disponible:', error.message);
            return;
        }
        
        console.log('✅ PulseAudio funcionando');
        console.log('📊 Información básica PulseAudio:');
        const lines = stdout.split('\n').slice(0, 3);
        lines.forEach(line => {
            if (line.trim()) console.log(`   ${line.trim()}`);
        });
        
        // Verificar RDPSource
        exec('pactl list sources short', (error2, stdout2) => {
            if (!error2 && stdout2.includes('RDPSource')) {
                console.log('✅ RDPSource disponible para micrófono');
            } else {
                console.log('⚠️ RDPSource no encontrado');
            }
            
            console.log('\n💡 Sistema WSL listo para prueba de voz');
            console.log('🎤 Para probar: node main.js → opción 1');
        });
    });
} else {
    console.log('\n⚠️ No se detectó WSL - usando modo Windows/simulación');
}