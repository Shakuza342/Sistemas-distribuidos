import { Router } from 'express';
import { reporteAgregado } from '../reportes.js';
import { verificarIntegridad } from '../integridad.js';

export default function rutasReportes({ db, modelo, auth }) {
  const r = Router();
  const { autenticado, permitir } = auth;

  // "consejo" y "asamblea" del documento corresponden al rol auditor del sistema.
  r.get('/reportes/agregado', autenticado, permitir('auditor', 'administrador'), (req, res) => {
    res.json(reporteAgregado(db, modelo));
  });

  r.get('/integridad', autenticado, permitir('auditor', 'administrador'), (req, res) => {
    res.json(verificarIntegridad(db));
  });

  return r;
}
