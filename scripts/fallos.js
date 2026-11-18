// Pruebas de tolerancia a fallos sobre 3 nodos reales con sincronización automática cada 3 s.
// Uso: npm run fallos
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { RAIZ } from '../src/config.js';
import { carpetaTemporal, configurarNodos, levantar, tumbar, api, login, contarQuejas, esperar, guardarResultado } from './util-red.js';

const linea = t => console.log('\n' + t + '\n' + '-'.repeat(t.length));
const queja = i => ({ id: crypto.randomUUID(), titulo: `Reporte durante la falla ${i}`, descripcion: `Queja ${i} registrada mientras un nodo estaba caído.`, categoria: 'otro' });

async function esperarHasta(condicion, limiteMs = 60000) {
  const t0 = performance.now();
  while (performance.now() - t0 < limiteMs) {
    if (await condicion()) return Math.round(performance.now() - t0);
    await esperar(100);
  }
  return null;
}

async function main() {
  const carpeta = carpetaTemporal('veeduria-fallos-');
  const nodos = configurarNodos(carpeta, ['Nodo A (administración)', 'Nodo B (vecino)', 'Nodo C (vecino)'], 4201, {
    intervaloSyncSegundos: 3, syncAlIniciar: true, timeoutSyncMs: 3000
  });
  const [A, B, C] = nodos;
  const res = {};
  for (const n of nodos) await levantar(n);
  let colgado;

  try {
    await esperarHasta(async () => (await api(C, 'POST', '/auth/login', { correo: 'laura@conjunto.co', password: 'vecino123' })).status === 200);
    const adminA = await login(A, 'admin@conjunto.co', 'admin123');
    const vecino = {};
    for (const n of nodos) vecino[n.nombre] = await login(n, 'carlos@conjunto.co', 'vecino123');
    const todos = async total => (await Promise.all(nodos.map(contarQuejas))).every(c => c === total);

    linea('1. Caída abrupta de un nodo vecino (C se apaga con SIGKILL)');
    await tumbar(C);
    let ok = 0;
    for (let i = 0; i < 10; i++) {
      if ((await api(A, 'POST', '/quejas', queja(i), vecino[A.nombre])).status === 201) ok++;
      if ((await api(B, 'POST', '/quejas', queja(100 + i), vecino[B.nombre])).status === 201) ok++;
    }
    await esperar(12000);
    const vistaA = (await api(A, 'GET', '/nodos', null, adminA)).datos.nodos.find(n => n.url === C.url);
    const sinC = await Promise.all([A, B].map(contarQuejas));
    let t0 = performance.now();
    await levantar(C);
    const recuperacion = await esperarHasta(() => todos(20));
    res.caida_vecino = {
      quejas_aceptadas_durante_caida: ok,
      quejas_en_A_y_B_durante_caida: sinC,
      visto_desde_A: { ultimo_error: vistaA.ultimo_error, circuito: vistaA.circuito },
      ms_para_que_C_se_ponga_al_dia: recuperacion,
      desde_reinicio_ms: Math.round(performance.now() - t0)
    };
    console.log(res.caida_vecino);

    linea('2. Caída del nodo de la administración (A)');
    await tumbar(A);
    ok = 0;
    for (let i = 0; i < 10; i++) if ((await api(B, 'POST', '/quejas', queja(200 + i), vecino[B.nombre])).status === 201) ok++;
    const replicadoEnC = await esperarHasta(async () => (await contarQuejas(C)) === 30, 15000);
    t0 = performance.now();
    await levantar(A);
    const recuperacionA = await esperarHasta(() => todos(30));
    res.caida_administracion = { quejas_registradas_en_B_sin_A: ok, ms_replicacion_B_a_C_sin_A: replicadoEnC, ms_para_que_A_se_ponga_al_dia: recuperacionA };
    console.log(res.caida_administracion);

    linea('3. Un peer que acepta la conexión pero nunca responde (tiempo de espera y circuit breaker)');
    colgado = net.createServer(() => {}).listen(4299, '127.0.0.1');
    const adminA2 = await login(A, 'admin@conjunto.co', 'admin123');
    await api(A, 'POST', '/nodos', { url: 'http://127.0.0.1:4299' }, adminA2);
    const ciclos = [];
    for (let i = 0; i < 5; i++) {
      t0 = performance.now();
      const r = (await api(A, 'POST', '/nodos/sincronizar-ahora', {}, adminA2)).datos;
      ciclos.push({ ms: Math.round(performance.now() - t0), resultados: r.map(x => ({ url: x.url, ok: x.ok, ms: x.ms, error: x.error })) });
    }
    await esperar(10000);
    const estadoColgado = (await api(A, 'GET', '/nodos', null, adminA2)).datos.nodos.find(n => n.url === 'http://127.0.0.1:4299');
    res.peer_colgado = { primer_ciclo_forzado: ciclos[0], circuito_tras_ciclos_automaticos: estadoColgado.circuito };
    console.log(JSON.stringify(res.peer_colgado, null, 2));

    linea('4. Edición directa del SQLite del nodo B');
    const salida = execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/manipular.js', '--config', B.ruta, '--modo', 'editar'], { cwd: RAIZ }).toString();
    console.log(salida.split('\n')[1]);
    await esperar(7000);
    const integ = await Promise.all(nodos.map(async n => (await api(n, 'GET', '/integridad', null, await login(n, 'consejo@conjunto.co', 'consejo123'))).datos));
    const editada = integ[1].problemas.find(p => p.tipo === 'hash_alterado');
    const enA = (await api(A, 'GET', '/quejas/' + editada.registro_id, null, adminA2)).datos.descripcion;
    res.edicion_directa = {
      porcentaje_verificable: Object.fromEntries(nodos.map((n, i) => [n.nombre, integ[i].porcentaje_verificable])),
      conflictos: Object.fromEntries(nodos.map((n, i) => [n.nombre, integ[i].conflictos.map(c => c.tipo)])),
      descripcion_en_A_sigue_original: !enA.includes('no hay ningún problema')
    };
    console.log(res.edicion_directa);

    linea('5. Borrado forzado de una queja en el nodo A');
    await tumbar(A);
    console.log(execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/manipular.js', '--config', A.ruta, '--modo', 'borrar'], { cwd: RAIZ }).toString().split('\n')[1]);
    const base = new DatabaseSync(A.db);
    const antes = base.prepare('SELECT COUNT(*) AS n FROM queja').get().n;
    base.close();
    t0 = performance.now();
    await levantar(A);
    const restaurada = await esperarHasta(async () => (await contarQuejas(A)) === 30, 20000);
    const desdeArranque = Math.round(performance.now() - t0);
    const conflictosA = (await api(A, 'GET', '/integridad', null, await login(A, 'consejo@conjunto.co', 'consejo123'))).datos.conflictos;
    res.borrado_forzado = { quejas_en_A_despues_del_borrado: antes, ms_desde_reinicio_hasta_restaurar: desdeArranque, quejas_ahora: await contarQuejas(A), registros_restaurados: conflictosA.filter(c => c.tipo === 'registro_restaurado').map(c => c.tabla) };
    console.log(res.borrado_forzado);

    linea('6. Nodo ajeno al conjunto intenta inyectar registros');
    const intruso = await fetch(A.url + '/api/v1/nodos/sincronizar', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Clave-Red': 'adivinada' },
      body: JSON.stringify({ nodo: { id: 'intruso' }, registros: { queja: [{ id: 'x', titulo: 'falsa' }] } })
    });
    res.intruso = { status: intruso.status, quejas_en_A: await contarQuejas(A) };
    console.log(res.intruso);

    const ruta = guardarResultado('fallos', res);
    console.log(`\nResultados guardados en ${path.relative(RAIZ, ruta)}`);
  } finally {
    if (colgado) colgado.close();
    for (const n of nodos) await tumbar(n, 'SIGTERM');
    await esperar(300);
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
}

main().catch(e => { console.error(e); process.exit(1); });
