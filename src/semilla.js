import { crearUsuario } from './rutas/usuarios.js';

export const USUARIOS_INICIALES = [
  { nombre: 'Administración del conjunto', correo: 'admin@conjunto.co', password: 'admin123', rol: 'administrador', unidad_residencial: 'Administración' },
  { nombre: 'Consejo de administración', correo: 'consejo@conjunto.co', password: 'consejo123', rol: 'auditor', unidad_residencial: 'Consejo' },
  { nombre: 'Laura Martínez', correo: 'laura@conjunto.co', password: 'vecino123', rol: 'vecino', unidad_residencial: 'Torre 1 - Apto 302' },
  { nombre: 'Carlos Ruiz', correo: 'carlos@conjunto.co', password: 'vecino123', rol: 'vecino', unidad_residencial: 'Torre 2 - Apto 504' },
  { nombre: 'Diana Gómez', correo: 'diana@conjunto.co', password: 'vecino123', rol: 'vecino', unidad_residencial: 'Torre 3 - Apto 101' }
];

export function sembrarSiVacio(db, nodoId) {
  const hay = db.prepare('SELECT COUNT(*) AS n FROM usuario').get().n;
  if (hay > 0) return 0;
  for (const u of USUARIOS_INICIALES) crearUsuario(db, nodoId, u);
  return USUARIOS_INICIALES.length;
}
