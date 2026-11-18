import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accesoMovil } from '../src/acceso-movil.js';
import { crearNodo } from '../src/app.js';
import { datosGrafico, graficoEstados, graficoCategorias } from '../public/js/reportes-vista.js';

const estados = { nueva: 'Nueva', vista: 'Vista', en_proceso: 'En proceso', resuelta: 'Resuelta' };

test('el acceso móvil rechaza localhost y nombres internos de Docker', () => {
  for (const url of ['http://localhost:3001', 'http://127.0.0.1:3001', 'http://127.8.0.1', 'http://0.0.0.0:3001', 'http://[::1]:3001', 'http://nodo1:3001', 'http://host.docker.internal:3001', 'javascript:alert(1)', 'sin-direccion', null]) {
    assert.equal(accesoMovil(url).url, null, url);
  }
});
test('el enlace móvil conserva la dirección y el puerto configurados, sin credenciales', () => {
  assert.equal(accesoMovil('http://192.168.1.24:3002').url, 'http://192.168.1.24:3002/');
  assert.equal(accesoMovil('https://comunidad.example').url, 'https://comunidad.example/');
  assert.equal(accesoMovil('http://usuario:clave@192.168.1.24:3001').url, null);
  assert.equal(accesoMovil('http://192.168.1.24:3001/?token=privado').url, null);
});
test('los gráficos usan el total de quejas como denominador y mantienen los ceros', () => {
  const r = datosGrafico({ nueva: 2, vista: 1, en_proceso: 0, resuelta: 7 }, estados);
  assert.equal(r.total, 10);
  assert.deepEqual(r.filas.map(f => f.proporcion), [20, 10, 0, 70]);
  assert.equal(r.filas.reduce((n, f) => n + f.proporcion, 0), 100);
});
test('los gráficos vacíos no muestran porcentajes no definidos ni anillos de éxito', () => {
  const html = graficoEstados({}) + graficoCategorias({});
  assert.doesNotMatch(html, /NaN|Infinity|stroke-dasharray/);
  assert.match(html, /Aún no hay solicitudes/);
  assert.equal(datosGrafico({ nueva: -1, vista: '2', resuelta: NaN }, estados).total, 0);
});
test('las categorías se ordenan por frecuencia y usan una escala común', () => {
  const html = graficoCategorias({ agua: 3, aseo: 1 });
  assert.ok(html.indexOf('>Agua<') < html.indexOf('>Aseo<'));
  assert.match(html, /width:75%/);
  assert.match(html, /width:25%/);
});
test('estado y QR comparten la URL; una configuración local responde 422', async () => {
  for (const url of ['http://localhost:3001', 'http://192.168.1.24:3001']) {
    const n = crearNodo({ nombre: 'Prueba QR', db: ':memory:', urlPublica: url, peers: [], intervaloSyncSegundos: 30, claveRed: 'test', jwtSecreto: 'test', semilla: false });
    const server = await new Promise(ok => { const s = n.app.listen(0, '127.0.0.1', () => ok(s)); });
    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      const estado = await fetch(base + '/api/v1/estado').then(r => r.json());
      const qr = await fetch(base + '/qr.png');
      assert.equal(qr.headers.get('cache-control'), 'no-store');
      if (url.includes('localhost')) {
        assert.equal(qr.status, 422);
        assert.equal(estado.acceso_movil.url, null);
      } else {
        assert.equal(qr.status, 200);
        assert.equal(qr.headers.get('x-destino-qr'), estado.acceso_movil.url);
        assert.match(qr.headers.get('content-type'), /image\/png/);
        const png = Buffer.from(await qr.arrayBuffer());
        assert.equal(png.subarray(1, 4).toString(), 'PNG');
      }
    } finally {
      await new Promise(ok => server.close(ok));
      n.cerrar();
    }
  }
});
