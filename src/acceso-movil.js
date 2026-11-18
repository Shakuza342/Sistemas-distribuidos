// Usar la dirección del equipo anfitrión configurada por el administrador.
// Las interfaces detectadas dentro de Docker pertenecen al contenedor.
export function accesoMovil(urlPublica) {
  const pendiente = { url: null, mensaje: 'Configura HOST_IP con la IPv4 del computador en la red local y vuelve a iniciar Docker.' };
  try {
    const url = new URL(urlPublica);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    const interno = host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0'
      || host === '[::]' || host === '[::1]' || host.startsWith('127.')
      || host.endsWith('.internal') || (!host.includes('.') && !host.includes(':'));
    if (!['http:', 'https:'].includes(url.protocol) || interno || url.username || url.password) return pendiente;
    // Esta aplicación se sirve en la raíz; nunca compartir tokens o rutas de sesión.
    if (url.pathname !== '/' || url.search || url.hash) return pendiente;
    return { url: url.origin + '/', mensaje: null };
  } catch { return pendiente; }
}
