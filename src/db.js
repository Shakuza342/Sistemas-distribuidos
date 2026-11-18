import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { hashQueja, hashHistorial, hashComentario, hashApoyo, hashFoto, huellaUsuario } from './hash.js';

export const CATEGORIAS = ['aseo', 'ascensores', 'agua', 'luz', 'seguridad', 'ruido', 'mascotas', 'parqueo', 'otro'];
export const ESTADOS = ['nueva', 'vista', 'en_proceso', 'resuelta'];
export const ROLES = ['vecino', 'administrador', 'auditor'];

const lista = arr => arr.map(v => `'${v}'`).join(',');

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS meta (
  clave TEXT PRIMARY KEY,
  valor TEXT
);

CREATE TABLE IF NOT EXISTS nodo (
  id TEXT PRIMARY KEY,
  nombre TEXT,
  url TEXT,
  es_local INTEGER NOT NULL DEFAULT 0,
  es_peer INTEGER NOT NULL DEFAULT 0,
  ultima_sync TEXT,
  ultimo_error TEXT
);

CREATE TABLE IF NOT EXISTS usuario (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  correo TEXT NOT NULL UNIQUE,
  hash_password TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN (${lista(ROLES)})),
  unidad_residencial TEXT NOT NULL,
  nodo_id TEXT REFERENCES nodo(id)
);

CREATE TABLE IF NOT EXISTS queja (
  id TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN (${lista(CATEGORIAS)})),
  ubicacion_lat REAL,
  ubicacion_lng REAL,
  fecha_creacion TEXT NOT NULL,
  autor_id TEXT NOT NULL REFERENCES usuario(id),
  nodo_origen TEXT NOT NULL REFERENCES nodo(id),
  hash TEXT NOT NULL UNIQUE,
  hash_anterior TEXT
);

CREATE TABLE IF NOT EXISTS historial_estado (
  id TEXT PRIMARY KEY,
  queja_id TEXT NOT NULL REFERENCES queja(id),
  estado TEXT NOT NULL CHECK (estado IN (${lista(ESTADOS)})),
  responsable_id TEXT NOT NULL REFERENCES usuario(id),
  fecha TEXT NOT NULL,
  nodo_origen TEXT NOT NULL REFERENCES nodo(id),
  hash TEXT NOT NULL UNIQUE,
  hash_anterior TEXT
);

