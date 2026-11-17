/**
 * Comprueba si la hora del sistema está sincronizada.
 *
 * La Raspberry Pi no tiene reloj propio: al arrancar toma la hora de internet
 * (NTP). Hasta entonces la hora puede ser incorrecta y el horario no serviría,
 * así que no se inicia ninguna sesión hasta que esté sincronizada.
 */

const { execFileSync } = require('child_process');

let synced = false;

function isClockSynchronized() {
    if (synced || process.platform !== 'linux') return true;
    try {
        const value = execFileSync('timedatectl', ['show', '-p', 'NTPSynchronized', '--value'], { encoding: 'utf8', timeout: 2000 }).trim();
        synced = value === 'yes';
        return synced;
    } catch (error) {
        // Sin systemd (WSL, contenedores): no se puede saber; se da por buena.
        return true;
    }
}

module.exports = { isClockSynchronized };
