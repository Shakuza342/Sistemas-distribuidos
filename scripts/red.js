// Levanta los tres nodos de prueba en la misma máquina, cada uno con su propia base SQLite.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { RAIZ } from '../src/config.js';

const nodos = process.argv.slice(2).length ? process.argv.slice(2) : ['nodo1', 'nodo2', 'nodo3'];
const colores = ['\x1b[32m', '\x1b[36m', '\x1b[35m', '\x1b[33m'];
const hijos = [];

nodos.forEach((nombre, i) => {
  const hijo = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/server.js', '--config', path.join('nodos', nombre + '.json')], { cwd: RAIZ });
  const prefijo = `${colores[i % colores.length]}[${nombre}]\x1b[0m `;
  const imprimir = datos => datos.toString().split('\n').filter(Boolean).forEach(l => console.log(prefijo + l));
  hijo.stdout.on('data', imprimir);
  hijo.stderr.on('data', imprimir);
  hijo.on('exit', codigo => console.log(prefijo + `terminó (código ${codigo})`));
  hijos.push(hijo);
});

console.log(`Iniciando ${nodos.join(', ')}. Ctrl+C para detener todos.\n`);

function detener() {
  for (const h of hijos) h.kill('SIGINT');
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', detener);
process.on('SIGTERM', detener);
