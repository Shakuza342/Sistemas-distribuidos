// Copia local en el dispositivo (RF-02): IndexedDB guarda el último tablero, los detalles
// consultados y la cola de operaciones hechas sin conexión.

const NOMBRE = 'veeduria-p2p';
let conexion = null;

function abrir() {
  if (conexion) return conexion;
  conexion = new Promise((ok, mal) => {
    const pet = indexedDB.open(NOMBRE, 1);
    pet.onupgradeneeded = () => {
      const db = pet.result;
      db.createObjectStore('cache');
      db.createObjectStore('pendientes', { keyPath: 'clave', autoIncrement: true });
    };
    pet.onsuccess = () => ok(pet.result);
    pet.onerror = () => mal(pet.error);
  });
  return conexion;
}

async function tx(almacen, modo, fn) {
  const db = await abrir();
  return new Promise((ok, mal) => {
    const t = db.transaction(almacen, modo);
    const resultado = fn(t.objectStore(almacen));
    t.oncomplete = () => ok(resultado?.result ?? resultado);
    t.onerror = () => mal(t.error);
  });
}

export const guardarCache = (clave, valor) => tx('cache', 'readwrite', s => s.put(valor, clave));
export const leerCache = clave => tx('cache', 'readonly', s => s.get(clave));

export const encolar = operacion => tx('pendientes', 'readwrite', s => s.add({ ...operacion, creado: new Date().toISOString() }));
export const pendientes = () => tx('pendientes', 'readonly', s => s.getAll());
export const quitarPendiente = clave => tx('pendientes', 'readwrite', s => s.delete(clave));

export async function borrarTodo() {
  await tx('cache', 'readwrite', s => s.clear());
  await tx('pendientes', 'readwrite', s => s.clear());
}
