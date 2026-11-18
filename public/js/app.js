import { sesion, pedir, leer, escribir, vaciarCola, nuevoId, alSesionVencida, SinConexion } from './api.js';
import { pendientes, borrarTodo } from './almacen.js';
import { ico } from './iconos.js';
import { graficoEstados, graficoCategorias, porcentaje } from './reportes-vista.js';

const $ = sel => document.querySelector(sel);
const vista = $('#vista');

const CATEGORIAS = {
  aseo: 'Aseo', ascensores: 'Ascensores', agua: 'Agua', luz: 'Luz', seguridad: 'Seguridad',
  ruido: 'Ruido', mascotas: 'Mascotas', parqueo: 'Parqueo', otro: 'Otro'
};
const ESTADOS = { nueva: 'Nueva', vista: 'Vista', en_proceso: 'En proceso', resuelta: 'Resuelta' };
const ORDEN_ESTADOS = ['nueva', 'vista', 'en_proceso', 'resuelta'];
const ACCION_ESTADO = { vista: 'Marcar como vista', en_proceso: 'Pasar a en proceso', resuelta: 'Marcar como resuelta' };
const ROLES = { vecino: 'Vecino', administrador: 'Administración', auditor: 'Consejo (auditor)' };

const MENU = {
  vecino: [['tablero', 'Tablero'], ['nueva', 'Nueva queja'], ['mias', 'Mis quejas']],
  administrador: [['tablero', 'Tablero'], ['reportes', 'Reportes'], ['integridad', 'Integridad'], ['nodos', 'Conexión'], ['usuarios', 'Usuarios']],
  auditor: [['tablero', 'Tablero'], ['reportes', 'Reportes'], ['integridad', 'Integridad'], ['nodos', 'Conexión']]
};

const PERMISOS = {
  tablero: ['vecino', 'administrador', 'auditor'],
  mias: ['vecino'],
  nueva: ['vecino'],
  queja: ['vecino', 'administrador', 'auditor'],
  reportes: ['administrador', 'auditor'],
  integridad: ['administrador', 'auditor'],
  nodos: ['administrador', 'auditor'],
  usuarios: ['administrador']
};

function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

function hace(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 30) return `hace ${Math.floor(s / 86400)} d`;
  return fecha(iso);
}

const corto = h => (h ? h.slice(0, 10) + '…' + h.slice(-6) : '—');
const chipEstado = e => `<span class="estado estado-${esc(e)}">${esc(ESTADOS[e] || e)}</span>`;
const chipCategoria = c => `<span class="categoria cat-${esc(c)}">${ico(c)}${esc(CATEGORIAS[c] || c)}</span>`;
const folio = h => (h ? h.slice(0, 6).toUpperCase() : '——————');
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fechaBloque(iso) {
  const d = new Date(iso);
  return `<div class="q-fecha"><b>${d.getDate()}</b><span>${MESES[d.getMonth()]}</span></div>`;
}

let temporizadorAviso;
function aviso(texto, esError = false) {
  const el = $('#aviso');
  el.textContent = texto;
  el.classList.toggle('error', esError);
  el.classList.add('visible');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => el.classList.remove('visible'), 3500);
}

async function actualizarChipRed() {
  const chip = $('#chip-red');
  const n = (await pendientes()).length;
  const enLinea = navigator.onLine;
  chip.classList.toggle('sin-red', !enLinea || n > 0);
  chip.textContent = !enLinea ? `sin conexión${n ? ` · ${n} en cola` : ''}` : n ? `${n} por enviar` : 'en línea';
}

function pintarMenu(seccion) {
  const u = sesion.usuario;
  document.body.classList.toggle('sesion-activa', Boolean(u));
  $('#barra').hidden = !u;
  $('#menu').hidden = !u;
  if (!u) return;
  $('#menu').innerHTML = MENU[u.rol].map(([ruta, texto]) =>
    `<a href="#/${ruta}" class="${seccion === ruta ? 'activo' : ''}" ${seccion === ruta ? 'aria-current="page"' : ''}>${ico(ruta)}<span>${texto}</span></a>`).join('');
}


async function navegar() {
  const [, seccion = 'tablero', param] = location.hash.split('/');
  const u = sesion.usuario;

  if (!u || !sesion.token) {
    pintarMenu(null);
    return vistaLogin();
  }
  if (!PERMISOS[seccion] || !PERMISOS[seccion].includes(u.rol)) {
    location.hash = '#/tablero';
    return;
  }
  pintarMenu(seccion);
  window.scrollTo(0, 0);
  vista.innerHTML = '<div class="cargando">Cargando…</div>';
  try {
    switch (seccion) {
      case 'tablero': return await vistaTablero(false);
      case 'mias': return await vistaTablero(true);
      case 'nueva': return vistaNueva();
      case 'queja': return await vistaDetalle(decodeURIComponent(param));
      case 'reportes': return await vistaReportes();
      case 'integridad': return await vistaIntegridad();
      case 'nodos': return await vistaNodos();
      case 'usuarios': return await vistaUsuarios();
    }
  } catch (e) {
    vista.innerHTML = `<div class="tarjeta"><h2>No se pudo cargar</h2><p>${esc(e.message)}</p>
      ${e instanceof SinConexion ? '<p class="ayuda">Esta sección necesita conexión con el nodo y no hay una copia guardada en el dispositivo.</p>' : ''}</div>`;
  }
}

