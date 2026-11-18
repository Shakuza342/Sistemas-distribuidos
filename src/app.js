import express from 'express';
import path from 'node:path';
import QRCode from 'qrcode';
import { RAIZ } from './config.js';
import { accesoMovil } from './acceso-movil.js';
import { abrirDB, agregarPeer } from './db.js';
import { crearAuth } from './auth.js';
import { crearModelo } from './modelo.js';
import { sembrarSiVacio } from './semilla.js';
import { sincronizarTodos } from './sync.js';
import { crearCircuito } from './circuito.js';
import rutasAuth from './rutas/auth.js';
import rutasQuejas from './rutas/quejas.js';
import rutasNodos from './rutas/nodos.js';
import rutasUsuarios from './rutas/usuarios.js';
import rutasReportes from './rutas/reportes.js';

export function crearNodo(cfg) {
  const { db, nodoId } = abrirDB(cfg.db, cfg.nombre, cfg.urlPublica);
  const nodo = { id: nodoId, nombre: cfg.nombre, url: cfg.urlPublica };
  for (const url of cfg.peers || []) agregarPeer(db, url);
  const sembrados = cfg.semilla ? sembrarSiVacio(db, nodoId) : 0;

  const circuito = crearCircuito({ esperaBaseMs: cfg.intervaloSyncSegundos * 2000 });
  const auth = crearAuth(cfg);
  const modelo = crearModelo(db, nodoId);
  let sincronizando = false;
  async function sincronizarAhora(forzar = false) {
    if (sincronizando) return [];
    sincronizando = true;
    try {
      return await sincronizarTodos(db, nodo, cfg, circuito, forzar);
    } finally {
      sincronizando = false;
    }
  }

  const deps = { db, nodo, cfg, auth, modelo, circuito, sincronizarAhora };

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '50mb' }));

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Clave-Red');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.get('/api/v1/estado', (req, res) => {
    res.json({ nodo, acceso_movil: accesoMovil(cfg.urlPublica), hora: new Date().toISOString(), quejas: db.prepare('SELECT COUNT(*) AS n FROM queja').get().n });
  });
  app.use('/api/v1/auth', rutasAuth(deps));
  app.use('/api/v1/quejas', rutasQuejas(deps));
  app.use('/api/v1/nodos', rutasNodos(deps));
  app.use('/api/v1/usuarios', rutasUsuarios(deps));
  app.use('/api/v1', rutasReportes(deps));

  app.get('/qr.png', async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const acceso = accesoMovil(cfg.urlPublica);
    if (!acceso.url) return res.status(422).json({ error: acceso.mensaje });
    try {
      const png = await QRCode.toBuffer(acceso.url, { width: 480, margin: 4, errorCorrectionLevel: 'M' });
      res.setHeader('X-Destino-QR', acceso.url);
      res.type('png').send(png);
    } catch (err) { next(err); }
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
  app.use(express.static(path.join(RAIZ, 'public')));

  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Error interno del nodo' : err.message });
  });

  let temporizador = null;
  function iniciarSyncPeriodico(alTerminar) {
    const ciclo = async () => {
      const r = await sincronizarAhora();
      if (alTerminar) alTerminar(r);
    };
    temporizador = setInterval(ciclo, cfg.intervaloSyncSegundos * 1000);
    if (cfg.syncAlIniciar !== false) setTimeout(ciclo, 1500);
  }

  function cerrar() {
    if (temporizador) clearInterval(temporizador);
    db.close();
  }

  return { app, db, nodo, modelo, circuito, sembrados, sincronizarAhora, iniciarSyncPeriodico, cerrar };
}
