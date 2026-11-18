// Pruebas de concurrencia y rendimiento sobre una red de 3 nodos reales en este equipo.
// Uso: npm run carga            (300 quejas por defecto)
//      npm run carga -- 600
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { RAIZ } from '../src/config.js';
import {
  carpetaTemporal, configurarNodos, levantar, tumbar, api, login, contarQuejas,
  enParalelo, esperar, guardarResultado
} from './util-red.js';

const TOTAL = Number(process.argv[2]) || 300;
const VECINOS = ['laura@conjunto.co', 'carlos@conjunto.co', 'diana@conjunto.co'];
const CATEGORIAS = ['aseo', 'ascensores', 'agua', 'luz', 'seguridad', 'ruido', 'mascotas', 'parqueo', 'otro'];
const foto = 'data:image/png;base64,' + fs.readFileSync(path.join(RAIZ, 'public/iconos/icono-192.png')).toString('base64');

const queja = (i, conFoto) => ({
  id: crypto.randomUUID(),
  titulo: `Queja de prueba número ${i}`,
  descripcion: `Texto de la queja ${i} generada por la prueba de carga para medir el nodo.`,
  categoria: CATEGORIAS[i % CATEGORIAS.length],
  fotos: conFoto ? [foto] : []
});

const linea = t => console.log('\n' + t + '\n' + '-'.repeat(t.length));

