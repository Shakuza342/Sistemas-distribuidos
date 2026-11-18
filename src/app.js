import express from 'express';
import path from 'node:path';
import os from 'node:os';
import QRCode from 'qrcode';
import { RAIZ } from './config.js';
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
    res.json({ nodo, hora: new Date().toISOString(), quejas: db.prepare('SELECT COUNT(*) AS n FROM queja').get().n });
  });
  app.use('/api/v1/auth', rutasAuth(deps));
  app.use('/api/v1/quejas', rutasQuejas(deps));
  app.use('/api/v1/nodos', rutasNodos(deps));
  app.use('/api/v1/usuarios', rutasUsuarios(deps));
  app.use('/api/v1', rutasReportes(deps));

  app.get('/qr.png', async (req, res) => {
    let destino = cfg.urlPublica;
    if (/localhost|127\.0\.0\.1/.test(destino)) {
      const ip = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal);
      if (ip) destino = destino.replace(/localhost|127\.0\.0\.1/, ip.address);
    }
    const png = await QRCode.toBuffer(destino, { width: 360, margin: 2 });
    res.setHeader('X-Destino-QR', destino);
    res.type('png').send(png);
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
