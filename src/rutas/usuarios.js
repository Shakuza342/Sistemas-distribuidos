import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { ROLES, uuid } from '../db.js';

export function crearUsuario(db, nodoId, { nombre, correo, password, rol, unidad_residencial }) {
  nombre = String(nombre || '').trim();
  correo = String(correo || '').trim().toLowerCase();
  unidad_residencial = String(unidad_residencial || '').trim();
  if (nombre.length < 3) throw Object.assign(new Error('El nombre es obligatorio'), { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) throw Object.assign(new Error('Correo no válido'), { status: 400 });
  if (String(password || '').length < 6) throw Object.assign(new Error('La contraseña debe tener al menos 6 caracteres'), { status: 400 });
  if (!ROLES.includes(rol)) throw Object.assign(new Error('Rol no válido'), { status: 400 });
  if (!unidad_residencial) throw Object.assign(new Error('La unidad residencial es obligatoria'), { status: 400 });
  if (db.prepare('SELECT 1 FROM usuario WHERE correo = ?').get(correo)) {
    throw Object.assign(new Error('Ya existe un usuario con ese correo'), { status: 409 });
  }
  const u = { id: uuid(), nombre, correo, hash_password: bcrypt.hashSync(password, 10), rol, unidad_residencial, nodo_id: nodoId };
  db.prepare(`INSERT INTO usuario (id, nombre, correo, hash_password, rol, unidad_residencial, nodo_id)
              VALUES (?, ?, ?, ?, ?, ?, ?)`).run(u.id, u.nombre, u.correo, u.hash_password, u.rol, u.unidad_residencial, u.nodo_id);
  return u;
}

export default function rutasUsuarios({ db, nodo, auth }) {
  const r = Router();
  const { autenticado, permitir } = auth;

  r.get('/', autenticado, permitir('administrador'), (req, res) => {
    res.json(db.prepare(`SELECT u.id, u.nombre, u.correo, u.rol, u.unidad_residencial, n.nombre AS nodo_nombre
                         FROM usuario u LEFT JOIN nodo n ON n.id = u.nodo_id ORDER BY u.rol, u.unidad_residencial`).all());
  });

  r.post('/', autenticado, permitir('administrador'), (req, res) => {
    const u = crearUsuario(db, nodo.id, req.body || {});
    res.status(201).json({ id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol, unidad_residencial: u.unidad_residencial });
  });

  return r;
}
