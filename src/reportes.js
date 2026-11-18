import { CATEGORIAS, ESTADOS, ahora } from './db.js';
import { verificarIntegridad } from './integridad.js';

const horasEntre = (a, b) => (new Date(b) - new Date(a)) / 36e5;
const redondear = n => (n === null ? null : Math.round(n * 10) / 10);

function mediana(lista) {
  if (!lista.length) return null;
  const s = [...lista].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function reporteAgregado(db, modelo) {
  const quejas = modelo.listar();
  const totalEnBase = db.prepare('SELECT COUNT(*) AS n FROM queja').get().n;

  const porCategoria = Object.fromEntries(CATEGORIAS.map(c => [c, 0]));
  const porEstado = Object.fromEntries(ESTADOS.map(e => [e, 0]));
  for (const q of quejas) {
    porCategoria[q.categoria]++;
    porEstado[q.estado]++;
  }

  // Métrica 1 (sección 8): tiempo entre la creación y el primer cambio de estado de la administración.
  const primeros = db.prepare(`
    SELECT q.id, q.fecha_creacion, MIN(h.fecha) AS primera
    FROM queja q LEFT JOIN historial_estado h ON h.queja_id = q.id
    GROUP BY q.id`).all();
  const tiemposRespuesta = primeros.filter(p => p.primera).map(p => horasEntre(p.fecha_creacion, p.primera));
  const sinRespuesta = primeros.filter(p => !p.primera);
  const vencidas = sinRespuesta.filter(p => horasEntre(p.fecha_creacion, ahora()) > 72).length;

  const resueltas = db.prepare(`
    SELECT q.fecha_creacion, MIN(h.fecha) AS fecha_resuelta
    FROM queja q JOIN historial_estado h ON h.queja_id = q.id AND h.estado = 'resuelta'
    GROUP BY q.id`).all();
  const tiemposResolucion = resueltas.map(r => horasEntre(r.fecha_creacion, r.fecha_resuelta));

  const integridad = verificarIntegridad(db);
  const nodos = db.prepare(`SELECT id, nombre, url, es_local, es_peer, ultima_sync, ultimo_error FROM nodo
                            WHERE id NOT LIKE 'url:%' OR es_peer = 1 ORDER BY es_local DESC, nombre`).all();

  return {
    generado: ahora(),
    total_quejas: quejas.length,
    por_categoria: porCategoria,
    por_estado: porEstado,
    tiempo_primera_respuesta_horas: {
      promedio: redondear(tiemposRespuesta.length ? tiemposRespuesta.reduce((a, b) => a + b, 0) / tiemposRespuesta.length : null),
      mediana: redondear(mediana(tiemposRespuesta)),
      quejas_con_respuesta: tiemposRespuesta.length,
      quejas_sin_respuesta: sinRespuesta.length,
      sin_respuesta_mas_de_72h: vencidas
    },
    tiempo_resolucion_horas: {
      promedio: redondear(tiemposResolucion.length ? tiemposResolucion.reduce((a, b) => a + b, 0) / tiemposResolucion.length : null),
      quejas_resueltas: tiemposResolucion.length
    },
    mas_apoyadas: [...quejas].sort((a, b) => b.apoyos - a.apoyos).filter(q => q.apoyos > 0).slice(0, 5)
      .map(q => ({ id: q.id, titulo: q.titulo, categoria: q.categoria, estado: q.estado, apoyos: q.apoyos })),
    // Métrica 4: el reporte debe incluir el 100% de lo que hay en la base.
    cobertura_auditoria: {
      quejas_en_reporte: quejas.length,
      quejas_en_base_de_datos: totalEnBase,
      porcentaje: totalEnBase === 0 ? 100 : Math.round((quejas.length / totalEnBase) * 10000) / 100
    },
    integridad: {
      porcentaje_verificable: integridad.porcentaje_verificable,
      total_registros: integridad.total_registros,
      problemas: integridad.problemas.length,
      conflictos_de_sincronizacion: integridad.conflictos.length
    },
    nodos
  };
}