function vistaLogin() {
  vista.innerHTML = `
    <div class="login">
      <section class="login-presentacion" aria-labelledby="titulo-bienvenida">
      <div class="logo">
        <img src="/iconos/comunidad.png" alt="" width="64" height="64">
        <div>
          <strong class="marca-nombre">Veeduría</strong>
          <span class="marca-descriptor">DEL CONJUNTO</span>
        </div>
      </div>
      <div class="login-mensaje">
        <span class="antetitulo">Participación y transparencia</span>
        <h1 id="titulo-bienvenida">Una comunidad<br>que se escucha.</h1>
        <p class="lema">Un espacio para expresar lo que importa, seguir cada solicitud y construir un mejor lugar para vivir.</p>
      </div>
      <ul class="login-valores">
        <li>${ico('comentario')}<div><strong>Tu voz tiene un lugar</strong><span>Registra y consulta las solicitudes del conjunto.</span></div></li>
        <li>${ico('integridad')}<div><strong>Seguimiento transparente</strong><span>Cada respuesta queda en el historial.</span></div></li>
        <li>${ico('nodos')}<div><strong>Una comunidad conectada</strong><span>Consulta las novedades y participa desde tu dispositivo.</span></div></li>
      </ul>
      <div class="login-pie">Veeduría ciudadana <span>·</span> Convivencia y confianza</div>
      </section>
      <section class="login-acceso" aria-labelledby="titulo-acceso">
      <form class="tarjeta" id="form-login" autocomplete="on">
        <span class="antetitulo">Portal de la comunidad</span>
        <h2 id="titulo-acceso">Bienvenido de nuevo</h2>
        <p class="acceso-descripcion">Ingresa con tu cuenta para participar y consultar las novedades de tu conjunto.</p>
        <label for="correo">Correo electrónico</label>
        <input id="correo" name="correo" type="email" required autocomplete="username" placeholder="Ingresa tu correo">
        <label for="password">Contraseña</label>
        <input id="password" name="password" type="password" required autocomplete="current-password" placeholder="Tu contraseña">
        <div class="error-form" id="error-login"></div>
        <button class="boton primario ancho" style="margin-top:1.4rem">Ingresar al portal <span aria-hidden="true">→</span></button>
        <p class="ayuda acceso-ayuda">Si necesitas una cuenta o ayuda para ingresar, comunícate con la administración del conjunto.</p>
      </form>
      <p class="acceso-nota">${ico('integridad')} Acceso para residentes, administración y consejo.</p>
      </section>
    </div>`;

  $('#form-login').addEventListener('submit', async ev => {
    ev.preventDefault();
    const boton = ev.target.querySelector('button.primario');
    boton.disabled = true;
    $('#error-login').textContent = '';
    try {
      const r = await pedir('POST', '/auth/login', { correo: $('#correo').value, password: $('#password').value });
      sesion.guardar(r.token, r.usuario);
      location.hash = '#/tablero';
      navegar();
    } catch (e) {
      $('#error-login').textContent = e.message;
    } finally {
      boton.disabled = false;
    }
  });
}

async function quejasPendientes() {
  return (await pendientes())
    .filter(op => op.ruta === '/quejas')
    .map(op => ({ ...op.cuerpo, estado: 'pendiente', apoyos: 0, comentarios: 0, fotos: op.cuerpo.fotos?.length || 0,
      autor_id: sesion.usuario.id, autor_nombre: sesion.usuario.nombre, autor_unidad: sesion.usuario.unidad_residencial, pendiente: true }));
}

