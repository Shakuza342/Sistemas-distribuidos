import { Router } from 'express';
import { agregarPeer } from '../db.js';
import { atenderSincronizacion, sincronizarCon, exportarPaquete, importarPaquete } from '../sync.js';

export default function rutasNodos({ db, nodo, cfg, auth, circuito, sincronizarAhora }) {
  const r = Router();
  const { autenticado, permitir, claveRed } = auth;

  r.post('/sincronizar', claveRed, (req, res) => {
    const respuesta = atenderSincronizacion(db, nodo, req.body);
    res.status(respuesta.conflictos.length ? 409 : 200).json(respuesta);
  });

  r.get('/', autenticado, permitir('administrador', 'auditor'), (req, res) => {
    const nodos = db.prepare(`
      SELECT id, nombre, url, es_local, es_peer, ultima_sync, ultimo_error FROM nodo
      ORDER BY es_local DESC, es_peer DESC, nombre`).all()
      .map(n => (n.es_peer ? { ...n, circuito: circuito.consultar(n.url) } : n));
    res.json({ local: nodo, intervalo_segundos: cfg.intervaloSyncSegundos, nodos });
  });

  r.post('/', autenticado, permitir('administrador'), (req, res) => {
    const url = String(req.body?.url || '').trim();
    if (!/^https?:\/\/[^\s]+$/.test(url)) return res.status(400).json({ error: 'URL no válida. Ejemplo: http://192.168.1.20:3002' });
    res.status(201).json({ id: agregarPeer(db, url) });
  });

  r.post('/sincronizar-ahora', autenticado, permitir('administrador', 'vecino'), async (req, res) => {
    const url = req.body?.url;
    const resultados = url ? [await sincronizarCon(db, nodo, url, cfg.claveRed, cfg.timeoutSyncMs)] : await sincronizarAhora(true);
    res.json(resultados);
  });

  // Sincronización por medio físico (USB): exportar e importar el mismo paquete que viaja por red.
  r.get('/exportar', autenticado, permitir('administrador'), (req, res) => {
    const paquete = exportarPaquete(db, nodo);
    const nombre = `veeduria-${nodo.nombre.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${paquete.exportado.slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.json(paquete);
  });

  r.post('/importar', autenticado, permitir('administrador'), (req, res) => {
    const r2 = importarPaquete(db, nodo, req.body);
    res.status(r2.conflictos.length ? 409 : 200).json(r2);
  });

  return r;
}
