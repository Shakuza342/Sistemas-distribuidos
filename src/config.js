import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const porDefecto = {
  nombre: 'Nodo',
  puerto: 3001,
  host: '0.0.0.0',
  db: 'datos/nodo.db',
  urlPublica: null,
  peers: [],
  intervaloSyncSegundos: 30,
  timeoutSyncMs: 8000,
  claveRed: 'clave-compartida-del-conjunto-cambiar',
  jwtSecreto: 'secreto-jwt-del-conjunto-cambiar',
  semilla: false,
  https: null
};

export function leerArgConfig(argv = process.argv) {
  const i = argv.indexOf('--config');
  return i >= 0 ? argv[i + 1] : process.env.VEEDURIA_CONFIG || 'nodos/nodo1.json';
}

export function cargarConfig(ruta) {
  const absoluta = path.isAbsolute(ruta) ? ruta : path.join(RAIZ, ruta);
  const leida = JSON.parse(fs.readFileSync(absoluta, 'utf8'));
  const cfg = { ...porDefecto, ...leida };
  if (cfg.db !== ':memory:' && !path.isAbsolute(cfg.db)) cfg.db = path.join(RAIZ, cfg.db);
  // En contenedores conviene pasar estos valores por variables de entorno (archivo .env de Docker Compose)
  const env = process.env;
  if (env.NOMBRE_NODO) cfg.nombre = env.NOMBRE_NODO;
  if (env.URL_PUBLICA) cfg.urlPublica = env.URL_PUBLICA;
  if (env.PEERS !== undefined) cfg.peers = env.PEERS.split(',').map(x => x.trim()).filter(Boolean);
  if (env.CLAVE_RED) cfg.claveRed = env.CLAVE_RED;
  if (env.JWT_SECRETO) cfg.jwtSecreto = env.JWT_SECRETO;
  if (env.INTERVALO_SYNC) cfg.intervaloSyncSegundos = Number(env.INTERVALO_SYNC);
  if (env.SEMILLA) cfg.semilla = env.SEMILLA === 'true';
  if (!cfg.urlPublica) cfg.urlPublica = `${cfg.https ? 'https' : 'http'}://localhost:${cfg.puerto}`;
  if (cfg.https) {
    cfg.https.cert = path.isAbsolute(cfg.https.cert) ? cfg.https.cert : path.join(RAIZ, cfg.https.cert);
    cfg.https.key = path.isAbsolute(cfg.https.key) ? cfg.https.key : path.join(RAIZ, cfg.https.key);
  }
  return cfg;
}
