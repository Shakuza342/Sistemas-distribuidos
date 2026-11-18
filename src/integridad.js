import { TABLAS, ahora } from './db.js';

const DESCRIPCION = {
  hash_alterado: 'El contenido del registro no coincide con su hash: fue modificado después de creado',
  eslabon_faltante: 'El registro apunta a un anterior que no existe: fue eliminado o todavía no ha llegado por sincronización',
  bifurcacion: 'Dos registros del mismo nodo apuntan al mismo anterior: se insertó o reordenó un registro',
  referencia_huerfana: 'El registro depende de una queja que no existe en este nodo'
};

export function verificarIntegridad(db) {
  const problemas = [];
  const cadenas = [];
  const afectados = new Set();
  let total = 0;

  const nombresNodo = new Map(db.prepare('SELECT id, nombre FROM nodo').all().map(n => [n.id, n.nombre]));
  const agregar = (tipo, tabla, r, extra = '') => {
    problemas.push({ tipo, tabla, registro_id: r.id, nodo_origen: r.nodo_origen, detalle: DESCRIPCION[tipo] + extra });
    afectados.add(tabla + ':' + r.id);
  };

  for (const t of TABLAS.filter(t => t.hashGuardado)) {
    const registros = db.prepare(`SELECT * FROM ${t.nombre}`).all();
    total += registros.length;

    for (const r of registros) {
      if (t.huella(r) !== r.hash) agregar('hash_alterado', t.nombre, r);
    }

    if (t.nombre !== 'queja') {
      const quejas = new Set(db.prepare('SELECT id FROM queja').all().map(q => q.id));
      for (const r of registros) if (!quejas.has(r.queja_id)) agregar('referencia_huerfana', t.nombre, r);
    }

    if (!t.encadenada) continue;

    const porNodo = new Map();
    for (const r of registros) {
      if (!porNodo.has(r.nodo_origen)) porNodo.set(r.nodo_origen, []);
      porNodo.get(r.nodo_origen).push(r);
    }
    for (const [nodo, lista] of porNodo) {
      const hashes = new Set(lista.map(r => r.hash));
      const hijos = new Map();
      for (const r of lista) {
        const clave = r.hash_anterior || '(inicio)';
        hijos.set(clave, (hijos.get(clave) || 0) + 1);
      }
      let errores = 0;
      for (const r of lista) {
        if (r.hash_anterior && !hashes.has(r.hash_anterior)) { agregar('eslabon_faltante', t.nombre, r); errores++; }
        if (hijos.get(r.hash_anterior || '(inicio)') > 1) { agregar('bifurcacion', t.nombre, r); errores++; }
      }
      cadenas.push({
        tabla: t.nombre,
        nodo_origen: nodo,
        nodo_nombre: nombresNodo.get(nodo) || nodo.slice(0, 8),
        longitud: lista.length,
        integra: errores === 0 && !lista.some(r => afectados.has(t.nombre + ':' + r.id))
      });
    }
  }

  const verificables = total - afectados.size;
  const conflictos = db.prepare(`
    SELECT c.*, n.nombre AS nodo_remoto_nombre FROM conflicto c
    LEFT JOIN nodo n ON n.id = c.nodo_remoto ORDER BY c.id DESC`).all();

  return {
    fecha: ahora(),
    total_registros: total,
    registros_verificables: verificables,
    porcentaje_verificable: total === 0 ? 100 : Math.round((verificables / total) * 10000) / 100,
    integro: problemas.length === 0,
    problemas,
    cadenas,
    conflictos
  };
}
