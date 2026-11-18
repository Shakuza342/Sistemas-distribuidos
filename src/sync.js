import { TABLAS, ahora, transaccion, registrarConflicto, conocerNodo, vincularPeer, agregarPeer } from './db.js';

const tabla = nombre => TABLAS.find(t => t.nombre === nombre);
const origenDe = (t, r) => (t.nombre === 'usuario' ? r.nodo_id : r.nodo_origen);

// Huella de cada registro calculada desde su contenido actual (no desde el hash guardado),
// así una edición directa en el SQLite cambia la huella aunque nadie recalcule el hash.
export function resumen(db) {
  const r = {};
  for (const t of TABLAS) {
    r[t.nombre] = {};
    for (const fila of db.prepare(`SELECT * FROM ${t.nombre}`).all()) r[t.nombre][fila.id] = t.huella(fila);
  }
  return r;
}

export function registrosPorIds(db, ids) {
  const salida = {};
  for (const t of TABLAS) {
    const lista = ids[t.nombre] || [];
    if (!lista.length) continue;
    const stmt = db.prepare(`SELECT ${t.columnas.join(', ')} FROM ${t.nombre} WHERE id = ?`);
    salida[t.nombre] = lista.map(id => stmt.get(id)).filter(Boolean).map(f => ({ ...f }));
  }
  return salida;
}

export function todosLosRegistros(db) {
  const salida = {};
  for (const t of TABLAS) {
    salida[t.nombre] = db.prepare(`SELECT ${t.columnas.join(', ')} FROM ${t.nombre}`).all().map(f => ({ ...f }));
  }
  return salida;
}

export function nodosConocidos(db) {
  return db.prepare("SELECT id, nombre FROM nodo WHERE id NOT LIKE 'url:%'").all().map(n => ({ ...n }));
}

function anotar(db, lista, conflicto) {
  if (registrarConflicto(db, conflicto)) lista.push(conflicto);
}

export function aplicarRegistros(db, registros, nodoLocal, nodoRemoto) {
  const conflictos = [];
  let insertados = 0;

  transaccion(db, () => {
    for (const t of TABLAS) {
      const lista = Array.isArray(registros?.[t.nombre]) ? registros[t.nombre] : [];
      const buscar = db.prepare(`SELECT * FROM ${t.nombre} WHERE id = ?`);
      const insertar = db.prepare(`INSERT INTO ${t.nombre} (${t.columnas.join(', ')}) VALUES (${t.columnas.map(() => '?').join(', ')})`);

      for (const crudo of lista) {
        const r = {};
        for (const c of t.columnas) r[c] = crudo[c] ?? null;
        if (!r.id) continue;
        const huella = t.huella(r);

        if (t.hashGuardado && huella !== r.hash) {
          anotar(db, conflictos, {
            tipo: 'hash_invalido', tabla: t.nombre, registro_id: r.id, nodo_remoto: nodoRemoto,
            detalle: 'El nodo remoto envió un registro cuyo contenido no coincide con su hash. No se propagó.'
          });
          continue;
        }

        const local = buscar.get(r.id);
        if (local) {
          const huellaLocal = t.huella(local);
          if (huellaLocal !== huella) {
            const localManipulado = t.hashGuardado && huellaLocal !== local.hash;
            anotar(db, conflictos, {
              tipo: 'version_distinta', tabla: t.nombre, registro_id: r.id, nodo_remoto: nodoRemoto,
              detalle: localManipulado
                ? 'La copia local no coincide con su propio hash: fue alterada en este nodo. Se conserva la evidencia.'
                : 'Este nodo y el remoto tienen contenidos distintos para el mismo registro.'
            });
          }
          continue;
        }

        try {
          insertar.run(...t.columnas.map(c => r[c]));
          insertados++;
          if (origenDe(t, r) === nodoLocal) {
            anotar(db, conflictos, {
              tipo: 'registro_restaurado', tabla: t.nombre, registro_id: r.id, nodo_remoto: nodoRemoto,
              detalle: 'Un registro creado en este nodo había desaparecido de su base de datos y fue restaurado desde otro nodo.'
            });
          }
        } catch (e) {
          anotar(db, conflictos, {
            tipo: 'rechazado', tabla: t.nombre, registro_id: r.id, nodo_remoto: nodoRemoto,
            detalle: 'No se pudo insertar: ' + e.message
          });
        }
      }
    }
  });

  return { insertados, conflictos };
}

