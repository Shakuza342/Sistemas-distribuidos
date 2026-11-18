import crypto from 'node:crypto';

export function sha256(texto) {
  return crypto.createHash('sha256').update(texto, 'utf8').digest('hex');
}

// Los campos se serializan como arreglo JSON para que la concatenación no sea ambigua
// (con un simple join, "ab"+"c" y "a"+"bc" darían el mismo hash).
function encadenar(campos) {
  return sha256(JSON.stringify(campos.map(c => (c === undefined || c === null ? '' : String(c)))));
}

export const hashQueja = q =>
  encadenar([q.id, q.titulo, q.descripcion, q.categoria, q.fecha_creacion, q.autor_id, q.hash_anterior]);

export const hashHistorial = h =>
  encadenar([h.id, h.queja_id, h.estado, h.responsable_id, h.fecha, h.hash_anterior]);

export const hashComentario = c =>
  encadenar([c.id, c.queja_id, c.autor_id, c.texto, c.fecha]);

export const hashApoyo = a =>
  encadenar([a.id, a.queja_id, a.autor_id, a.fecha]);

export const hashFoto = f =>
  encadenar([f.id, f.queja_id, sha256(f.datos)]);

export const huellaUsuario = u =>
  encadenar([u.id, u.nombre, u.correo, u.hash_password, u.rol, u.unidad_residencial, u.nodo_id]);
