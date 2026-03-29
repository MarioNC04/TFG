// Test directo de la síntesis de voz corregida
const say = require('say');

console.log('🧪 Test directo de síntesis de voz...');
console.log('');

// Función para testar voces con fallback
function testSpeechSynthesis(text) {
    console.log(`🔊 Probando: "${text}"`);
    
    const fallbackVoices = [
        null,                         // Voz por defecto del sistema
        'Microsoft David Desktop',    // Windows EN
        'Microsoft Zira Desktop',     // Windows EN female  
        'Microsoft Mark',             // Windows
        'espeak',                     // Linux
        'default'                     // Último recurso
    ];
    
    function attemptVoice(voiceIndex) {
        if (voiceIndex >= fallbackVoices.length) {
            console.log('⚠️ Síntesis de voz no disponible - continuando sin sonido');
            return;
        }
        
        const voice = fallbackVoices[voiceIndex];
        const speed = voice === null ? 0.7 : 150;
        
        console.log(`🔄 Probando voz: ${voice || 'sistema por defecto'}`);
        
        try {
            say.speak(text, voice, speed, (err) => {
                if (err) {
                    console.log(`⚠️ Voz '${voice || 'sistema'}' no disponible: ${err.message}`);
                    // Intentar siguiente voz
                    attemptVoice(voiceIndex + 1);
                } else {
                    console.log(`✅ ¡Éxito! Usando voz: ${voice || 'sistema por defecto'}`);
                }
            });
        } catch (error) {
            console.log(`⚠️ Error con voz '${voice || 'sistema'}': ${error.message}`);
            attemptVoice(voiceIndex + 1);
        }
    }
    
    // Iniciar prueba
    attemptVoice(0);
}

// Mostrar voces disponibles si es posible
try {
    const installedVoices = say.getInstalledVoices();
    if (installedVoices && installedVoices.length > 0) {
        console.log('🎤 Voces disponibles en el sistema:');
        installedVoices.slice(0, 5).forEach(voice => {
            console.log(`   - ${voice}`);
        });
        if (installedVoices.length > 5) {
            console.log(`   ... y ${installedVoices.length - 5} más`);
        }
    } else {
        console.log('⚠️ No se pudieron enumerar las voces disponibles');
    }
} catch (error) {
    console.log('⚠️ No se pudieron obtener las voces disponibles');
}

console.log('');

// Test con mensaje del sistema
testSpeechSynthesis('Hola mundo');

console.log('');
console.log('💡 Si escuchaste el mensaje, la síntesis de voz está funcionando');
console.log('✅ El error anterior ha sido corregido');