// Compara dos resúmenes y devuelve qué le falta a cada lado y qué difiere.
export function compararResumenes(local, remoto) {
  const enviar = {};
  const faltantes = {};
  const distintos = [];
  for (const t of TABLAS) {
    const l = local[t.nombre] || {};
    const r = remoto?.[t.nombre] || {};
    enviar[t.nombre] = Object.keys(l).filter(id => !(id in r));
    faltantes[t.nombre] = Object.keys(r).filter(id => !(id in l));
    for (const id of Object.keys(l)) if (id in r && r[id] !== l[id]) distintos.push({ tabla: t.nombre, id });
  }
  return { enviar, faltantes, distintos };
}

function registrarDistintos(db, distintos, nodoRemoto, conflictos) {
  for (const d of distintos) {
    const t = tabla(d.tabla);
    const local = db.prepare(`SELECT * FROM ${t.nombre} WHERE id = ?`).get(d.id);
    const localManipulado = local && t.hashGuardado && t.huella(local) !== local.hash;
    anotar(db, conflictos, {
      tipo: 'version_distinta', tabla: d.tabla, registro_id: d.id, nodo_remoto: nodoRemoto,
      detalle: localManipulado
        ? 'La copia local no coincide con su propio hash: fue alterada en este nodo. Se conserva la evidencia.'
        : 'El otro nodo tiene un contenido distinto para este registro (posible manipulación en el nodo remoto).'
    });
  }
}

const contar = ids => Object.values(ids).reduce((s, l) => s + l.length, 0);

// Lado servidor de POST /nodos/sincronizar
export function atenderSincronizacion(db, nodo, cuerpo) {
  const remoto = cuerpo?.nodo;
  if (!remoto?.id) throw Object.assign(new Error('Paquete de sincronización sin identificación de nodo'), { status: 400 });
  if (remoto.id === nodo.id) throw Object.assign(new Error('Un nodo no puede sincronizarse consigo mismo'), { status: 400 });

  conocerNodo(db, remoto);
  for (const n of cuerpo.nodos || []) conocerNodo(db, n);

  const { insertados, conflictos } = aplicarRegistros(db, cuerpo.registros, nodo.id, remoto.id);
  const local = resumen(db);
  const { enviar, faltantes, distintos } = compararResumenes(local, cuerpo.resumen);
  registrarDistintos(db, distintos, remoto.id, conflictos);

  db.prepare('UPDATE nodo SET ultima_sync = ? WHERE id = ?').run(ahora(), remoto.id);

  return {
    nodo: { id: nodo.id, nombre: nodo.nombre, url: nodo.url },
    nodos: nodosConocidos(db),
    resumen: local,
    registros: registrosPorIds(db, enviar),
    faltantes,
    recibidos: insertados,
    conflictos
  };
}

async function postJSON(url, cuerpo, claveRed, timeoutMs) {
  const resp = await fetch(url + '/api/v1/nodos/sincronizar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Clave-Red': claveRed },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const datos = await resp.json().catch(() => ({}));
  if (resp.status !== 200 && resp.status !== 409) throw new Error(datos.error || `HTTP ${resp.status}`);
  return { status: resp.status, datos };
}

