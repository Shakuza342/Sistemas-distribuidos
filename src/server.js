import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import { cargarConfig, leerArgConfig } from './config.js';
import { crearNodo } from './app.js';

const [mayor, menor] = process.versions.node.split('.').map(Number);
if (mayor < 22 || (mayor === 22 && menor < 13)) {
  console.error(`Se necesita Node.js 22.13 o superior (tiene ${process.versions.node}).`);
  process.exit(1);
}

const rutaConfig = leerArgConfig();
const cfg = cargarConfig(rutaConfig);
const nodo = crearNodo(cfg);

const servidor = cfg.https
  ? https.createServer({ cert: fs.readFileSync(cfg.https.cert), key: fs.readFileSync(cfg.https.key) }, nodo.app)
  : http.createServer(nodo.app);

function ipsLocales() {
  return Object.values(os.networkInterfaces()).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
}

servidor.listen(cfg.puerto, cfg.host, () => {
  const protocolo = cfg.https ? 'https' : 'http';
  console.log(`\n${cfg.nombre}  (id ${nodo.nodo.id})`);
  console.log(`  config:     ${rutaConfig}`);
  console.log(`  base:       ${cfg.db}`);
  console.log(`  local:      ${protocolo}://localhost:${cfg.puerto}`);
  for (const ip of ipsLocales()) console.log(`  red LAN:    ${protocolo}://${ip}:${cfg.puerto}`);
  console.log(`  peers:      ${cfg.peers.length ? cfg.peers.join(', ') : '(ninguno)'}`);
  console.log(`  sync cada:  ${cfg.intervaloSyncSegundos} s`);
  if (nodo.sembrados) console.log(`  semilla:    ${nodo.sembrados} usuarios de prueba creados`);
  console.log('');

  nodo.iniciarSyncPeriodico(resultados => {
    for (const r of resultados) {
      const hora = new Date().toLocaleTimeString();
      if (r.omitido) continue;
      if (!r.ok) console.log(`[${hora}] sync ${r.url}: sin conexión (${r.error})`);
      else if (r.recibidos || r.enviados || r.conflictos.length) {
        console.log(`[${hora}] sync ${r.nodo}: recibidos ${r.recibidos}, enviados ${r.enviados}, conflictos ${r.conflictos.length}`);
      }
    }
  });
});

function apagar() {
  console.log(`\nCerrando ${cfg.nombre}...`);
  servidor.close();
  nodo.cerrar();
  process.exit(0);
}
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
