#!/usr/bin/env node
/**
 * Servidor local que simula la API de TecnoCRA.
 * Uso: npm run server
 */

const path = require('path');
const { loadConfig } = require('../src/config');
const { Store } = require('./store');
const { createApp } = require('./app');

const config = loadConfig();
const dataFile = path.resolve(__dirname, '..', config.server.dataFile);
const store = new Store(dataFile);
const app = createApp(store, { defaultSubject: config.defaultSubject });

app.listen(config.server.port, config.server.host, () => {
    console.log(`🦊 API simulada de TecnoCRA en http://localhost:${config.server.port}/api`);
    console.log(`🖥️  Panel del avatar en http://localhost:${config.server.port}/`);
    console.log(`💾 Datos en ${dataFile}`);
});
