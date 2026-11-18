// Prueba de caída y recuperación con los nodos en contenedores (docker compose up -d antes).
// Uso: npm run docker:prueba
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { guardarResultado, esperar } from './util-red.js';

const NODOS = [
  { nombre: 'nodo1', contenedor: 'veeduria-nodo1', url: 'http://localhost:3001' },
  { nombre: 'nodo2', contenedor: 'veeduria-nodo2', url: 'http://localhost:3002' },
  { nombre: 'nodo3', contenedor: 'veeduria-nodo3', url: 'http://localhost:3003' }
];
const [N1, N2, N3] = NODOS;
const docker = (...args) => execFileSync('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
const linea = t => console.log('\n' + t + '\n' + '-'.repeat(t.length));

async function api(n, metodo, ruta, cuerpo, token) {
  const r = await fetch(n.url + '/api/v1' + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  return { status: r.status, datos: await r.json().catch(() => null) };
}
const login = async (n, correo, clave) => (await api(n, 'POST', '/auth/login', { correo, password: clave })).datos?.token;
const contar = async n => (await fetch(n.url + '/api/v1/estado').then(r => r.json())).quejas;
const queja = i => ({ id: crypto.randomUUID(), titulo: `Queja durante la caída ${i}`, descripcion: `Registrada mientras un contenedor estaba detenido (${i}).`, categoria: 'otro' });

async function hasta(cond, limite = 90000) {
  const t0 = performance.now();
  while (performance.now() - t0 < limite) {
    try { if (await cond()) return Math.round(performance.now() - t0); } catch {}
    await esperar(200);
  }
  return null;
}

async function main() {
  const res = {};
  await hasta(async () => (await login(N3, 'laura@conjunto.co', 'vecino123')) !== undefined);
  const qr = await fetch(N1.url + '/qr.png');
  res.qr_apunta_a = qr.headers.get('x-destino-qr');
  const base = await contar(N1);
  console.log('Quejas al empezar:', base, '| QR del nodo 1 apunta a', res.qr_apunta_a);

  linea('1. docker stop del nodo 3 y 10 quejas en los nodos 1 y 2');
  docker('stop', N3.contenedor);
  const t1 = await login(N1, 'carlos@conjunto.co', 'vecino123');
  const t2 = await login(N2, 'carlos@conjunto.co', 'vecino123');
  let ok = 0;
  for (let i = 0; i < 5; i++) {
    if ((await api(N1, 'POST', '/quejas', queja(i), t1)).status === 201) ok++;
    if ((await api(N2, 'POST', '/quejas', queja(10 + i), t2)).status === 201) ok++;
  }
  let t0 = performance.now();
  docker('start', N3.contenedor);
  const total = base + 10;
  const recup = await hasta(async () => (await contar(N3)) === total);
  res.contenedor_detenido = { quejas_aceptadas: ok, ms_desde_docker_start_hasta_al_dia: recup ?? Math.round(performance.now() - t0) };
  console.log(res.contenedor_detenido);

  linea('2. docker stop del nodo de la administración y 5 quejas en el nodo 2');
  docker('stop', N1.contenedor);
  ok = 0;
  for (let i = 0; i < 5; i++) if ((await api(N2, 'POST', '/quejas', queja(20 + i), t2)).status === 201) ok++;
  t0 = performance.now();
  const sinAdmin = await hasta(async () => (await contar(N3)) === total + 5);
  res.admin_detenido = { quejas_en_nodo2: ok, ms_hasta_llegar_al_nodo3_sin_admin: sinAdmin, nota: 'llega en el siguiente ciclo automático (cada 30 s)' };
  t0 = performance.now();
  docker('start', N1.contenedor);
  res.admin_detenido.ms_desde_docker_start_hasta_al_dia = await hasta(async () => (await contar(N1)) === total + 5);
  console.log(res.admin_detenido);

  linea('3. Alteración directa del SQLite dentro del contenedor del nodo 2');
  const salida = docker('exec', N2.contenedor, 'node', '--disable-warning=ExperimentalWarning', 'scripts/manipular.js', '--config', 'nodos/docker/nodo2.json', '--modo', 'editar');
  console.log(salida.split('\n')[1]);
  const admin = await login(N1, 'admin@conjunto.co', 'admin123');
  await api(N1, 'POST', '/nodos/sincronizar-ahora', {}, admin);
  const consejo = await Promise.all(NODOS.map(n => login(n, 'consejo@conjunto.co', 'consejo123')));
  const integ = await Promise.all(NODOS.map((n, i) => api(n, 'GET', '/integridad', null, consejo[i]).then(r => r.datos)));
  res.alteracion_en_contenedor = Object.fromEntries(NODOS.map((n, i) => [n.nombre, {
    porcentaje_verificable: integ[i].porcentaje_verificable,
    conflictos: integ[i].conflictos.map(c => c.tipo)
  }]));
  console.log(res.alteracion_en_contenedor);

  res.contenedores = docker('ps', '--filter', 'name=veeduria-', '--format', '{{.Names}} {{.Status}}').split('\n');
  console.log('\n' + res.contenedores.join('\n'));
  console.log('\nResultados guardados en', guardarResultado('docker', res));
}

main().catch(e => { console.error(e.message); process.exit(1); });
