// Utilidades compartidas por las pruebas de carga y de fallos: levantan nodos reales
// (procesos aparte, cada uno con su SQLite en una carpeta temporal) y les hacen peticiones.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RAIZ } from '../src/config.js';

export const esperar = ms => new Promise(r => setTimeout(r, ms));

export function carpetaTemporal(prefijo) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefijo));
}

export function configurarNodos(carpeta, nombres, puertoBase, extra = {}) {
  return nombres.map((nombre, i) => {
    const puerto = puertoBase + i;
    const cfg = {
      nombre,
      puerto,
      host: '127.0.0.1',
      db: path.join(carpeta, `n${i + 1}.db`),
      urlPublica: `http://127.0.0.1:${puerto}`,
      peers: nombres.map((_, j) => `http://127.0.0.1:${puertoBase + j}`).filter((_, j) => j !== i),
      intervaloSyncSegundos: 3600,
      syncAlIniciar: false,
      claveRed: 'clave-pruebas',
      jwtSecreto: 'jwt-pruebas',
      semilla: i === 0,
      ...extra
    };
    const ruta = path.join(carpeta, `n${i + 1}.json`);
    fs.writeFileSync(ruta, JSON.stringify(cfg, null, 2));
    return { ...cfg, ruta, url: cfg.urlPublica };
  });
}

export async function levantar(nodo) {
  nodo.proceso = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/server.js', '--config', nodo.ruta], {
    cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe']
  });
  nodo.log = [];
  nodo.proceso.stdout.on('data', d => nodo.log.push(d.toString()));
  nodo.proceso.stderr.on('data', d => nodo.log.push(d.toString()));
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(nodo.url + '/api/v1/estado');
      if (r.ok) return nodo;
    } catch {}
    await esperar(100);
  }
  throw new Error(`El nodo ${nodo.nombre} no arrancó:\n${nodo.log.join('')}`);
}

export function tumbar(nodo, senal = 'SIGKILL') {
  return new Promise(ok => {
    if (!nodo.proceso || nodo.proceso.exitCode !== null) return ok();
    nodo.proceso.once('exit', ok);
    nodo.proceso.kill(senal);
  });
}

export async function api(nodo, metodo, ruta, cuerpo, token) {
  const r = await fetch(nodo.url + '/api/v1' + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  return { status: r.status, datos: await r.json().catch(() => null) };
}

export async function login(nodo, correo, password) {
  const r = await api(nodo, 'POST', '/auth/login', { correo, password });
  if (r.status !== 200) throw new Error(`login ${correo} en ${nodo.nombre}: ${r.datos?.error}`);
  return r.datos.token;
}

export async function contarQuejas(nodo) {
  const r = await fetch(nodo.url + '/api/v1/estado').then(x => x.json());
  return r.quejas;
}

export function percentil(lista, p) {
  if (!lista.length) return null;
  const s = [...lista].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}

export function estadisticas(tiempos) {
  const total = tiempos.reduce((a, b) => a + b, 0);
  return {
    n: tiempos.length,
    promedio_ms: +(total / tiempos.length).toFixed(1),
    p50_ms: +percentil(tiempos, 50).toFixed(1),
    p95_ms: +percentil(tiempos, 95).toFixed(1),
    p99_ms: +percentil(tiempos, 99).toFixed(1),
    max_ms: +Math.max(...tiempos).toFixed(1)
  };
}

// Ejecuta `total` tareas con `concurrencia` en vuelo al mismo tiempo y mide cada una.
export async function enParalelo(total, concurrencia, tarea) {
  const tiempos = [];
  const errores = [];
  let siguiente = 0;
  const inicio = performance.now();
  async function trabajador() {
    while (siguiente < total) {
      const i = siguiente++;
      const t0 = performance.now();
      try {
        const ok = await tarea(i);
        if (ok === false) errores.push(i);
      } catch (e) {
        errores.push(e.message);
      }
      tiempos.push(performance.now() - t0);
    }
  }
  await Promise.all(Array.from({ length: concurrencia }, trabajador));
  const segundos = (performance.now() - inicio) / 1000;
  return { ...estadisticas(tiempos), errores: errores.length, duracion_s: +segundos.toFixed(2), por_segundo: +(total / segundos).toFixed(1) };
}

export function guardarResultado(nombre, datos) {
  const carpeta = path.join(RAIZ, 'resultados');
  fs.mkdirSync(carpeta, { recursive: true });
  const ruta = path.join(carpeta, `${nombre}.json`);
  fs.writeFileSync(ruta, JSON.stringify({ fecha: new Date().toISOString(), node: process.version, so: `${os.type()} ${os.release()}`, cpu: os.cpus()[0]?.model, nucleos: os.cpus().length, ...datos }, null, 2));
  return ruta;
}