async function main() {
  const carpeta = carpetaTemporal('veeduria-carga-');
  const nodos = configurarNodos(carpeta, ['Nodo A', 'Nodo B', 'Nodo C'], 4101);
  const resultados = { total_quejas: TOTAL };
  console.log(`Levantando 3 nodos en ${carpeta}...`);
  for (const n of nodos) await levantar(n);
  const [A, B, C] = nodos;

  try {
    const admin = await login(A, 'admin@conjunto.co', 'admin123');
    await api(A, 'POST', '/nodos/sincronizar-ahora', {}, admin);
    const tokens = {};
    for (const n of nodos) tokens[n.nombre] = await Promise.all(VECINOS.map(c => login(n, c, 'vecino123')));

    linea(`1. Escritura concurrente: ${TOTAL} quejas en el nodo A, 30 a la vez (1 de cada 10 con foto)`);
    resultados.escritura = await enParalelo(TOTAL, 30, async i => {
      const r = await api(A, 'POST', '/quejas', queja(i, i % 10 === 0), tokens[A.nombre][i % 3]);
      return r.status === 201;
    });
    console.log(resultados.escritura);
    const integA = (await api(A, 'GET', '/integridad', null, admin)).datos;
    const cadena = integA.cadenas.find(c => c.tabla === 'queja');
    resultados.escritura.cadena = { eslabones: cadena.longitud, integra: cadena.integra, porcentaje_verificable: integA.porcentaje_verificable };
    console.log('Cadena tras escrituras simultáneas:', resultados.escritura.cadena);

    linea('2. Lectura concurrente del tablero: 1000 consultas, 50 a la vez');
    resultados.lectura_tablero = await enParalelo(1000, 50, async i => (await api(A, 'GET', '/quejas', null, tokens[A.nombre][i % 3])).status === 200);
    console.log(resultados.lectura_tablero);

    const ids = (await api(A, 'GET', '/quejas', null, admin)).datos.map(q => q.id);
    linea('3. Lectura concurrente de detalle: 1000 consultas, 50 a la vez');
    resultados.lectura_detalle = await enParalelo(1000, 50, async i => (await api(A, 'GET', '/quejas/' + ids[i % ids.length], null, admin)).status === 200);
    console.log(resultados.lectura_detalle);

    linea('4. Login concurrente (bcrypt): 100 inicios de sesión, 10 a la vez');
    resultados.login = await enParalelo(100, 10, async i => (await api(A, 'POST', '/auth/login', { correo: VECINOS[i % 3], password: 'vecino123' })).status === 200);
    console.log(resultados.login);

    linea('4b. Lecturas del tablero mientras otros 100 usuarios inician sesión');
    const [mixto] = await Promise.all([
      enParalelo(500, 20, async i => (await api(A, 'GET', '/quejas', null, tokens[A.nombre][i % 3])).status === 200),
      enParalelo(100, 10, async i => (await api(A, 'POST', '/auth/login', { correo: VECINOS[i % 3], password: 'vecino123' })).status === 200)
    ]);
    resultados.lectura_durante_logins = mixto;
    console.log(mixto);

    linea(`5. Sincronización inicial: el nodo B recibe ${TOTAL} quejas desde A`);
    let t0 = performance.now();
    const s1 = (await api(B, 'POST', '/nodos/sincronizar-ahora', { url: A.url }, (await login(B, 'admin@conjunto.co', 'admin123')))).datos[0];
    resultados.sync_inicial = { ms: Math.round(performance.now() - t0), recibidos: s1.recibidos, quejas_en_B: await contarQuejas(B) };
    console.log(resultados.sync_inicial);

    linea('6. Sincronización sin cambios (solo comparar resúmenes)');
    t0 = performance.now();
    await api(B, 'POST', '/nodos/sincronizar-ahora', { url: A.url }, await login(B, 'admin@conjunto.co', 'admin123'));
    resultados.sync_sin_cambios_ms = Math.round(performance.now() - t0);
    console.log(resultados.sync_sin_cambios_ms, 'ms');

    linea('7. Escrituras simultáneas en los 3 nodos (50 por nodo) y convergencia');
    await api(C, 'POST', '/nodos/sincronizar-ahora', { url: A.url }, await login(C, 'admin@conjunto.co', 'admin123'));
    const antes = await contarQuejas(A);
    await Promise.all(nodos.map(n => enParalelo(50, 10, async i => (await api(n, 'POST', '/quejas', queja(i, false), tokens[n.nombre][i % 3])).status === 201)));
    const esperado = antes + 150;
    t0 = performance.now();
    let rondas = 0;
    const tokensAdmin = await Promise.all(nodos.map(n => login(n, 'admin@conjunto.co', 'admin123')));
    while (rondas < 10) {
      rondas++;
      await Promise.all(nodos.map((n, i) => api(n, 'POST', '/nodos/sincronizar-ahora', {}, tokensAdmin[i])));
      const cuentas = await Promise.all(nodos.map(contarQuejas));
      if (cuentas.every(c => c === esperado)) break;
    }
    const integ = await Promise.all(nodos.map((n, i) => api(n, 'GET', '/integridad', null, tokensAdmin[i]).then(r => r.datos)));
    resultados.convergencia = {
      quejas_esperadas: esperado,
      quejas_por_nodo: await Promise.all(nodos.map(contarQuejas)),
      rondas,
      ms: Math.round(performance.now() - t0),
      porcentaje_verificable: integ.map(x => x.porcentaje_verificable),
      conflictos: integ.map(x => x.conflictos.length)
    };
    console.log(resultados.convergencia);

    linea('8. Un nodo nuevo se une a la red y se pone al día solo');
    const D = configurarNodos(carpeta, ['Nodo A', 'Nodo B', 'Nodo C', 'Nodo D'], 4101)[3];
    D.peers = [A.url];
    fs.writeFileSync(D.ruta, JSON.stringify({ ...D, peers: [A.url], syncAlIniciar: true }, null, 2));
    t0 = performance.now();
    await levantar(D);
    while ((await contarQuejas(D)) < esperado && performance.now() - t0 < 30000) await esperar(100);
    resultados.nodo_nuevo = { ms_hasta_tener_todo: Math.round(performance.now() - t0), quejas: await contarQuejas(D) };
    console.log(resultados.nodo_nuevo);
    await tumbar(D, 'SIGTERM');

    const ruta = guardarResultado('carga', resultados);
    console.log(`\nResultados guardados en ${path.relative(RAIZ, ruta)}`);
  } finally {
    for (const n of nodos) await tumbar(n, 'SIGTERM');
    await esperar(300);
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
}

main().catch(e => { console.error(e); process.exit(1); });
