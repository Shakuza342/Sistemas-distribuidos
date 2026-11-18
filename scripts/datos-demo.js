// Carga quejas de ejemplo en la red que está corriendo (npm run red en otra terminal).
// Uso: npm run demo            (usa http://localhost:3001 y http://localhost:3002)
//      npm run demo -- http://192.168.1.10:3001 http://192.168.1.11:3002

const [nodoA = 'http://localhost:3001', nodoB = 'http://localhost:3002'] = process.argv.slice(2);

async function api(base, metodo, ruta, cuerpo, token) {
  const r = await fetch(base + '/api/v1' + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  const datos = await r.json().catch(() => null);
  if (!r.ok && r.status !== 409) throw new Error(`${metodo} ${ruta} en ${base}: ${datos?.error || r.status}`);
  return datos;
}

const login = (base, correo, password) => api(base, 'POST', '/auth/login', { correo, password }).then(r => r.token);
const haceHoras = h => new Date(Date.now() - h * 3600e3).toISOString();
const esperar = ms => new Promise(r => setTimeout(r, ms));

const QUEJAS = [
  { quien: 'laura', nodo: 'A', titulo: 'Ascensor de la torre 1 fuera de servicio', categoria: 'ascensores', horas: 70,
    descripcion: 'El ascensor de la torre 1 lleva desde el lunes detenido en el piso 4. Hay adultos mayores que no pueden bajar.' },
  { quien: 'carlos', nodo: 'A', titulo: 'Basuras acumuladas en el shut de la torre 2', categoria: 'aseo', horas: 52,
    descripcion: 'El cuarto de basuras no se ha vaciado en tres días y ya hay mal olor en el pasillo del primer piso.' },
  { quien: 'diana', nodo: 'B', titulo: 'Ruido de fiestas los fines de semana', categoria: 'ruido', horas: 40,
    descripcion: 'En el apartamento 803 de la torre 3 hay música a alto volumen hasta las 3 de la mañana casi todos los sábados.' },
  { quien: 'laura', nodo: 'B', titulo: 'Bombillos fundidos en el parqueadero', categoria: 'luz', horas: 30,
    descripcion: 'La zona de los puestos 40 al 55 del sótano está completamente oscura en la noche, es un riesgo de seguridad.' },
  { quien: 'carlos', nodo: 'A', titulo: 'Excremento de mascotas en la zona verde', categoria: 'mascotas', horas: 20,
    descripcion: 'Varios dueños no recogen los desechos de sus perros en el parque infantil. Pedimos señalización y control.' },
  { quien: 'diana', nodo: 'B', titulo: 'Vehículo ajeno ocupando parqueadero de visitantes', categoria: 'parqueo', horas: 8,
    descripcion: 'Una camioneta gris lleva dos semanas en el puesto de visitantes 3 y nadie de portería ha hecho nada.' },
  { quien: 'laura', nodo: 'A', titulo: 'Baja presión de agua en pisos altos', categoria: 'agua', horas: 3,
    descripcion: 'Desde los pisos 9 al 12 de la torre 1 el agua sale con muy poca presión en las mañanas, parece la bomba.' }
];

const CORREOS = { laura: 'laura@conjunto.co', carlos: 'carlos@conjunto.co', diana: 'diana@conjunto.co' };

async function main() {
  console.log(`Nodo A: ${nodoA}\nNodo B: ${nodoB}\n`);
  const adminA = await login(nodoA, 'admin@conjunto.co', 'admin123');

  console.log('Sincronizando para que los usuarios lleguen al nodo B...');
  await api(nodoA, 'POST', '/nodos/sincronizar-ahora', {}, adminA);
  await esperar(500);

  const tokens = {};
  for (const [quien, correo] of Object.entries(CORREOS)) {
    tokens[quien + 'A'] = await login(nodoA, correo, 'vecino123');
    tokens[quien + 'B'] = await login(nodoB, correo, 'vecino123').catch(() => null);
  }

  const creadas = [];
  for (const q of QUEJAS) {
    let base = q.nodo === 'B' ? nodoB : nodoA;
    let token = tokens[q.quien + q.nodo];
    if (!token) { base = nodoA; token = tokens[q.quien + 'A']; }
    const r = await api(base, 'POST', '/quejas', {
      titulo: q.titulo, descripcion: q.descripcion, categoria: q.categoria, fecha_creacion: haceHoras(q.horas)
    }, token);
    creadas.push({ ...r, base });
    console.log(`  + [${base === nodoA ? 'A' : 'B'}] ${q.titulo}`);
  }

  console.log('\nSincronizando quejas entre nodos...');
  await api(nodoA, 'POST', '/nodos/sincronizar-ahora', {}, adminA);
  await esperar(500);

  console.log('La administración atiende algunas quejas en el nodo A...');
  const cambios = [[0, ['vista', 'en_proceso']], [1, ['vista', 'en_proceso', 'resuelta']], [3, ['vista']], [4, ['vista', 'resuelta']]];
  for (const [i, estados] of cambios) {
    for (const e of estados) await api(nodoA, 'POST', `/quejas/${creadas[i].id}/estados`, { estado: e }, adminA);
  }
  await api(nodoA, 'POST', `/quejas/${creadas[0].id}/comentarios`, { texto: 'Ya se contactó a la empresa de mantenimiento, el técnico viene el jueves en la mañana.' }, adminA);
  await api(nodoA, 'POST', `/quejas/${creadas[1].id}/comentarios`, { texto: 'Se reforzó la recolección a dos veces por día en la torre 2.' }, adminA);

  console.log('Los vecinos comentan y apoyan...');
  await api(nodoA, 'POST', `/quejas/${creadas[0].id}/apoyos`, {}, tokens.carlosA);
  await api(nodoA, 'POST', `/quejas/${creadas[0].id}/apoyos`, {}, tokens.dianaA);
  await api(nodoA, 'POST', `/quejas/${creadas[2].id}/apoyos`, {}, tokens.lauraA);
  await api(nodoA, 'POST', `/quejas/${creadas[2].id}/apoyos`, {}, tokens.carlosA);
  await api(nodoA, 'POST', `/quejas/${creadas[3].id}/apoyos`, {}, tokens.dianaA);
  await api(nodoA, 'POST', `/quejas/${creadas[0].id}/comentarios`, { texto: 'En la torre 1 vivimos varias personas en silla de ruedas, por favor prioridad.' }, tokens.dianaA);
  await api(nodoA, 'POST', `/quejas/${creadas[2].id}/comentarios`, { texto: 'Confirmo, el sábado pasado fue hasta las 4 am.' }, tokens.carlosA);

  await api(nodoA, 'POST', '/nodos/sincronizar-ahora', {}, adminA);
  console.log(`\nListo: ${creadas.length} quejas de ejemplo creadas y replicadas.`);
}

main().catch(e => {
  console.error('\nError:', e.message);
  console.error('¿Está corriendo la red? Ejecute primero "npm run red" en otra terminal.');
  process.exit(1);
});
