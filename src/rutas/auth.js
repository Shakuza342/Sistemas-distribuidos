import { Router } from 'express';
import bcrypt from 'bcryptjs';

const MAX_INTENTOS = 5;
const BLOQUEO_MS = 10 * 60 * 1000;

export default function rutasAuth({ db, auth }) {
  const r = Router();
  const intentos = new Map();

  function bloqueado(correo) {
    const i = intentos.get(correo);
    return i && i.hasta && Date.now() < i.hasta;
  }

  function anotarFallo(correo) {
    const i = intentos.get(correo) || { fallos: 0, hasta: null };
    i.fallos++;
    if (i.fallos >= MAX_INTENTOS) {
      i.hasta = Date.now() + BLOQUEO_MS;
      i.fallos = 0;
    }
    intentos.set(correo, i);
  }

  r.post('/login', async (req, res, next) => {
    const correo = String(req.body?.correo || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!correo || !password) return res.status(400).json({ error: 'Correo y contraseña son obligatorios' });

    if (bloqueado(correo)) {
      return res.status(429).json({ error: 'Demasiados intentos fallidos. Espere 10 minutos e intente de nuevo.' });
    }

    const u = db.prepare('SELECT * FROM usuario WHERE correo = ?').get(correo);
    if (!u) {
      return res.status(401).json({ error: 'El usuario no existe en este nodo. Si se creó en otro nodo, espere a la próxima sincronización.' });
    }
    // compare asíncrono: la versión Sync bloqueaba el nodo mientras calculaba el hash
    let valida;
    try {
      valida = await bcrypt.compare(password, u.hash_password);
    } catch (e) {
      return next(e);
    }
    if (!valida) {
      anotarFallo(correo);
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }
    intentos.delete(correo);

    res.json({
      token: auth.firmar(u),
      usuario: { id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol, unidad_residencial: u.unidad_residencial }
    });
  });

  r.get('/yo', auth.autenticado, (req, res) => res.json(req.usuario));

  return r;
}
