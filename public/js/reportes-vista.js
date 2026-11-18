// Gráficos basados únicamente en los recuentos del reporte agregado.
const ESTADOS = { nueva: 'Nueva', vista: 'Vista', en_proceso: 'En proceso', resuelta: 'Resuelta' };
const CATEGORIAS = { aseo: 'Aseo', ascensores: 'Ascensores', agua: 'Agua', luz: 'Luz', seguridad: 'Seguridad', ruido: 'Ruido', mascotas: 'Mascotas', parqueo: 'Parqueo', otro: 'Otro' };
const cantidad = n => Number.isSafeInteger(n) && n >= 0 ? n : 0;
export const porcentaje = (n, total) => total > 0 ? (100 * n / total).toLocaleString('es-CO', { maximumFractionDigits: 1 }) : '0';

export function datosGrafico(objeto, etiquetas) {
  const filas = Object.entries(etiquetas).map(([id, nombre]) => ({ id, nombre, valor: cantidad(objeto?.[id]) }));
  const total = filas.reduce((s, f) => s + f.valor, 0);
  return { total, filas: filas.map(f => ({ ...f, proporcion: total ? f.valor * 100 / total : 0 })) };
}

export function graficoEstados(objeto) {
  const { total, filas } = datosGrafico(objeto, ESTADOS);
  let inicio = 0;
  const segmentos = filas.map(f => {
    const trazo = f.valor ? `<circle class="segmento-${f.id}" cx="60" cy="60" r="47" pathLength="100" stroke-dasharray="${f.proporcion} ${100 - f.proporcion}" stroke-dashoffset="${-inicio}"/>` : '';
    inicio += f.proporcion;
    return trazo;
  }).join('');
  return `<div class="resumen-estados">
    <div class="anillo-estados" aria-hidden="true">
      <svg viewBox="0 0 120 120" focusable="false"><circle class="anillo-base" cx="60" cy="60" r="47"/>${segmentos}</svg>
      <div class="anillo-centro"><strong>${total}</strong><span>solicitudes</span></div>
    </div>
    ${!total ? '<p class="grafico-vacio">El resumen aparecerá cuando se registre la primera solicitud.</p>' : ''}
    <ul class="leyenda-estados" aria-label="Cantidad y porcentaje de solicitudes por estado">
      ${filas.map(f => `<li><span class="leyenda-nombre"><i class="punto-${f.id}" aria-hidden="true"></i>${f.nombre}</span><strong>${f.valor}</strong><span>${total ? porcentaje(f.valor, total) + ' %' : '—'}</span></li>`).join('')}
    </ul>
  </div>`;
}

export function graficoCategorias(objeto) {
  const { total, filas } = datosGrafico(objeto, CATEGORIAS);
  if (!total) return '<p class="grafico-vacio">Aún no hay solicitudes para comparar las categorías.</p>';
  const ordenadas = filas.sort((a, b) => b.valor - a.valor);
  return `<div class="categorias-grafico">
    <div class="categorias-escala" aria-hidden="true"><span>0 %</span><span>50 %</span><span>100 %</span></div>
    <ol class="categorias-lista" aria-label="Solicitudes por categoría, de mayor a menor">
    ${ordenadas.map(f => `<li class="${f.valor ? '' : 'categoria-sin-registros'}">
      <div class="categoria-datos"><span>${f.nombre}</span><span><strong>${f.valor}</strong> <small>· ${porcentaje(f.valor, total)} %</small></span></div>
      <div class="categoria-pista" aria-hidden="true"><span style="width:${f.proporcion}%"></span></div>
    </li>`).join('')}</ol>
    <p class="grafico-nota">Porcentaje sobre ${total} solicitudes. Cada barra usa la misma escala de 0 a 100 %.</p>
  </div>`;
}