CREATE TABLE IF NOT EXISTS comentario (
  id TEXT PRIMARY KEY,
  queja_id TEXT NOT NULL REFERENCES queja(id),
  autor_id TEXT NOT NULL REFERENCES usuario(id),
  texto TEXT NOT NULL,
  fecha TEXT NOT NULL,
  nodo_origen TEXT NOT NULL REFERENCES nodo(id),
  hash TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS apoyo (
  id TEXT PRIMARY KEY,
  queja_id TEXT NOT NULL REFERENCES queja(id),
  autor_id TEXT NOT NULL REFERENCES usuario(id),
  fecha TEXT NOT NULL,
  nodo_origen TEXT NOT NULL REFERENCES nodo(id),
  hash TEXT NOT NULL UNIQUE,
  UNIQUE (queja_id, autor_id)
);

CREATE TABLE IF NOT EXISTS foto (
  id TEXT PRIMARY KEY,
  queja_id TEXT NOT NULL REFERENCES queja(id),
  datos TEXT NOT NULL,
  nodo_origen TEXT NOT NULL REFERENCES nodo(id),
  hash TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS conflicto (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  tabla TEXT NOT NULL,
  registro_id TEXT NOT NULL,
  nodo_remoto TEXT,
  detalle TEXT,
  fecha TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_queja_nodo ON queja(nodo_origen);
CREATE INDEX IF NOT EXISTS ix_historial_queja ON historial_estado(queja_id);
CREATE INDEX IF NOT EXISTS ix_comentario_queja ON comentario(queja_id);
CREATE INDEX IF NOT EXISTS ix_apoyo_queja ON apoyo(queja_id);
CREATE INDEX IF NOT EXISTS ix_foto_queja ON foto(queja_id);
`;

// RF-04 a nivel de base de datos: las tablas del registro son append-only.
const SOLO_AGREGAR = ['queja', 'historial_estado', 'comentario', 'apoyo', 'foto'];

function triggers() {
  return SOLO_AGREGAR.map(t => `
CREATE TRIGGER IF NOT EXISTS ${t}_sin_update BEFORE UPDATE ON ${t}
BEGIN SELECT RAISE(ABORT, 'registro append-only: no se permite modificar ${t}'); END;
CREATE TRIGGER IF NOT EXISTS ${t}_sin_delete BEFORE DELETE ON ${t}
BEGIN SELECT RAISE(ABORT, 'registro append-only: no se permite eliminar ${t}'); END;`).join('\n');
}

// Definición única de lo que se replica entre nodos. El orden importa:
// primero usuarios, luego quejas y después lo que depende de ellas.
export const TABLAS = [
  {
    nombre: 'usuario',
    columnas: ['id', 'nombre', 'correo', 'hash_password', 'rol', 'unidad_residencial', 'nodo_id'],
    huella: huellaUsuario,
    hashGuardado: false
  },
  {
    nombre: 'queja',
    columnas: ['id', 'titulo', 'descripcion', 'categoria', 'ubicacion_lat', 'ubicacion_lng', 'fecha_creacion', 'autor_id', 'nodo_origen', 'hash', 'hash_anterior'],
    huella: hashQueja,
    hashGuardado: true,
    encadenada: true
  },
  {
    nombre: 'historial_estado',
    columnas: ['id', 'queja_id', 'estado', 'responsable_id', 'fecha', 'nodo_origen', 'hash', 'hash_anterior'],
    huella: hashHistorial,
    hashGuardado: true,
    encadenada: true
  },
  {
    nombre: 'comentario',
    columnas: ['id', 'queja_id', 'autor_id', 'texto', 'fecha', 'nodo_origen', 'hash'],
    huella: hashComentario,
    hashGuardado: true
  },
  {
    nombre: 'apoyo',
    columnas: ['id', 'queja_id', 'autor_id', 'fecha', 'nodo_origen', 'hash'],
    huella: hashApoyo,
    hashGuardado: true
  },
  {
    nombre: 'foto',
    columnas: ['id', 'queja_id', 'datos', 'nodo_origen', 'hash'],
    huella: hashFoto,
    hashGuardado: true
  }
];

export function uuid() {
  return crypto.randomUUID();
}

export function ahora() {
  return new Date().toISOString();
}

export function abrirDB(ruta, nombreNodo, urlPublica) {
  if (ruta !== ':memory:') fs.mkdirSync(path.dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(ESQUEMA);
  db.exec(triggers());

  let fila = db.prepare("SELECT valor FROM meta WHERE clave = 'nodo_id'").get();
  if (!fila) {
    const id = uuid();
    db.prepare("INSERT INTO meta (clave, valor) VALUES ('nodo_id', ?)").run(id);
    fila = { valor: id };
  }
  const nodoId = fila.valor;
  db.prepare(`INSERT INTO nodo (id, nombre, url, es_local) VALUES (?, ?, ?, 1)
              ON CONFLICT(id) DO UPDATE SET nombre = excluded.nombre, url = excluded.url`)
    .run(nodoId, nombreNodo, urlPublica);

  return { db, nodoId };
}

export function agregarPeer(db, url) {
  url = url.replace(/\/+$/, '');
  const existe = db.prepare('SELECT id FROM nodo WHERE url = ? AND es_peer = 1').get(url);
  if (existe) return existe.id;
  const id = 'url:' + url;
  db.prepare('INSERT OR IGNORE INTO nodo (id, nombre, url, es_peer) VALUES (?, ?, ?, 1)').run(id, url, url);
  return id;
}

// Cuando un peer responde por primera vez se conoce su id real y se reemplaza el provisional.
export function vincularPeer(db, url, idReal, nombre) {
  const fila = db.prepare('SELECT id FROM nodo WHERE url = ? AND es_peer = 1').get(url);
  if (!fila || fila.id === idReal) {
    if (fila) db.prepare('UPDATE nodo SET nombre = ? WHERE id = ?').run(nombre, idReal);
    return;
  }
  const ultima = db.prepare('SELECT ultima_sync FROM nodo WHERE id = ?').get(fila.id);
  db.prepare('DELETE FROM nodo WHERE id = ?').run(fila.id);
  db.prepare(`INSERT INTO nodo (id, nombre, url, es_peer, ultima_sync) VALUES (?, ?, ?, 1, ?)
              ON CONFLICT(id) DO UPDATE SET nombre = excluded.nombre, url = excluded.url, es_peer = 1`)
    .run(idReal, nombre, url, ultima?.ultima_sync ?? null);
}

export function conocerNodo(db, { id, nombre }) {
  if (!id || id.startsWith('url:')) return;
  db.prepare(`INSERT INTO nodo (id, nombre) VALUES (?, ?)
              ON CONFLICT(id) DO UPDATE SET nombre = COALESCE(nodo.nombre, excluded.nombre)`).run(id, nombre);
}

export function transaccion(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function registrarConflicto(db, { tipo, tabla, registro_id, nodo_remoto = null, detalle = '' }) {
  const ya = db.prepare(`SELECT 1 FROM conflicto WHERE tipo = ? AND tabla = ? AND registro_id = ?
                         AND IFNULL(nodo_remoto,'') = IFNULL(?, '')`).get(tipo, tabla, registro_id, nodo_remoto);
  if (ya) return false;
  db.prepare(`INSERT INTO conflicto (tipo, tabla, registro_id, nodo_remoto, detalle, fecha)
              VALUES (?, ?, ?, ?, ?, ?)`).run(tipo, tabla, registro_id, nodo_remoto, detalle, ahora());
  return true;
}
