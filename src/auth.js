import jwt from 'jsonwebtoken';

export function crearAuth(cfg) {
  function firmar(usuario) {
    return jwt.sign(
      { sub: usuario.id, rol: usuario.rol, nombre: usuario.nombre, unidad: usuario.unidad_residencial },
      cfg.jwtSecreto,
      { expiresIn: '12h' }
    );
  }

  function autenticado(req, res, next) {
    const cabecera = req.headers.authorization || '';
    const [tipo, token] = cabecera.split(' ');
    if (tipo !== 'Bearer' || !token) return res.status(401).json({ error: 'Falta el token de acceso' });
    try {
      const datos = jwt.verify(token, cfg.jwtSecreto);
      req.usuario = { id: datos.sub, rol: datos.rol, nombre: datos.nombre, unidad: datos.unidad };
      next();
    } catch {
      res.status(401).json({ error: 'Token inválido o vencido' });
    }
  }

  // La autorización se decide en cada endpoint comparando el rol (sección 7.3).
  const permitir = (...roles) => (req, res, next) => {
    if (!roles.includes(req.usuario?.rol)) {
      return res.status(403).json({ error: `El rol ${req.usuario?.rol} no puede realizar esta acción` });
    }
    next();
  };

  function claveRed(req, res, next) {
    if (req.headers['x-clave-red'] !== cfg.claveRed) {
      return res.status(401).json({ error: 'Clave de red incorrecta: el nodo no pertenece a este conjunto' });
    }
    next();
  }

  return { firmar, autenticado, permitir, claveRed };
}
