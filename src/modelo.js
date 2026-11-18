import { CATEGORIAS, ESTADOS, uuid, ahora, transaccion } from './db.js';
import { hashQueja, hashHistorial, hashComentario, hashApoyo, hashFoto } from './hash.js';

export class ErrorNegocio extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

const RANGO_SQL = `CASE estado WHEN 'nueva' THEN 0 WHEN 'vista' THEN 1 WHEN 'en_proceso' THEN 2 ELSE 3 END`;
const MAX_FOTOS = 3;
const MAX_BYTES_FOTO = 1_500_000;

// El "último registro conocido en el nodo emisor" es la punta de su cadena:
// el registro propio que ningún otro registro propio apunta como anterior.
export function puntaDeCadena(db, tabla, nodoId) {
  const fila = db.prepare(`
    SELECT hash FROM ${tabla} a
    WHERE a.nodo_origen = ?
      AND NOT EXISTS (SELECT 1 FROM ${tabla} b WHERE b.nodo_origen = a.nodo_origen AND b.hash_anterior = a.hash)
    ORDER BY rowid DESC LIMIT 1`).get(nodoId);
  return fila ? fila.hash : null;
}

function fechaValida(valor) {
  if (!valor) return ahora();
  const d = new Date(valor);
  if (isNaN(d)) return ahora();
  if (d.getTime() > Date.now() + 5 * 60 * 1000) return ahora();
  return d.toISOString();
}

function idValido(id) {
  return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? id.toLowerCase() : uuid();
}

