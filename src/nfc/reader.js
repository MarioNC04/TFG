/**
 * Lector de tarjetas NFC. Emite 'card' con el UID de la tarjeta.
 *
 *  - keyboard: lectores USB que se comportan como teclado (escriben el UID y
 *    pulsan ENTER). También sirve para simular tarjetas escribiendo el UID en
 *    la consola. La consola entrega esas líneas con feed().
 *  - pcsc: lectores PC/SC (p. ej. ACR122U) mediante el paquete opcional
 *    nfc-pcsc (npm install nfc-pcsc).
 */

const EventEmitter = require('events');

class NfcReader extends EventEmitter {
    constructor(mode = 'keyboard') {
        super();
        this.mode = mode;
        this.status = mode === 'keyboard' ? 'teclado / lector USB HID' : mode;
    }

    start() {
        if (this.mode !== 'pcsc') return;
        let NFC;
        try {
            ({ NFC } = require('nfc-pcsc'));
        } catch (error) {
            this.status = 'pcsc no disponible (npm install nfc-pcsc); usando teclado';
            this.mode = 'keyboard';
            return;
        }
        const nfc = new NFC();
        nfc.on('reader', (reader) => {
            this.status = `pcsc: ${reader.name}`;
            reader.on('card', (card) => this.emit('card', String(card.uid).toUpperCase()));
            reader.on('error', (error) => console.log(`⚠️  Error del lector NFC: ${error.message}`));
        });
        nfc.on('error', (error) => console.log(`⚠️  Error NFC: ${error.message}`));
    }

    /** Entrada desde la consola (modo teclado). */
    feed(uid) {
        this.emit('card', uid.trim().toUpperCase());
    }
}

module.exports = { NfcReader };
