// Borra las bases de datos de prueba para empezar desde cero. Detenga los nodos antes de ejecutarlo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const carpeta = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'datos');
let borrados = 0;
for (const f of fs.existsSync(carpeta) ? fs.readdirSync(carpeta) : []) {
  if (/\.db(-wal|-shm)?$/.test(f)) {
    fs.rmSync(path.join(carpeta, f));
    borrados++;
  }
}
console.log(borrados ? `Se borraron ${borrados} archivos de datos/.` : 'No había bases de datos para borrar.');