export function crearModelo(db, nodoId) {
  function existe(tabla, id) {
    return db.prepare(`SELECT * FROM ${tabla} WHERE id = ?`).get(id);
  }

  function estadoActual(quejaId) {
    const f = db.prepare(`SELECT estado FROM historial_estado WHERE queja_id = ? ORDER BY ${RANGO_SQL} DESC LIMIT 1`).get(quejaId);
    return f ? f.estado : 'nueva';
  }

  function crearQueja(datos, autor) {
    const id = idValido(datos.id);
    const previa = existe('queja', id);
    if (previa) {
      if (previa.autor_id !== autor.id) throw new ErrorNegocio(409, 'Ya existe una queja con ese identificador');
      return { queja: previa, creada: false };
    }

    const titulo = String(datos.titulo || '').trim();
    const descripcion = String(datos.descripcion || '').trim();
    const categoria = String(datos.categoria || '').trim();
    if (titulo.length < 4 || titulo.length > 120) throw new ErrorNegocio(400, 'El título debe tener entre 4 y 120 caracteres');
    if (descripcion.length < 10) throw new ErrorNegocio(400, 'La descripción debe tener al menos 10 caracteres');
    if (!CATEGORIAS.includes(categoria)) throw new ErrorNegocio(400, 'Categoría no válida');

    const fotos = Array.isArray(datos.fotos) ? datos.fotos : [];
    if (fotos.length > MAX_FOTOS) throw new ErrorNegocio(400, `Máximo ${MAX_FOTOS} fotografías por queja`);
    for (const f of fotos) {
      if (typeof f !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(f)) throw new ErrorNegocio(400, 'Formato de foto no válido');
      if (f.length > MAX_BYTES_FOTO * 1.37) throw new ErrorNegocio(400, 'Una de las fotos es demasiado grande');
    }

    const lat = Number.isFinite(Number(datos.ubicacion_lat)) && datos.ubicacion_lat !== null && datos.ubicacion_lat !== '' ? Number(datos.ubicacion_lat) : null;
    const lng = Number.isFinite(Number(datos.ubicacion_lng)) && datos.ubicacion_lng !== null && datos.ubicacion_lng !== '' ? Number(datos.ubicacion_lng) : null;

    return transaccion(db, () => {
      const q = {
        id,
        titulo,
        descripcion,
        categoria,
        ubicacion_lat: lat,
        ubicacion_lng: lng,
        fecha_creacion: fechaValida(datos.fecha_creacion),
        autor_id: autor.id,
        nodo_origen: nodoId,
        hash_anterior: puntaDeCadena(db, 'queja', nodoId)
      };
      // El servidor siempre recalcula el hash, no confía en el que mande el cliente (nota de la tabla 7).
      q.hash = hashQueja(q);
      db.prepare(`INSERT INTO queja (id, titulo, descripcion, categoria, ubicacion_lat, ubicacion_lng, fecha_creacion, autor_id, nodo_origen, hash, hash_anterior)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(q.id, q.titulo, q.descripcion, q.categoria, q.ubicacion_lat, q.ubicacion_lng, q.fecha_creacion, q.autor_id, q.nodo_origen, q.hash, q.hash_anterior);

      for (const datosFoto of fotos) {
        const f = { id: uuid(), queja_id: q.id, datos: datosFoto, nodo_origen: nodoId };
        f.hash = hashFoto(f);
        db.prepare('INSERT INTO foto (id, queja_id, datos, nodo_origen, hash) VALUES (?, ?, ?, ?, ?)')
          .run(f.id, f.queja_id, f.datos, f.nodo_origen, f.hash);
      }
      return { queja: q, creada: true };
    });
  }

  function agregarEstado(quejaId, estado, responsable) {
    if (!existe('queja', quejaId)) throw new ErrorNegocio(404, 'La queja no existe en este nodo');
    if (!ESTADOS.includes(estado) || estado === 'nueva') throw new ErrorNegocio(400, 'Estado no válido');
    const actual = estadoActual(quejaId);
    if (ESTADOS.indexOf(estado) <= ESTADOS.indexOf(actual)) {
      throw new ErrorNegocio(409, `El estado solo puede avanzar: la queja ya está en "${actual}"`);
    }
    return transaccion(db, () => {
      const h = {
        id: uuid(),
        queja_id: quejaId,
        estado,
        responsable_id: responsable.id,
        fecha: ahora(),
        nodo_origen: nodoId,
        hash_anterior: puntaDeCadena(db, 'historial_estado', nodoId)
      };
      h.hash = hashHistorial(h);
      db.prepare(`INSERT INTO historial_estado (id, queja_id, estado, responsable_id, fecha, nodo_origen, hash, hash_anterior)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(h.id, h.queja_id, h.estado, h.responsable_id, h.fecha, h.nodo_origen, h.hash, h.hash_anterior);
      return h;
    });
  }

  function comentar(quejaId, datos, autor) {
    if (!existe('queja', quejaId)) throw new ErrorNegocio(404, 'La queja no existe en este nodo');
    const id = idValido(datos.id);
    const previo = existe('comentario', id);
    if (previo) return { comentario: previo, creado: false };
    const texto = String(datos.texto || '').trim();
    if (texto.length < 2 || texto.length > 1000) throw new ErrorNegocio(400, 'El comentario debe tener entre 2 y 1000 caracteres');
    const c = { id, queja_id: quejaId, autor_id: autor.id, texto, fecha: fechaValida(datos.fecha), nodo_origen: nodoId };
    c.hash = hashComentario(c);
    db.prepare('INSERT INTO comentario (id, queja_id, autor_id, texto, fecha, nodo_origen, hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(c.id, c.queja_id, c.autor_id, c.texto, c.fecha, c.nodo_origen, c.hash);
    return { comentario: c, creado: true };
  }

  function apoyar(quejaId, datos, autor) {
    if (!existe('queja', quejaId)) throw new ErrorNegocio(404, 'La queja no existe en este nodo');
    const previo = db.prepare('SELECT * FROM apoyo WHERE queja_id = ? AND autor_id = ?').get(quejaId, autor.id);
    if (previo) return { apoyo: previo, creado: false };
    const a = { id: idValido(datos.id), queja_id: quejaId, autor_id: autor.id, fecha: fechaValida(datos.fecha), nodo_origen: nodoId };
    a.hash = hashApoyo(a);
    db.prepare('INSERT INTO apoyo (id, queja_id, autor_id, fecha, nodo_origen, hash) VALUES (?, ?, ?, ?, ?, ?)')
      .run(a.id, a.queja_id, a.autor_id, a.fecha, a.nodo_origen, a.hash);
    return { apoyo: a, creado: true };
  }

  function listar(filtros = {}) {
    const filas = db.prepare(`
      SELECT q.id, q.titulo, q.descripcion, q.categoria, q.ubicacion_lat, q.ubicacion_lng, q.fecha_creacion,
             q.autor_id, q.nodo_origen, q.hash,
             u.nombre AS autor_nombre, u.unidad_residencial AS autor_unidad,
             n.nombre AS nodo_nombre,
             (SELECT estado FROM historial_estado h WHERE h.queja_id = q.id ORDER BY ${RANGO_SQL} DESC LIMIT 1) AS estado,
             (SELECT MAX(fecha) FROM historial_estado h WHERE h.queja_id = q.id) AS ultima_actualizacion,
             (SELECT COUNT(*) FROM apoyo a WHERE a.queja_id = q.id) AS apoyos,
             (SELECT COUNT(*) FROM comentario c WHERE c.queja_id = q.id) AS comentarios,
             (SELECT COUNT(*) FROM foto f WHERE f.queja_id = q.id) AS fotos
      FROM queja q
      LEFT JOIN usuario u ON u.id = q.autor_id
      LEFT JOIN nodo n ON n.id = q.nodo_origen
      ORDER BY q.fecha_creacion DESC`).all();

    return filas
      .map(f => ({ ...f, estado: f.estado || 'nueva' }))
      .filter(f => !filtros.categoria || f.categoria === filtros.categoria)
      .filter(f => !filtros.estado || f.estado === filtros.estado)
      .filter(f => !filtros.autor || f.autor_id === filtros.autor);
  }

  function detalle(quejaId, usuarioId) {
    const q = listar().find(x => x.id === quejaId);
    if (!q) throw new ErrorNegocio(404, 'La queja no existe en este nodo');
    const completa = existe('queja', quejaId);
    const fotos = db.prepare('SELECT id, datos FROM foto WHERE queja_id = ? ORDER BY rowid').all(quejaId);
    const comentarios = db.prepare(`
      SELECT c.id, c.texto, c.fecha, c.autor_id, u.nombre AS autor_nombre, u.rol AS autor_rol, u.unidad_residencial AS autor_unidad
      FROM comentario c LEFT JOIN usuario u ON u.id = c.autor_id
      WHERE c.queja_id = ? ORDER BY c.fecha`).all(quejaId);
    const yaApoyo = !!db.prepare('SELECT 1 FROM apoyo WHERE queja_id = ? AND autor_id = ?').get(quejaId, usuarioId);
    return { ...q, hash_anterior: completa.hash_anterior, fotos, comentarios, ya_apoyo: yaApoyo };
  }

  function historial(quejaId) {
    if (!existe('queja', quejaId)) throw new ErrorNegocio(404, 'La queja no existe en este nodo');
    const q = existe('queja', quejaId);
    const filas = db.prepare(`
      SELECT h.*, u.nombre AS responsable_nombre, n.nombre AS nodo_nombre
      FROM historial_estado h
      LEFT JOIN usuario u ON u.id = h.responsable_id
      LEFT JOIN nodo n ON n.id = h.nodo_origen
      WHERE h.queja_id = ? ORDER BY h.fecha`).all(quejaId);
    const anteriorExiste = db.prepare('SELECT 1 FROM historial_estado WHERE hash = ? AND nodo_origen = ?');
    const quejaAnterior = db.prepare('SELECT 1 FROM queja WHERE hash = ? AND nodo_origen = ?');

    const creacion = {
      tipo: 'creacion',
      estado: 'nueva',
      fecha: q.fecha_creacion,
      hash: q.hash,
      hash_anterior: q.hash_anterior,
      hash_valido: hashQueja(q) === q.hash,
      enlace_valido: !q.hash_anterior || !!quejaAnterior.get(q.hash_anterior, q.nodo_origen)
    };
    const cambios = filas.map(h => ({
      tipo: 'cambio_estado',
      id: h.id,
      estado: h.estado,
      fecha: h.fecha,
      responsable_id: h.responsable_id,
      responsable_nombre: h.responsable_nombre,
      nodo_origen: h.nodo_origen,
      nodo_nombre: h.nodo_nombre,
      hash: h.hash,
      hash_anterior: h.hash_anterior,
      hash_valido: hashHistorial(h) === h.hash,
      enlace_valido: !h.hash_anterior || !!anteriorExiste.get(h.hash_anterior, h.nodo_origen)
    }));
    return [creacion, ...cambios];
  }

  return { estadoActual, crearQueja, agregarEstado, comentar, apoyar, listar, detalle, historial };
}
