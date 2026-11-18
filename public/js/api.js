import { guardarCache, leerCache, encolar, pendientes, quitarPendiente } from './almacen.js';

const BASE = '/api/v1';

export const sesion = {
  get token() { return localStorage.getItem('veeduria.token'); },
  get usuario() {
    try { return JSON.parse(localStorage.getItem('veeduria.usuario')); } catch { return null; }
  },
  guardar(token, usuario) {
    localStorage.setItem('veeduria.token', token);
    localStorage.setItem('veeduria.usuario', JSON.stringify(usuario));
  },
  cerrar() {
    localStorage.removeItem('veeduria.token');
    localStorage.removeItem('veeduria.usuario');
  }
};

export class ErrorApi extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

export class SinConexion extends Error {}

export const alSesionVencida = { fn: () => {} };

export async function pedir(metodo, ruta, cuerpo) {
  let resp;
  try {
    resp = await fetch(BASE + ruta, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        ...(sesion.token ? { Authorization: 'Bearer ' + sesion.token } : {})
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
    });
  } catch {
    throw new SinConexion('No hay conexión con el nodo');
  }
  const datos = await resp.json().catch(() => null);
  if (resp.status === 401 && ruta !== '/auth/login') {
    alSesionVencida.fn();
    throw new ErrorApi(401, datos?.error || 'Sesión vencida');
  }
  if (!resp.ok && resp.status !== 409) throw new ErrorApi(resp.status, datos?.error || `Error ${resp.status}`);
  if (resp.status === 409 && !ruta.startsWith('/nodos')) throw new ErrorApi(409, datos?.error || 'Conflicto');
  return datos;
}

// Lectura con respaldo: si el nodo no responde se muestra la última copia guardada.
export async function leer(ruta, claveCache) {
  try {
    const datos = await pedir('GET', ruta);
    if (claveCache) await guardarCache(claveCache, datos);
    return { datos, desdeCache: false };
  } catch (e) {
    if (!(e instanceof SinConexion) || !claveCache) throw e;
    const datos = await leerCache(claveCache);
    if (datos === undefined) throw e;
    return { datos, desdeCache: true };
  }
}

// Escritura tolerante a desconexión (RNF-01): si no hay red la operación queda en cola
// con su id generado aquí, así al reenviarla el nodo no crea duplicados.
export async function escribir(ruta, cuerpo, descripcion) {
  try {
    return { datos: await pedir('POST', ruta, cuerpo), encolado: false };
  } catch (e) {
    if (!(e instanceof SinConexion)) throw e;
    await encolar({ ruta, cuerpo, descripcion });
    return { datos: null, encolado: true };
  }
}

let vaciando = false;
export async function vaciarCola() {
  if (vaciando) return { enviados: 0, fallidos: [] };
  vaciando = true;
  const fallidos = [];
  let enviados = 0;
  try {
    for (const op of await pendientes()) {
      try {
        await pedir('POST', op.ruta, op.cuerpo);
        await quitarPendiente(op.clave);
        enviados++;
      } catch (e) {
        if (e instanceof SinConexion) break;
        if (e.status === 401) break;
        fallidos.push({ ...op, error: e.message });
        await quitarPendiente(op.clave);
      }
    }
  } finally {
    vaciando = false;
  }
  return { enviados, fallidos };
}

export function nuevoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export async function descargarConToken(ruta, nombre) {
  const resp = await fetch(BASE + ruta, { headers: { Authorization: 'Bearer ' + sesion.token } });
  if (!resp.ok) throw new ErrorApi(resp.status, 'No se pudo descargar');
  const blob = await resp.blob();
  const cd = resp.headers.get('Content-Disposition') || '';
  const m = cd.match(/filename="([^"]+)"/);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = m ? m[1] : nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
