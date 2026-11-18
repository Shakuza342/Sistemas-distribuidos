import { Router } from 'express';

export default function rutasQuejas({ modelo, auth }) {
  const r = Router();
  const { autenticado, permitir } = auth;
  const todos = permitir('vecino', 'administrador', 'auditor');

  r.post('/', autenticado, permitir('vecino'), (req, res) => {
    const { queja, creada } = modelo.crearQueja(req.body || {}, req.usuario);
    res.status(creada ? 201 : 200).json(queja);
  });

  r.get('/', autenticado, todos, (req, res) => {
    const { categoria, estado, mias } = req.query;
    res.json(modelo.listar({ categoria, estado, autor: mias === '1' ? req.usuario.id : undefined }));
  });

  r.get('/:id', autenticado, todos, (req, res) => {
    res.json(modelo.detalle(req.params.id, req.usuario.id));
  });

  r.post('/:id/estados', autenticado, permitir('administrador'), (req, res) => {
    res.status(201).json(modelo.agregarEstado(req.params.id, req.body?.estado, req.usuario));
  });

  r.get('/:id/historial', autenticado, todos, (req, res) => {
    res.json(modelo.historial(req.params.id));
  });

  // La administración también comenta: así se implementa el caso de uso "Responder queja".
  r.post('/:id/comentarios', autenticado, permitir('vecino', 'administrador'), (req, res) => {
    const { comentario, creado } = modelo.comentar(req.params.id, req.body || {}, req.usuario);
    res.status(creado ? 201 : 200).json(comentario);
  });

  r.post('/:id/apoyos', autenticado, permitir('vecino'), (req, res) => {
    const { apoyo, creado } = modelo.apoyar(req.params.id, req.body || {}, req.usuario);
    res.status(creado ? 201 : 200).json(apoyo);
  });

  // RF-04: no se declara ninguna ruta DELETE ni PUT/PATCH sobre quejas.
  return r;
}