async function vistaTablero(soloMias) {
  const u = sesion.usuario;
  const { datos, desdeCache } = await leer('/quejas', 'tablero');
  const enCola = u.rol === 'vecino' ? await quejasPendientes() : [];
  const filtros = JSON.parse(sessionStorage.getItem('filtros') || '{}');

  vista.innerHTML = `
    <div class="encabezado-vista">
      <div>
        <span class="antetitulo" id="conteo">Libro de quejas</span>
        <h1>${soloMias ? 'Mis quejas' : 'Tablero de quejas'}</h1>
        <p class="subtitulo-vista">${soloMias ? 'Consulta el avance de tus solicitudes y las respuestas recibidas.' : 'Cada solicitud cuenta. Sigue lo que sucede en tu comunidad.'}</p>
      </div>
      ${u.rol === 'vecino' ? `<a class="boton primario" href="#/nueva">${ico('nueva')}Nueva queja</a>` : ''}
    </div>
    ${desdeCache ? '<div class="alerta info">Sin conexión con el nodo: se muestra la última copia guardada en este dispositivo.</div>' : ''}
    <div class="filtros">
      <select id="f-categoria" aria-label="Filtrar por categoría"><option value="">Todas las categorías</option>
        ${Object.entries(CATEGORIAS).map(([k, v]) => `<option value="${k}" ${filtros.categoria === k ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
      <select id="f-estado" aria-label="Filtrar por estado"><option value="">Todos los estados</option>
        ${Object.entries(ESTADOS).map(([k, v]) => `<option value="${k}" ${filtros.estado === k ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
      <label class="casilla"><input type="checkbox" id="f-abiertas" ${filtros.abiertas ? 'checked' : ''}> Solo sin resolver</label>
    </div>
    <div class="libro" id="lista"></div>`;

  function pintar() {
    const f = { categoria: $('#f-categoria').value, estado: $('#f-estado').value, abiertas: $('#f-abiertas').checked };
    sessionStorage.setItem('filtros', JSON.stringify(f));
    const ids = new Set(datos.map(q => q.id));
    let lista = [...enCola.filter(q => !ids.has(q.id)), ...datos];
    if (soloMias) lista = lista.filter(q => q.autor_id === u.id);
    if (f.categoria) lista = lista.filter(q => q.categoria === f.categoria);
    if (f.estado) lista = lista.filter(q => q.estado === f.estado);
    if (f.abiertas) lista = lista.filter(q => q.estado !== 'resuelta');

    const abiertas = lista.filter(q => q.estado !== 'resuelta').length;
    $('#conteo').textContent = `${lista.length} registro${lista.length === 1 ? '' : 's'} · ${abiertas} sin resolver`;
    $('#lista').innerHTML = lista.length ? lista.map(q => `
      <a class="queja q-${q.pendiente ? 'pendiente' : esc(q.estado)}" href="#/queja/${encodeURIComponent(q.id)}">
        ${fechaBloque(q.fecha_creacion)}
        <div class="q-cuerpo">
          <div class="q-linea">${chipCategoria(q.categoria)}<span class="folio">folio ${q.pendiente ? 'pendiente' : folio(q.hash)}</span></div>
          <h3>${esc(q.titulo)}</h3>
          <p>${esc(q.descripcion)}</p>
          <div class="meta">
            <span>${esc(q.autor_unidad || '')}</span>
            <span>${hace(q.fecha_creacion)}</span>
            <span class="contadores"><span title="Apoyos">${ico('apoyo')}${q.apoyos}</span><span title="Comentarios">${ico('comentario')}${q.comentarios}</span>${q.fotos ? `<span title="Fotos">${ico('foto')}${q.fotos}</span>` : ''}</span>
          </div>
        </div>
        <div class="q-sello">${q.pendiente ? '<span class="estado estado-pendiente">En cola</span>' : chipEstado(q.estado)}</div>
      </a>`).join('')
      : `<div class="vacio">${soloMias ? 'Todavía no ha registrado quejas.' : 'No hay quejas con esos filtros.'}</div>`;
  }

  ['#f-categoria', '#f-estado', '#f-abiertas'].forEach(s => $(s).addEventListener('change', pintar));
  pintar();
}

function comprimir(archivo, maximo = 1280, calidad = 0.72) {
  return new Promise((ok, mal) => {
    const img = new Image();
    const url = URL.createObjectURL(archivo);
    img.onload = () => {
      const escala = Math.min(1, maximo / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * escala);
      c.height = Math.round(img.height * escala);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', calidad));
    };
    img.onerror = () => mal(new Error('No se pudo leer la imagen'));
    img.src = url;
  });
}

function vistaNueva() {
  const fotos = [];
  let ubicacion = null;

  vista.innerHTML = `
    <span class="antetitulo">Nuevo registro</span>
    <h1>Registrar queja o solicitud</h1>
    <form class="tarjeta" id="form-queja">
      <label for="titulo">Título</label>
      <input id="titulo" maxlength="120" required placeholder="Ej: Ascensor de la torre 2 fuera de servicio">
      <label for="categoria">Categoría</label>
      <select id="categoria" required>
        <option value="">Seleccione…</option>
        ${Object.entries(CATEGORIAS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
      </select>
      <label for="descripcion">Descripción</label>
      <textarea id="descripcion" required placeholder="Cuente qué pasa, desde cuándo y dónde exactamente"></textarea>
      <small class="ayuda">La queja no se puede editar ni borrar después. No escriba nombres, teléfonos ni datos de otras personas.</small>
      <label for="fotos">Fotografías (opcional, máximo 3)</label>
      <input id="fotos" type="file" accept="image/*" multiple>
      <div class="previas" id="previas"></div>
      <label>Ubicación (opcional)</label>
      <button type="button" class="boton pequeno" id="boton-ubicacion">${ico('ubicacion')}Usar mi ubicación actual</button>
      <div class="ayuda" id="texto-ubicacion">No se adjunta ubicación.</div>
      <div class="error-form" id="error-queja"></div>
      <div class="acciones">
        <button class="boton primario">Registrar queja</button>
        <a class="boton" href="#/tablero">Cancelar</a>
      </div>
      <p class="ayuda">Una vez registrada, la queja no se puede borrar ni editar: queda en la cadena verificable del conjunto y solo se le agregan estados y comentarios.</p>
    </form>`;

  function pintarPrevias() {
    $('#previas').innerHTML = fotos.map((f, i) => `<figure><img src="${f}" alt="foto ${i + 1}"><button type="button" data-i="${i}" aria-label="Quitar">×</button></figure>`).join('');
    $('#previas').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { fotos.splice(Number(b.dataset.i), 1); pintarPrevias(); }));
  }

  $('#fotos').addEventListener('change', async ev => {
    for (const archivo of ev.target.files) {
      if (fotos.length >= 3) { aviso('Máximo 3 fotografías', true); break; }
      try { fotos.push(await comprimir(archivo)); } catch (e) { aviso(e.message, true); }
    }
    ev.target.value = '';
    pintarPrevias();
  });

  $('#boton-ubicacion').addEventListener('click', () => {
    if (!navigator.geolocation) return aviso('Este navegador no permite obtener la ubicación', true);
    $('#texto-ubicacion').textContent = 'Obteniendo ubicación…';
    navigator.geolocation.getCurrentPosition(
      p => {
        ubicacion = { lat: p.coords.latitude, lng: p.coords.longitude };
        $('#texto-ubicacion').textContent = `Ubicación: ${ubicacion.lat.toFixed(5)}, ${ubicacion.lng.toFixed(5)}`;
      },
      () => { $('#texto-ubicacion').textContent = 'No se pudo obtener la ubicación (requiere HTTPS y permiso).'; },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  $('#form-queja').addEventListener('submit', async ev => {
    ev.preventDefault();
    const boton = ev.target.querySelector('button.primario');
    boton.disabled = true;
    $('#error-queja').textContent = '';
    const cuerpo = {
      id: nuevoId(),
      titulo: $('#titulo').value.trim(),
      categoria: $('#categoria').value,
      descripcion: $('#descripcion').value.trim(),
      fecha_creacion: new Date().toISOString(),
      ubicacion_lat: ubicacion?.lat ?? null,
      ubicacion_lng: ubicacion?.lng ?? null,
      fotos
    };
    try {
      const r = await escribir('/quejas', cuerpo, 'Queja: ' + cuerpo.titulo);
      aviso(r.encolado ? 'Sin conexión: la queja quedó guardada en el dispositivo y se enviará sola al recuperar la red.' : 'Queja registrada y encadenada.');
      await actualizarChipRed();
      location.hash = '#/mias';
    } catch (e) {
      $('#error-queja').textContent = e.message;
      boton.disabled = false;
    }
  });
}

async function vistaDetalle(id) {
  const u = sesion.usuario;
  let q, historial, desdeCache = false;
  try {
    const r = await leer('/quejas/' + encodeURIComponent(id), 'detalle:' + id);
    q = r.datos;
    desdeCache = r.desdeCache;
    historial = (await leer(`/quejas/${encodeURIComponent(id)}/historial`, 'historial:' + id)).datos;
  } catch (e) {
    const enCola = (await quejasPendientes()).find(x => x.id === id);
    if (!enCola) throw e;
    q = { ...enCola, fotos: (enCola.fotos || []).map((d, i) => ({ id: i, datos: d })), comentarios: [] };
    historial = [];
  }

  const indice = ORDEN_ESTADOS.indexOf(q.estado);
  const siguientes = ORDEN_ESTADOS.slice(indice + 1);
  const cadenaOk = historial.every(h => h.hash_valido && h.enlace_valido);

  vista.innerHTML = `
    <p class="no-imprimir"><a class="volver" href="javascript:history.back()">${ico('volver')}Volver</a></p>
    ${desdeCache ? '<div class="alerta info">Sin conexión: datos de la última consulta guardada en el dispositivo.</div>' : ''}
    ${q.pendiente ? '<div class="alerta info">Esta queja está en la cola del dispositivo. Se registrará en el nodo cuando vuelva la conexión.</div>' : ''}
    <article class="tarjeta detalle q-${q.pendiente ? 'pendiente' : esc(q.estado)}">
      <div class="q-linea">${chipCategoria(q.categoria)}<span class="folio">folio ${q.pendiente ? 'pendiente' : folio(q.hash)}</span></div>
      <div class="queja-titulo"><h1>${esc(q.titulo)}</h1>${q.pendiente ? '<span class="estado estado-pendiente">En cola</span>' : chipEstado(q.estado)}</div>
      <dl class="ficha">
        <div><dt>Reporta</dt><dd>${esc(q.autor_nombre || '')}</dd></div>
        <div><dt>Unidad</dt><dd>${esc(q.autor_unidad || '')}</dd></div>
        <div><dt>Fecha</dt><dd>${fecha(q.fecha_creacion)}</dd></div>
        ${q.nodo_nombre ? `<div><dt>Registrada en</dt><dd>${esc(q.nodo_nombre)}</dd></div>` : ''}
      </dl>
      <p class="descripcion">${esc(q.descripcion)}</p>
      ${q.fotos?.length ? `<div class="fotos">${q.fotos.map(f => `<img src="${esc(f.datos)}" alt="Fotografía adjunta" data-ampliar>`).join('')}</div>` : ''}
      ${q.ubicacion_lat != null ? `<p class="ayuda">${ico('ubicacion')} <a target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${q.ubicacion_lat}&mlon=${q.ubicacion_lng}#map=19/${q.ubicacion_lat}/${q.ubicacion_lng}">Ver ubicación (${Number(q.ubicacion_lat).toFixed(5)}, ${Number(q.ubicacion_lng).toFixed(5)})</a></p>` : ''}
      ${q.hash ? `<p class="hash">hash: ${esc(q.hash)}</p>` : ''}
      <div class="acciones no-imprimir">
        ${u.rol === 'vecino' && !q.pendiente ? `<button class="boton" id="boton-apoyar" ${q.ya_apoyo ? 'disabled' : ''}>${ico('apoyo')}${q.ya_apoyo ? 'Ya apoyó esta queja' : 'Apoyar'} (${q.apoyos})</button>` : `<span class="meta">${ico('apoyo')}${q.apoyos} apoyos</span>`}
        ${u.rol === 'administrador' ? siguientes.map(e => `<button class="boton boton-${e}" data-estado="${e}">${e === 'resuelta' ? ico('check') : ''}${ACCION_ESTADO[e]}</button>`).join('') : ''}
      </div>
    </article>

    ${q.pendiente ? '' : `
    <section class="tarjeta">
      <div class="encabezado-vista">
        <h2>${ico('cadena')}Historial verificable</h2>
        <span class="sello ${cadenaOk ? 'ok' : 'mal'}">${cadenaOk ? 'cadena íntegra' : 'cadena con problemas'}</span>
      </div>
      <ol class="linea-tiempo">
        ${historial.map(h => `
          <li class="${h.hash_valido && h.enlace_valido ? '' : 'invalido'} paso-${esc(h.estado)}">
            <strong>${h.tipo === 'creacion' ? 'Queja registrada' : 'Estado: ' + esc(ESTADOS[h.estado])}</strong>
            <div class="meta">
              <span>${fecha(h.fecha)}</span>
              ${h.responsable_nombre ? `<span>por ${esc(h.responsable_nombre)}</span>` : ''}
              ${h.nodo_nombre ? `<span>en ${esc(h.nodo_nombre)}</span>` : ''}
              <span class="sello ${h.hash_valido ? 'ok' : 'mal'}">${h.hash_valido ? 'hash válido' : 'hash alterado'}</span>
              <span class="sello ${h.enlace_valido ? 'ok' : 'mal'}">${h.enlace_valido ? 'enlace válido' : 'eslabón faltante'}</span>
            </div>
            <div class="hash">hash ${corto(h.hash)} ← anterior ${corto(h.hash_anterior)}</div>
          </li>`).join('')}
      </ol>
    </section>

    <section class="tarjeta">
      <h2>${ico('comentario')}Comentarios y respuestas (${q.comentarios.length})</h2>
      ${q.comentarios.length ? q.comentarios.map(c => `
        <div class="comentario ${c.autor_rol === 'administrador' ? 'admin' : ''}">
          <strong>${c.autor_rol === 'administrador' ? 'Respuesta oficial de la administración' : esc(c.autor_nombre || 'Vecino')}</strong>
          <span class="meta">${c.autor_rol !== 'administrador' ? esc(c.autor_unidad || '') + ' · ' : ''}${hace(c.fecha)}</span>
          <p style="white-space:pre-wrap">${esc(c.texto)}</p>
        </div>`).join('') : '<p class="ayuda">Sin comentarios todavía.</p>'}
      ${u.rol !== 'auditor' ? `
        <form id="form-comentario" class="no-imprimir">
          <label for="texto-comentario">${u.rol === 'administrador' ? 'Responder como administración' : 'Agregar comentario'}</label>
          <textarea id="texto-comentario" required maxlength="1000" style="min-height:70px"></textarea>
          <div class="acciones"><button class="boton primario">Publicar</button></div>
        </form>` : ''}
    </section>`}`;

  vista.querySelectorAll('[data-ampliar]').forEach(img => img.addEventListener('click', () => {
    $('#visor-img').src = img.src;
    $('#visor').showModal();
  }));

  $('#boton-apoyar')?.addEventListener('click', async () => {
    const r = await escribir(`/quejas/${encodeURIComponent(id)}/apoyos`, { id: nuevoId(), fecha: new Date().toISOString() }, 'Apoyo');
    aviso(r.encolado ? 'Apoyo guardado; se enviará al recuperar la conexión.' : 'Gracias por apoyar esta queja.');
    actualizarChipRed();
    if (!r.encolado) vistaDetalle(id);
  });

  vista.querySelectorAll('[data-estado]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm(`¿${ACCION_ESTADO[b.dataset.estado]}? Este cambio queda registrado y no se puede deshacer.`)) return;
    try {
      await pedir('POST', `/quejas/${encodeURIComponent(id)}/estados`, { estado: b.dataset.estado });
      aviso('Estado actualizado y agregado al historial.');
      vistaDetalle(id);
    } catch (e) {
      aviso(e instanceof SinConexion ? 'Los cambios de estado necesitan conexión con el nodo.' : e.message, true);
    }
  }));

  $('#form-comentario')?.addEventListener('submit', async ev => {
    ev.preventDefault();
    const texto = $('#texto-comentario').value.trim();
    try {
      const r = await escribir(`/quejas/${encodeURIComponent(id)}/comentarios`, { id: nuevoId(), texto, fecha: new Date().toISOString() }, 'Comentario');
      aviso(r.encolado ? 'Comentario guardado; se enviará al recuperar la conexión.' : 'Comentario publicado.');
      actualizarChipRed();
      if (!r.encolado) vistaDetalle(id); else $('#texto-comentario').value = '';
    } catch (e) {
      aviso(e.message, true);
    }
  });
}

const horas = h => (h === null ? 'Sin datos' : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h} h` : `${Math.round(h / 24 * 10) / 10} d`);

async function vistaReportes() {
  const r = await pedir('GET', '/reportes/agregado');
  const tr = r.tiempo_primera_respuesta_horas;
  const total = r.total_quejas;
  const resueltas = r.por_estado.resuelta;
  const pendientes = total - resueltas;
  vista.innerHTML = `
    <div class="encabezado-vista">
      <div><span class="antetitulo">Seguimiento de la comunidad</span><h1>Gestión de solicitudes</h1>
        <p class="subtitulo-vista">Estado de las quejas, asuntos más frecuentes y tiempos de atención.</p></div>
      <button class="boton no-imprimir" id="imprimir">${ico('imprimir')}Imprimir reporte</button>
    </div>
    <p class="reporte-fecha">Actualizado ${fecha(r.generado)} · Todos los registros disponibles</p>
    <div class="kpis kpis-gestion">
      <div class="kpi"><small>Solicitudes registradas</small><strong>${total}</strong><span>Acumulado del conjunto</span></div>
      <div class="kpi"><small>Pendientes de resolver</small><strong>${pendientes}</strong><span>Nuevas, vistas y en proceso</span></div>
      <div class="kpi bien"><small>Resueltas</small><strong>${resueltas}</strong><span>${total ? porcentaje(resueltas, total) + ' % del total' : 'Aún no hay solicitudes'}</span></div>
      <div class="kpi ${tr.sin_respuesta_mas_de_72h ? 'mal' : ''}"><small>Sin gestión inicial &gt; 72 h</small><strong>${tr.sin_respuesta_mas_de_72h}</strong><span>Sin un primer cambio de estado</span></div>
    </div>
    <div class="graficos-gestion">
      <section class="tarjeta grafico-tarjeta">
        <div class="grafico-cabecera"><span class="antetitulo">Seguimiento</span><h2>Estado de las solicitudes</h2>
        <p class="ayuda">Distribución actual de todas las quejas registradas.</p></div>
        ${graficoEstados(r.por_estado)}
      </section>
      <section class="tarjeta grafico-tarjeta">
        <div class="grafico-cabecera"><span class="antetitulo">Convivencia y mantenimiento</span><h2>Asuntos más reportados</h2>
        <p class="ayuda">Categorías ordenadas por número de solicitudes.</p></div>
        ${graficoCategorias(r.por_categoria)}
      </section>
    </div>
    <section class="tarjeta">
      <h2>Tiempos de atención</h2>
      <p class="ayuda">La primera gestión corresponde al primer cambio de estado registrado por la administración. Los comentarios no se cuentan como cambios de estado.</p>
      <dl class="tiempos-gestion">
        <div><dt>Primera gestión · promedio</dt><dd>${horas(tr.promedio)}</dd><small>${tr.quejas_con_respuesta} solicitudes con gestión registrada</small></div>
        <div><dt>Primera gestión · mediana</dt><dd>${horas(tr.mediana)}</dd><small>Valor central de los tiempos registrados</small></div>
        <div><dt>Resolución · promedio</dt><dd>${horas(r.tiempo_resolucion_horas.promedio)}</dd><small>${r.tiempo_resolucion_horas.quejas_resueltas} solicitudes resueltas</small></div>
      </dl>
    </section>
    <section class="tarjeta">
      <h2>Solicitudes con mayor apoyo</h2>
      <p class="ayuda">Hasta cinco asuntos que más vecinos han respaldado.</p>
      ${r.mas_apoyadas.length ? `<div class="desplazable"><table class="tabla"><thead><tr><th scope="col">Solicitud</th><th scope="col">Categoría</th><th scope="col">Estado</th><th scope="col">Apoyos</th></tr></thead><tbody>
        ${r.mas_apoyadas.map(q => `<tr><td><a href="#/queja/${encodeURIComponent(q.id)}">${esc(q.titulo)}</a></td><td>${esc(CATEGORIAS[q.categoria])}</td><td>${chipEstado(q.estado)}</td><td>${q.apoyos}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="vacio">Todavía no se han registrado apoyos.</p>'}
    </section>`;
  $('#imprimir').addEventListener('click', () => window.print());
}

const TIPOS_PROBLEMA = {
  hash_alterado: 'Hash alterado', eslabon_faltante: 'Eslabón faltante', bifurcacion: 'Bifurcación', referencia_huerfana: 'Referencia huérfana',
  version_distinta: 'Versión distinta entre nodos', hash_invalido: 'Registro remoto inválido', registro_restaurado: 'Registro restaurado', rechazado: 'Registro rechazado'
};

async function vistaIntegridad() {
  const r = await pedir('GET', '/integridad');
  const todoBien = r.integro && r.conflictos.length === 0;
  vista.innerHTML = `
    <span class="antetitulo">Auditoría de la cadena</span>
    <h1>Verificación de integridad</h1>
    <div class="tarjeta estado-red">
      <div class="sello-grande ${todoBien ? 'ok' : 'mal'}">${todoBien ? 'Íntegra' : 'Revisar'}</div>
      <div>
        <h2>${todoBien ? 'La cadena de registros está íntegra' : 'Se detectaron posibles manipulaciones'}</h2>
        <p class="ayuda">${r.registros_verificables} de ${r.total_registros} registros verificables (${r.porcentaje_verificable}%). Revisado ${fecha(r.fecha)}.</p>
        <button class="boton pequeno" id="reverificar">Verificar de nuevo</button>
      </div>
    </div>
    <div class="tarjeta">
      <h2>Cadenas por nodo emisor</h2>
      <p class="ayuda">Cada nodo encadena sus propios registros: cada uno guarda el hash del anterior. Si alguien borra, edita o intercala un registro, la cadena se rompe.</p>
      <div class="desplazable"><table class="tabla"><tr><th>Tabla</th><th>Nodo emisor</th><th>Eslabones</th><th>Estado</th></tr>
        ${r.cadenas.map(c => `<tr><td>${c.tabla === 'queja' ? 'Quejas' : 'Historial de estados'}</td><td>${esc(c.nodo_nombre)}</td><td>${c.longitud}</td>
          <td><span class="sello ${c.integra ? 'ok' : 'mal'}">${c.integra ? 'íntegra' : 'rota'}</span></td></tr>`).join('') || '<tr><td colspan="4">Sin registros.</td></tr>'}
      </table></div>
    </div>
    <div class="tarjeta">
      <h2>Problemas en este nodo (${r.problemas.length})</h2>
      ${r.problemas.length ? `<div class="desplazable"><table class="tabla"><tr><th>Tipo</th><th>Registro</th><th>Detalle</th></tr>
        ${r.problemas.map(p => `<tr><td><span class="sello mal">${esc(TIPOS_PROBLEMA[p.tipo] || p.tipo)}</span></td>
          <td>${esc(p.tabla)}<br><span class="hash">${esc(p.registro_id)}</span></td><td>${esc(p.detalle)}</td></tr>`).join('')}</table></div>`
        : '<p class="ayuda">Ningún registro local fue alterado.</p>'}
    </div>
    <div class="tarjeta">
      <h2>Conflictos detectados al sincronizar (${r.conflictos.length})</h2>
      <p class="ayuda">Cuando otro nodo tiene una versión distinta de un registro, ninguno de los dos la sobrescribe: se conserva como evidencia.</p>
      ${r.conflictos.length ? `<div class="desplazable"><table class="tabla"><tr><th>Fecha</th><th>Tipo</th><th>Registro</th><th>Con nodo</th><th>Detalle</th></tr>
        ${r.conflictos.map(c => `<tr><td>${fecha(c.fecha)}</td><td><span class="sello mal">${esc(TIPOS_PROBLEMA[c.tipo] || c.tipo)}</span></td>
          <td>${esc(c.tabla)}<br><span class="hash">${esc(c.registro_id)}</span></td><td>${esc(c.nodo_remoto_nombre || c.nodo_remoto || '—')}</td><td>${esc(c.detalle)}</td></tr>`).join('')}</table></div>`
        : '<p class="ayuda">No hay conflictos registrados.</p>'}
    </div>`;
  $('#reverificar').addEventListener('click', () => vistaIntegridad());
}

async function vistaNodos() {
  const esAdmin = sesion.usuario.rol === 'administrador';
  const [r, estado] = await Promise.all([pedir('GET', '/nodos'), pedir('GET', '/estado')]);
  const peers = r.nodos.filter(n => n.es_peer);
  const acceso = estado.acceso_movil || { url: null };

  vista.innerHTML = `
    <span class="antetitulo">Acceso y disponibilidad</span>
    <h1>Conexión de la comunidad</h1>
    <section class="tarjeta acceso-movil">
      <h2>${ico('casa')}Abrir en el celular</h2>
      ${acceso.url ? `<div class="qr">
        <img id="qr-movil" src="/qr.png?v=${encodeURIComponent(acceso.url)}" alt="Código QR con el enlace de acceso al conjunto" width="208" height="208">
        <div>
          <h3>Escanea para ingresar</h3>
          <p>Conecta el celular al mismo Wi-Fi del computador y escanea el código con la cámara.</p>
          <label for="enlace-movil">Dirección de acceso</label>
          <input id="enlace-movil" type="text" value="${esc(acceso.url)}" readonly>
          <div class="acciones"><a class="boton" href="${esc(acceso.url)}" target="_blank" rel="noopener">Abrir enlace</a></div>
          <p class="ayuda">El computador y Docker deben permanecer encendidos. Si no abre, prueba primero esta dirección en el navegador del celular.</p>
        </div>
      </div><p id="error-qr" class="alerta info" hidden>No se pudo cargar el código QR. Puedes utilizar la dirección de acceso o recargar la página.</p>` : `
        <div class="qr-pendiente">${ico('nodos')}<div><h3>Falta configurar la dirección de acceso</h3>
        <p>La dirección actual solo funciona dentro del computador. Configura su dirección de red para que el celular pueda abrir la aplicación.</p></div></div>`}
      <details class="configuracion-red">
        <summary>Configurar el acceso desde el celular</summary>
        <ol>
          <li>En el computador que ejecuta Docker, abre PowerShell y ejecuta <code>ipconfig</code>.</li>
          <li>Busca la dirección IPv4 del adaptador Wi-Fi o Ethernet conectado a tu red. No uses la dirección de Docker, WSL ni una conexión VPN.</li>
          <li>En el archivo <code>.env</code> del proyecto, cambia <code>HOST_IP</code> por esa IPv4, sin agregar el puerto.</li>
          <li>Guarda y ejecuta <code>docker compose up -d --build</code>. Luego recarga esta página.</li>
        </ol>
        <p class="ayuda">Si el enlace no abre en el celular, comprueba que ambos equipos estén en la misma red y que el firewall permita el puerto del servicio. Una red de invitados puede bloquear la conexión entre dispositivos.</p>
      </details>
    </section>
    <details class="tarjeta configuracion-red detalles-nodos">
      <summary>Estado de conexión entre equipos</summary>
      <p class="ayuda">Información para la administración y el consejo. La sincronización automática se realiza cada ${r.intervalo_segundos} segundos.</p>
      <div class="desplazable"><table class="tabla"><thead><tr><th scope="col">Equipo</th><th scope="col">Última sincronización</th><th scope="col">Estado</th></tr></thead><tbody>
        ${peers.map(n => `<tr><td>${esc(n.nombre)}</td><td>${n.ultima_sync ? hace(n.ultima_sync) : 'Sin sincronizar'}</td>
          <td>${n.circuito?.estado === 'abierto' ? '<span class="sello mal">Reconectando</span>' : n.ultimo_error ? '<span class="sello mal">Sin conexión</span>' : n.ultima_sync ? '<span class="sello ok">Conectado</span>' : '<span class="sello">Pendiente</span>'}</td></tr>`).join('') || '<tr><td colspan="3">No hay otros equipos configurados.</td></tr>'}
      </tbody></table></div>
      ${esAdmin ? `<div class="acciones"><button class="boton" id="sync-todos">${ico('sync')}Sincronizar ahora</button></div>` : ''}
      <div id="resultado-sync" role="status" aria-live="polite"></div>
    </details>`;

  $('#enlace-movil')?.addEventListener('focus', ev => ev.target.select());
  const imagenQR = $('#qr-movil');
  if (imagenQR) {
    const mostrarError = () => { imagenQR.hidden = true; $('#error-qr').hidden = false; };
    imagenQR.addEventListener('error', mostrarError);
    if (imagenQR.complete && !imagenQR.naturalWidth) mostrarError();
  }
  $('#sync-todos')?.addEventListener('click', async ev => {
    const boton = ev.currentTarget;
    boton.disabled = true;
    try {
      const res = await pedir('POST', '/nodos/sincronizar-ahora');
      const fallidos = res.filter(x => !x.ok).length;
      const conflictos = res.reduce((n, x) => n + (x.conflictos?.length || 0), 0);
      $('#resultado-sync').innerHTML = `<p class="alerta ${fallidos || conflictos ? 'info' : 'ok'}">${!res.length ? 'No hubo sincronizaciones nuevas. Puedes consultar el estado en la tabla.' : fallidos ? 'Algunos equipos no respondieron. Se volverá a intentar automáticamente.' : conflictos ? 'La sincronización detectó diferencias. Consulta la sección Integridad.' : 'Sincronización completada.'}</p>`;
    } catch (e) {
      $('#resultado-sync').textContent = e.message;
    } finally { boton.disabled = false; }
  });
}

async function vistaUsuarios() {
  const lista = await pedir('GET', '/usuarios');
  vista.innerHTML = `
    <span class="antetitulo">Administración</span>
    <h1>Usuarios</h1>
    <form class="tarjeta" id="form-usuario">
      <h2>Registrar usuario</h2>
      <label for="u-nombre">Nombre completo</label><input id="u-nombre" required>
      <label for="u-correo">Correo</label><input id="u-correo" type="email" required>
      <label for="u-unidad">Unidad residencial</label><input id="u-unidad" required placeholder="Torre 4 - Apto 1201">
      <label for="u-rol">Rol</label>
      <select id="u-rol">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <label for="u-pass">Contraseña inicial</label><input id="u-pass" type="password" minlength="6" required>
      <div class="error-form" id="error-usuario"></div>
      <div class="acciones"><button class="boton primario">Crear usuario</button></div>
      <p class="ayuda">La cuenta tendrá acceso a las funciones del rol seleccionado.</p>
    </form>
    <div class="tarjeta desplazable">
      <table class="tabla"><tr><th>Nombre</th><th>Correo</th><th>Unidad</th><th>Rol</th></tr>
        ${lista.map(u => `<tr><td>${esc(u.nombre)}</td><td>${esc(u.correo)}</td><td>${esc(u.unidad_residencial)}</td><td>${esc(ROLES[u.rol])}</td></tr>`).join('')}
      </table>
    </div>`;

  $('#form-usuario').addEventListener('submit', async ev => {
    ev.preventDefault();
    try {
      await pedir('POST', '/usuarios', {
        nombre: $('#u-nombre').value, correo: $('#u-correo').value, unidad_residencial: $('#u-unidad').value,
        rol: $('#u-rol').value, password: $('#u-pass').value
      });
      aviso('Usuario creado.');
      vistaUsuarios();
    } catch (e) {
      $('#error-usuario').textContent = e.message;
    }
  });
}

async function sincronizar(silencioso = false) {
  const boton = $('#boton-sync');
  boton.classList.add('girando');
  try {
    const { enviados, fallidos } = await vaciarCola();
    if (sesion.usuario?.rol !== 'auditor' && navigator.onLine) {
      await pedir('POST', '/nodos/sincronizar-ahora').catch(() => {});
    }
    if (enviados && !silencioso) aviso(`${enviados} operación(es) guardadas sin conexión se enviaron al nodo.`);
    else if (enviados) aviso(`Se enviaron ${enviados} operación(es) que estaban en cola.`);
    for (const f of fallidos) aviso(`No se pudo enviar "${f.descripcion}": ${f.error}`, true);
    if (!silencioso || enviados) navegar();
  } finally {
    boton.classList.remove('girando');
    actualizarChipRed();
  }
}

function cerrarSesion(borrarDatos = true) {
  sesion.cerrar();
  if (borrarDatos) borrarTodo();
  location.hash = '#/login';
  navegar();
}

alSesionVencida.fn = () => {
  aviso('La sesión venció, ingrese de nuevo. Lo que estaba en cola se conserva.', true);
  cerrarSesion(false);
};

document.querySelector('.saltar-contenido').addEventListener('click', ev => {
  ev.preventDefault();
  vista.focus();
  vista.scrollIntoView({ block: 'start' });
});

$('#boton-sync').addEventListener('click', () => sincronizar(false));
$('#boton-salir').addEventListener('click', async () => {
  const n = (await pendientes()).length;
  const pregunta = n
    ? `Hay ${n} operación(es) sin enviar al nodo. Si cierra sesión se descartan. ¿Cerrar de todas formas?`
    : '¿Cerrar sesión en este dispositivo?';
  if (confirm(pregunta)) cerrarSesion();
});
window.addEventListener('hashchange', navegar);
window.addEventListener('online', () => { actualizarChipRed(); sincronizar(true); });
window.addEventListener('offline', actualizarChipRed);
setInterval(async () => { if (navigator.onLine && (await pendientes()).length) sincronizar(true); }, 20000);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(e => console.warn('Service worker no registrado:', e.message));
}

actualizarChipRed();
navegar();
