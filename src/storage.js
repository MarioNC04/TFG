/**
 * Lectura y escritura de ficheros JSON.
 *
 * La escritura es atómica: primero se escribe un fichero temporal y después
 * se renombra. Si la Raspberry se desenchufa a mitad, queda el fichero
 * anterior completo en lugar de uno a medio escribir.
 */

const fs = require('fs');
const path = require('path');

function readJson(file, fallback) {
    if (!file || !fs.existsSync(file)) return fallback;
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        return fallback;
    }
}

function writeJsonAtomic(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    const fd = fs.openSync(temp, 'w');
    try {
        fs.writeSync(fd, JSON.stringify(data, null, 2));
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
    fs.renameSync(temp, file);
}

/** Añade una entrada a un fichero JSON que contiene una lista. */
function appendJson(file, entry) {
    writeJsonAtomic(file, [...readJson(file, []), entry]);
}

module.exports = { readJson, writeJsonAtomic, appendJson };
