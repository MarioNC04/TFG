/**
 * Respuesta por voz (opcional). En la Raspberry usa espeak; en otros sistemas
 * la librería "say" con la voz del sistema.
 */

const { spawn, execSync } = require('child_process');

function hasEspeak() {
    try {
        execSync('command -v espeak', { stdio: 'ignore' });
        return true;
    } catch (error) {
        return false;
    }
}

function speak(text, { speed = 150 } = {}) {
    if (process.platform === 'linux') {
        if (!hasEspeak()) {
            console.log('⚠️  espeak no está instalado (sudo apt install -y espeak)');
            return;
        }
        spawn('espeak', ['-v', 'es', '-s', String(speed), text], { stdio: 'ignore' });
        return;
    }
    try {
        require('say').speak(text, null, 1.0, (error) => {
            if (error) console.log(`⚠️  Síntesis de voz no disponible: ${error.message}`);
        });
    } catch (error) {
        console.log(`⚠️  Síntesis de voz no disponible: ${error.message}`);
    }
}

module.exports = { speak };
