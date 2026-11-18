import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { crearNodo } from '../src/app.js';
import { agregarPeer } from '../src/db.js';
import { verificarIntegridad } from '../src/integridad.js';

const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'veeduria-test-'));
const nodos = {};

function configurar(nombre, semilla) {
  return {
    nombre,
    db: path.join(carpeta, nombre + '.db'),
    urlPublica: 'http://localhost',
    peers: [],
    intervaloSyncSegundos: 3600,
    claveRed: 'clave-test',
    jwtSecreto: 'jwt-test',
    semilla
  };
}

async function levantar(nombre, semilla = false) {
  const n = crearNodo(configurar(nombre, semilla));
  await new Promise(ok => { n.servidor = n.app.listen(0, '127.0.0.1', ok); });
  n.url = `http://127.0.0.1:${n.servidor.address().port}`;
  nodos[nombre] = n;
  return n;
}

async function bajar(n) {
  await new Promise(ok => n.servidor.close(ok));
}

async function api(n, metodo, ruta, cuerpo, token) {
  const resp = await fetch(n.url + '/api/v1' + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  return { status: resp.status, datos: await resp.json().catch(() => null) };
}

async function login(n, correo, password) {
  const r = await api(n, 'POST', '/auth/login', { correo, password });
  assert.equal(r.status, 200, `login ${correo} en ${n.nodo.nombre}`);
  return r.datos.token;
}

const contarQuejas = n => n.db.prepare('SELECT COUNT(*) AS c FROM queja').get().c;

before(async () => {
  await levantar('A', true);
  await levantar('B');
  await levantar('C');
  agregarPeer(nodos.A.db, nodos.B.url);
  agregarPeer(nodos.B.db, nodos.C.url);
  agregarPeer(nodos.C.db, nodos.A.url);
});

after(() => {
  for (const n of Object.values(nodos)) {
    try { n.servidor.close(); } catch {}
    try { n.cerrar(); } catch {}
  }
  fs.rmSync(carpeta, { recursive: true, force: true });
});

test('los usuarios creados en el nodo A llegan a B y C por sincronización', async () => {
  await nodos.A.sincronizarAhora();
  await nodos.B.sincronizarAhora();
  for (const n of [nodos.B, nodos.C]) {
    assert.equal(n.db.prepare('SELECT COUNT(*) AS c FROM usuario').get().c, 5);
  }
  await login(nodos.C, 'laura@conjunto.co', 'vecino123');
});

test('RF-01/RF-03: una queja creada en B se replica a A y C con el mismo hash', async () => {
  const t = await login(nodos.B, 'laura@conjunto.co', 'vecino123');
  const r = await api(nodos.B, 'POST', '/quejas', {
    titulo: 'Fuga de agua en el parqueadero',
    descripcion: 'Hay una fuga constante cerca del puesto 45 del sótano',
    categoria: 'agua',
    fotos: ['data:image/jpeg;base64,' + Buffer.from('foto-de-prueba').toString('base64')]
  }, t);
  assert.equal(r.status, 201);
  assert.equal(r.datos.hash.length, 64);

  await nodos.B.sincronizarAhora();
  await nodos.C.sincronizarAhora();
  for (const n of [nodos.A, nodos.C]) {
    const q = n.db.prepare('SELECT hash FROM queja WHERE id = ?').get(r.datos.id);
    assert.equal(q.hash, r.datos.hash);
    assert.equal(n.db.prepare('SELECT COUNT(*) AS c FROM foto WHERE queja_id = ?').get(r.datos.id).c, 1);
  }
});

test('las quejas de un mismo nodo quedan encadenadas por hash_anterior', async () => {
  const t = await login(nodos.B, 'carlos@conjunto.co', 'vecino123');
  const r = await api(nodos.B, 'POST', '/quejas', { titulo: 'Ruido en la noche', descripcion: 'Fiesta en el apartamento 803 hasta las 3 am', categoria: 'ruido' }, t);
  const anterior = nodos.B.db.prepare("SELECT hash FROM queja WHERE titulo = 'Fuga de agua en el parqueadero'").get().hash;
  assert.equal(r.datos.hash_anterior, anterior);
});

test('RF-04: no existe DELETE y la base rechaza UPDATE/DELETE directos', async () => {
  const t = await login(nodos.A, 'admin@conjunto.co', 'admin123');
  const id = nodos.A.db.prepare('SELECT id FROM queja LIMIT 1').get().id;
  const r = await api(nodos.A, 'DELETE', '/quejas/' + id, null, t);
  assert.equal(r.status, 404);
  assert.throws(() => nodos.A.db.prepare('DELETE FROM queja WHERE id = ?').run(id), /append-only/);
  assert.throws(() => nodos.A.db.prepare("UPDATE queja SET titulo = 'x' WHERE id = ?").run(id), /append-only/);
});

test('RF-05: el administrador cambia estados, solo hacia adelante, y queda registro', async () => {
  const t = await login(nodos.A, 'admin@conjunto.co', 'admin123');
  const id = nodos.A.db.prepare("SELECT id FROM queja WHERE titulo = 'Fuga de agua en el parqueadero'").get().id;
  assert.equal((await api(nodos.A, 'POST', `/quejas/${id}/estados`, { estado: 'en_proceso' }, t)).status, 201);
  assert.equal((await api(nodos.A, 'POST', `/quejas/${id}/estados`, { estado: 'vista' }, t)).status, 409);
  const h = await api(nodos.A, 'GET', `/quejas/${id}/historial`, null, t);
  assert.equal(h.datos.length, 2);
  assert.ok(h.datos.every(x => x.hash_valido && x.enlace_valido));
});

test('control de acceso por rol (403)', async () => {
  const vecino = await login(nodos.A, 'diana@conjunto.co', 'vecino123');
  const auditor = await login(nodos.A, 'consejo@conjunto.co', 'consejo123');
  const id = nodos.A.db.prepare('SELECT id FROM queja LIMIT 1').get().id;
  assert.equal((await api(nodos.A, 'POST', `/quejas/${id}/estados`, { estado: 'resuelta' }, vecino)).status, 403);
  assert.equal((await api(nodos.A, 'POST', '/quejas', { titulo: 'xxxx', descripcion: 'xxxxxxxxxxxx', categoria: 'otro' }, auditor)).status, 403);
  assert.equal((await api(nodos.A, 'GET', '/reportes/agregado', null, vecino)).status, 403);
  assert.equal((await api(nodos.A, 'GET', '/reportes/agregado', null, auditor)).status, 200);
  assert.equal((await api(nodos.A, 'GET', '/quejas')).status, 401);
});

test('RNF-01: un nodo desconectado registra quejas y al volver se sincroniza sin duplicados', async () => {
  await bajar(nodos.C);
  const res = await nodos.B.sincronizarAhora();
  assert.ok(res.some(r => !r.ok), 'B debe notar que C no responde');

  const n = nodos.C.modelo;
  const autor = nodos.C.db.prepare("SELECT * FROM usuario WHERE correo = 'diana@conjunto.co'").get();
  const id = crypto.randomUUID();
  n.crearQueja({ id, titulo: 'Bombillo fundido', descripcion: 'El pasillo del piso 2 de la torre 3 está oscuro', categoria: 'luz' }, autor);
  n.crearQueja({ id, titulo: 'Bombillo fundido', descripcion: 'El pasillo del piso 2 de la torre 3 está oscuro', categoria: 'luz' }, autor);
  assert.equal(nodos.C.db.prepare('SELECT COUNT(*) AS c FROM queja WHERE id = ?').get(id).c, 1);

  await new Promise(ok => { nodos.C.servidor = nodos.C.app.listen(Number(nodos.C.url.split(':').pop()), '127.0.0.1', ok); });
  await nodos.C.sincronizarAhora();
  await nodos.A.sincronizarAhora();
  await nodos.B.sincronizarAhora();

  const total = contarQuejas(nodos.A);
  assert.equal(total, 3);
  assert.equal(contarQuejas(nodos.B), total);
  assert.equal(contarQuejas(nodos.C), total);
});

test('Métrica de integridad: una edición directa en el SQLite se detecta y no se propaga', async () => {
  const db = nodos.B.db;
  const q = db.prepare("SELECT id FROM queja WHERE titulo = 'Ruido en la noche'").get();
  db.exec('DROP TRIGGER queja_sin_update');
  db.prepare("UPDATE queja SET descripcion = 'No hubo ningún ruido' WHERE id = ?").run(q.id);

  const local = verificarIntegridad(db);
  assert.ok(local.problemas.some(p => p.tipo === 'hash_alterado' && p.registro_id === q.id));
  assert.ok(local.porcentaje_verificable < 100);

  await nodos.B.sincronizarAhora();
  await nodos.A.sincronizarAhora();
  const enA = nodos.A.db.prepare('SELECT descripcion FROM queja WHERE id = ?').get(q.id);
  assert.notEqual(enA.descripcion, 'No hubo ningún ruido');
  const conflictoA = nodos.A.db.prepare("SELECT * FROM conflicto WHERE registro_id = ? AND tipo = 'version_distinta'").get(q.id);
  assert.ok(conflictoA, 'A debe registrar el conflicto');
  const conflictoB = db.prepare("SELECT * FROM conflicto WHERE registro_id = ?").get(q.id);
  assert.match(conflictoB.detalle, /alterada en este nodo/);
});

test('Manipulación recalculando el hash: igual se detecta al comparar con los otros nodos', async () => {
  const db = nodos.A.db;
  const { hashQueja } = await import('../src/hash.js');
  const q = db.prepare("SELECT * FROM queja WHERE titulo = 'Bombillo fundido'").get();
  const falsa = { ...q, titulo: 'Bombillo cambiado (resuelto)' };
  db.exec('DROP TRIGGER IF EXISTS queja_sin_update');
  db.prepare('UPDATE queja SET titulo = ?, hash = ? WHERE id = ?').run(falsa.titulo, hashQueja(falsa), q.id);

  await nodos.A.sincronizarAhora();
  const c = nodos.B.db.prepare("SELECT * FROM conflicto WHERE registro_id = ? AND tipo = 'version_distinta'").get(q.id);
  assert.ok(c, 'B detecta que A tiene otra versión');
  assert.equal(nodos.B.db.prepare('SELECT titulo FROM queja WHERE id = ?').get(q.id).titulo, 'Bombillo fundido');
});

test('Un registro borrado a la fuerza se restaura desde otro nodo y queda evidencia', async () => {
  const db = nodos.B.db;
  const q = db.prepare("SELECT id FROM queja WHERE titulo = 'Fuga de agua en el parqueadero'").get();
  db.exec('DROP TRIGGER queja_sin_delete; DROP TRIGGER foto_sin_delete; DROP TRIGGER historial_estado_sin_delete;');
  db.prepare('DELETE FROM historial_estado WHERE queja_id = ?').run(q.id);
  db.prepare('DELETE FROM foto WHERE queja_id = ?').run(q.id);
  db.prepare('DELETE FROM queja WHERE id = ?').run(q.id);

  await nodos.B.sincronizarAhora();
  assert.ok(db.prepare('SELECT 1 FROM queja WHERE id = ?').get(q.id), 'la queja vuelve a B');
  assert.ok(db.prepare("SELECT 1 FROM conflicto WHERE registro_id = ? AND tipo = 'registro_restaurado'").get(q.id));
});

test('Métrica de cobertura: el reporte agregado incluye el 100% de las quejas', async () => {
  const t = await login(nodos.C, 'consejo@conjunto.co', 'consejo123');
  const r = await api(nodos.C, 'GET', '/reportes/agregado', null, t);
  assert.equal(r.datos.cobertura_auditoria.porcentaje, 100);
  assert.equal(r.datos.total_quejas, contarQuejas(nodos.C));
});

test('Sincronización por USB: exportar de un nodo e importar en uno nuevo', async () => {
  const t = await login(nodos.A, 'admin@conjunto.co', 'admin123');
  const paquete = (await api(nodos.A, 'GET', '/nodos/exportar', null, t)).datos;
  const D = await levantar('D');
  const tD = (await api(D, 'POST', '/auth/login', { correo: 'admin@conjunto.co', password: 'admin123' })).status;
  assert.equal(tD, 401, 'D todavía no conoce a nadie');
  const { importarPaquete } = await import('../src/sync.js');
  const r = importarPaquete(D.db, D.nodo, paquete);
  assert.ok(r.insertados > 0);
  assert.equal(contarQuejas(D), contarQuejas(nodos.A));
  await login(D, 'admin@conjunto.co', 'admin123');
});

test('Un nodo con otra clave de red es rechazado', async () => {
  const resp = await fetch(nodos.A.url + '/api/v1/nodos/sincronizar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Clave-Red': 'otra' },
    body: JSON.stringify({ nodo: { id: 'x' } })
  });
  assert.equal(resp.status, 401);
});

test('Circuit breaker: tras 3 fallos seguidos el peer queda en pausa y un éxito lo reinicia', async () => {
  const { crearCircuito } = await import('../src/circuito.js');
  const c = crearCircuito({ fallosParaAbrir: 3, esperaBaseMs: 60000 });
  const url = 'http://10.0.0.9:3001';
  c.fallo(url); c.fallo(url);
  assert.equal(c.puedeIntentar(url), true);
  c.fallo(url);
  assert.equal(c.puedeIntentar(url), false);
  assert.equal(c.consultar(url).estado, 'abierto');
  c.exito(url);
  assert.equal(c.consultar(url).estado, 'cerrado');
});

test('Login: 5 contraseñas erradas seguidas bloquean la cuenta 10 minutos (429)', async () => {
  for (let i = 0; i < 5; i++) {
    assert.equal((await api(nodos.A, 'POST', '/auth/login', { correo: 'carlos@conjunto.co', password: 'mala' })).status, 401);
  }
  assert.equal((await api(nodos.A, 'POST', '/auth/login', { correo: 'carlos@conjunto.co', password: 'vecino123' })).status, 429);
});
