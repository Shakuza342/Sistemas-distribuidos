// Simula a alguien con acceso físico al archivo SQLite de un nodo que intenta alterar el registro
// por fuera de la aplicación. Sirve para la métrica de integridad de la sección 8.
//
// Uso: npm run manipular -- --config nodos/nodo1.json --modo editar
//      modos: editar    cambia la descripción de la queja más reciente (sin tocar el hash)
//             rehash    cambia el título y recalcula el hash para "taparlo"
//             estado    borra el último cambio de estado (quita una respuesta de la administración)
//             borrar    elimina la queja más antigua creada en este nodo
import { DatabaseSync } from 'node:sqlite';
import { cargarConfig } from '../src/config.js';
import { hashQueja } from '../src/hash.js';

const arg = nombre => {
  const i = process.argv.indexOf('--' + nombre);
  return i >= 0 ? process.argv[i + 1] : null;
};

const cfg = cargarConfig(arg('config') || 'nodos/nodo1.json');
const modo = arg('modo') || 'editar';
const db = new DatabaseSync(cfg.db);
db.exec('PRAGMA busy_timeout = 5000');

const TABLAS = ['queja', 'historial_estado', 'comentario', 'apoyo', 'foto'];
const quitarTriggers = () => TABLAS.forEach(t => db.exec(`DROP TRIGGER IF EXISTS ${t}_sin_update; DROP TRIGGER IF EXISTS ${t}_sin_delete;`));
const ponerTriggers = () => TABLAS.forEach(t => db.exec(`
  CREATE TRIGGER IF NOT EXISTS ${t}_sin_update BEFORE UPDATE ON ${t} BEGIN SELECT RAISE(ABORT, 'registro append-only: no se permite modificar ${t}'); END;
  CREATE TRIGGER IF NOT EXISTS ${t}_sin_delete BEFORE DELETE ON ${t} BEGIN SELECT RAISE(ABORT, 'registro append-only: no se permite eliminar ${t}'); END;`));

const nodoLocal = db.prepare("SELECT valor FROM meta WHERE clave = 'nodo_id'").get()?.valor;
console.log(`Base atacada: ${cfg.db}  (${cfg.nombre})`);

quitarTriggers();
try {
  if (modo === 'editar') {
    const q = db.prepare('SELECT * FROM queja ORDER BY fecha_creacion DESC LIMIT 1').get();
    if (!q) throw new Error('No hay quejas en este nodo');
    db.prepare("UPDATE queja SET descripcion = 'Todo funciona correctamente, no hay ningún problema.' WHERE id = ?").run(q.id);
    console.log(`Se cambió la descripción de "${q.titulo}" (${q.id}) sin recalcular el hash.`);
  } else if (modo === 'rehash') {
    const q = db.prepare('SELECT * FROM queja ORDER BY fecha_creacion DESC LIMIT 1').get();
    if (!q) throw new Error('No hay quejas en este nodo');
    const falsa = { ...q, titulo: q.titulo + ' (ya solucionado)' };
    const nuevo = hashQueja(falsa);
    db.prepare('UPDATE queja SET titulo = ?, hash = ? WHERE id = ?').run(falsa.titulo, nuevo, q.id);
    console.log(`Se cambió el título de "${q.titulo}" y se recalculó su hash para que cuadre localmente.`);
  } else if (modo === 'estado') {
    const h = db.prepare('SELECT h.*, q.titulo FROM historial_estado h JOIN queja q ON q.id = h.queja_id ORDER BY h.fecha DESC LIMIT 1').get();
    if (!h) throw new Error('No hay cambios de estado en este nodo');
    db.prepare('DELETE FROM historial_estado WHERE id = ?').run(h.id);
    console.log(`Se eliminó el cambio de estado "${h.estado}" de la queja "${h.titulo}".`);
  } else if (modo === 'borrar') {
    const q = db.prepare('SELECT * FROM queja WHERE nodo_origen = ? ORDER BY rowid LIMIT 1').get(nodoLocal)
      || db.prepare('SELECT * FROM queja ORDER BY rowid LIMIT 1').get();
    if (!q) throw new Error('No hay quejas en este nodo');
    for (const t of ['historial_estado', 'comentario', 'apoyo', 'foto']) db.prepare(`DELETE FROM ${t} WHERE queja_id = ?`).run(q.id);
    db.prepare('DELETE FROM queja WHERE id = ?').run(q.id);
    console.log(`Se eliminó la queja "${q.titulo}" con todo su historial, comentarios, apoyos y fotos.`);
  } else {
    throw new Error('Modo desconocido: use editar, rehash, estado o borrar');
  }
} finally {
  ponerTriggers();
  db.close();
}

console.log(`
Los triggers append-only se volvieron a crear para no dejar rastro en el esquema.
Ahora compruebe la detección:
  1. Entre como consejo@conjunto.co a la sección Integridad de este nodo.
  2. En Nodos pulse "Sincronizar ahora" (o espere el ciclo automático de ${cfg.intervaloSyncSegundos} s).
  3. Revise Integridad en este nodo y en los demás: aparece el conflicto y el registro alterado no se propaga.`);
