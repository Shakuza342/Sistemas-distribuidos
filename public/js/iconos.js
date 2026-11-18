const TRAZOS = {
  tablero: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  nueva: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  mias: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  reportes: '<path d="M3 20h18M6 20v-7M11 20V5M16 20v-10M21 20v-4"/>',
  integridad: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  nodos: '<circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="5" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M7.3 10.9l9.4-4.8M7.3 13.1l9.4 4.8M19 7.5v9"/>',
  usuarios: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5M16 4.5a3.5 3.5 0 010 7M18 14.8c2 .7 3.2 2.5 3.7 5.2"/>',
  sync: '<path d="M20 11a8 8 0 00-14.3-4.9L4 8M4 3v5h5M4 13a8 8 0 0014.3 4.9L20 16M20 21v-5h-5"/>',
  salir: '<path d="M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4M10 16l-4-4 4-4M6 12h10"/>',
  aseo: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  ascensores: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9.5 9.5L12 7l2.5 2.5M9.5 14.5L12 17l2.5-2.5"/>',
  agua: '<path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/>',
  luz: '<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0012 3z"/>',
  seguridad: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><rect x="9.5" y="10.5" width="5" height="4.5" rx="1"/><path d="M10.5 10.5V9a1.5 1.5 0 013 0v1.5"/>',
  ruido: '<path d="M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/>',
  mascotas: '<circle cx="6.5" cy="10" r="1.8"/><circle cx="10" cy="6" r="1.8"/><circle cx="14.5" cy="6" r="1.8"/><circle cx="18" cy="10" r="1.8"/><path d="M12 12c-3 0-5.5 3.2-5.5 5.5 0 2 2 2.5 3 2.2 1-.3 1.6-.7 2.5-.7s1.5.4 2.5.7c1 .3 3-.2 3-2.2 0-2.3-2.5-5.5-5.5-5.5z"/>',
  parqueo: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9.5 17V7h3.5a3 3 0 010 6H9.5"/>',
  otro: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="12" r=".8"/><circle cx="12" cy="12" r=".8"/><circle cx="16" cy="12" r=".8"/>',
  apoyo: '<path d="M7 10v10H4V10zM7 10l4-7c1.5 0 2.5 1.2 2.2 2.7L12.5 9H19a2 2 0 012 2.3l-1.2 7A2 2 0 0117.8 20H7"/>',
  comentario: '<path d="M4 5h16v11H9l-5 4z"/>',
  foto: '<rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2.5h5L16 6"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  ubicacion: '<path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  casa: '<path d="M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-5h4v5"/>',
  imprimir: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/>',
  descargar: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  subir: '<path d="M12 15V3M7 8l5-5 5 5M4 21h16"/>',
  cadena: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  volver: '<path d="M15 5l-7 7 7 7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  alerta: '<path d="M12 3l9.5 17h-19zM12 10v4.5M12 17.5v.5"/>',
  servidor: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  nodo: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'
};

export function ico(nombre, clase = '') {
  const trazo = TRAZOS[nombre] || TRAZOS.otro;
  return `<svg class="ico ${clase}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${trazo}</svg>`;
}