// Lado cliente: este nodo inicia el intercambio con un peer.
export async function sincronizarCon(db, nodo, url, claveRed, timeoutMs = 8000) {
  url = url.replace(/\/+$/, '');
  agregarPeer(db, url);
  const yo = { id: nodo.id, nombre: nodo.nombre, url: nodo.url };

  try {
    const inicio = Date.now();
    const primero = await postJSON(url, { nodo: yo, nodos: nodosConocidos(db), resumen: resumen(db), registros: {} }, claveRed, timeoutMs);
    const r = primero.datos;
    vincularPeer(db, url, r.nodo.id, r.nodo.nombre);
    for (const n of r.nodos || []) conocerNodo(db, n);

    const aplicado = aplicarRegistros(db, r.registros, nodo.id, r.nodo.id);
    const conflictos = [...(r.conflictos || []), ...aplicado.conflictos];
    const local = resumen(db);
    registrarDistintos(db, compararResumenes(local, r.resumen).distintos, r.nodo.id, conflictos);

    let enviados = 0;
    if (contar(r.faltantes || {}) > 0) {
      const registros = registrosPorIds(db, r.faltantes);
      enviados = contar(registros);
      const segundo = await postJSON(url, { nodo: yo, nodos: nodosConocidos(db), resumen: local, registros }, claveRed, timeoutMs);
      conflictos.push(...(segundo.datos.conflictos || []));
    }

    db.prepare('UPDATE nodo SET ultima_sync = ?, ultimo_error = NULL WHERE id = ?').run(ahora(), r.nodo.id);
    return { ok: true, url, nodo: r.nodo.nombre, recibidos: aplicado.insertados, enviados, conflictos, ms: Date.now() - inicio };
  } catch (e) {
    const mensaje = e.name === 'TimeoutError' ? 'Tiempo de espera agotado' : (e.cause?.code || e.message);
    db.prepare('UPDATE nodo SET ultimo_error = ? WHERE url = ? AND es_peer = 1').run(`${ahora()} ${mensaje}`, url);
    return { ok: false, url, error: mensaje };
  }
}

// Los peers se contactan en paralelo: uno lento o caído no retrasa a los demás.
export async function sincronizarTodos(db, nodo, cfg, circuito, forzar = false) {
  const peers = db.prepare('SELECT url FROM nodo WHERE es_peer = 1 AND url IS NOT NULL').all();
  return Promise.all(peers.map(async ({ url }) => {
    if (!forzar && !circuito.puedeIntentar(url)) {
      return { ok: false, omitido: true, url, error: `en pausa tras ${circuito.consultar(url).fallos} fallos seguidos` };
    }
    const r = await sincronizarCon(db, nodo, url, cfg.claveRed, cfg.timeoutSyncMs);
    if (r.ok) circuito.exito(url); else circuito.fallo(url);
    return r;
  }));
}

export function importarPaquete(db, nodo, paquete) {
  if (paquete?.formato !== 'veeduria-p2p') throw Object.assign(new Error('El archivo no es un paquete de la red de veeduría'), { status: 400 });
  const origen = paquete.nodo?.id || null;
  if (paquete.nodo) conocerNodo(db, paquete.nodo);
  for (const n of paquete.nodos || []) conocerNodo(db, n);
  const r = aplicarRegistros(db, paquete.registros, nodo.id, origen);
  if (origen && origen !== nodo.id) {
    const distintos = compararResumenes(resumen(db), resumenDeRegistros(paquete.registros)).distintos;
    registrarDistintos(db, distintos, origen, r.conflictos);
  }
  return r;
}

function resumenDeRegistros(registros) {
  const r = {};
  for (const t of TABLAS) {
    r[t.nombre] = {};
    for (const fila of registros?.[t.nombre] || []) r[t.nombre][fila.id] = t.huella(fila);
  }
  return r;
}

export function exportarPaquete(db, nodo) {
  return {
    formato: 'veeduria-p2p',
    version: 1,
    exportado: ahora(),
    nodo: { id: nodo.id, nombre: nodo.nombre },
    nodos: nodosConocidos(db),
    registros: todosLosRegistros(db)
  };
}
