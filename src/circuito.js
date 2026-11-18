// Interruptor por peer: si un nodo falla varias veces seguidas se deja de intentar con él
// durante un tiempo que va creciendo, para no gastar cada ciclo esperando a un nodo caído.
export function crearCircuito({ fallosParaAbrir = 3, esperaBaseMs = 60000, esperaMaxMs = 600000 } = {}) {
  const estados = new Map();

  function puedeIntentar(url) {
    const e = estados.get(url);
    return !e || !e.abiertoHasta || Date.now() >= e.abiertoHasta;
  }

  function exito(url) {
    estados.delete(url);
  }

  function fallo(url) {
    const e = estados.get(url) || { fallos: 0, abiertoHasta: null };
    e.fallos++;
    if (e.fallos >= fallosParaAbrir) {
      const espera = Math.min(esperaBaseMs * 2 ** (e.fallos - fallosParaAbrir), esperaMaxMs);
      e.abiertoHasta = Date.now() + espera;
    }
    estados.set(url, e);
  }

  function consultar(url) {
    const e = estados.get(url);
    if (!e) return { estado: 'cerrado', fallos: 0 };
    if (e.abiertoHasta && Date.now() < e.abiertoHasta) {
      return { estado: 'abierto', fallos: e.fallos, reintento_en_s: Math.ceil((e.abiertoHasta - Date.now()) / 1000) };
    }
    return { estado: e.abiertoHasta ? 'semiabierto' : 'cerrado', fallos: e.fallos };
  }

  return { puedeIntentar, exito, fallo, consultar };
}
