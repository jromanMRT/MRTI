const CORE_DESTINATIONS = [
  {
    id: 'home',
    type: 'Acceso directo',
    title: 'Inicio',
    detail: 'Volver a tu dashboard personal',
    action: 'home',
    keywords: ['dashboard', 'principal', 'inicio'],
  },
  {
    id: 'new-ticket',
    type: 'Acceso directo',
    title: 'Crear ticket de soporte',
    detail: 'Reportar un problema o solicitar ayuda',
    action: 'newTicket',
    keywords: ['soporte', 'ayuda', 'incidencia', 'mesa de servicio'],
  },
  {
    id: 'my-tickets',
    type: 'Acceso directo',
    title: 'Mis tickets',
    detail: 'Consultar tus solicitudes de soporte',
    action: 'openTickets',
    keywords: ['soporte', 'ayuda', 'incidencia', 'solicitudes'],
  },
  {
    id: 'account',
    type: 'Acceso directo',
    title: 'Mi perfil',
    detail: 'Consultar y actualizar tu cuenta',
    action: 'openAccount',
    keywords: ['cuenta', 'usuario', 'perfil personal', 'configuración'],
  },
  {
    id: 'news',
    type: 'Acceso directo',
    title: 'Noticias de la empresa',
    detail: 'Ver comunicados y novedades',
    action: 'openNews',
    keywords: ['comunicados', 'novedades', 'anuncios'],
  },
  {
    id: 'brand-resources',
    type: 'Acceso directo',
    title: 'Recursos de marca',
    detail: 'Consultar logotipos y materiales corporativos',
    action: 'openBrand',
    keywords: ['marca', 'logotipo', 'identidad corporativa', 'recursos'],
  },
];

export function normalizeNavigationText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
    .trim();
}

export function buildNavigationDestinations(profile, applications = []) {
  const isAdministrator = profile?.role === 'administrator';
  const destinations = [...CORE_DESTINATIONS];

  if (isAdministrator) {
    destinations.push({
      id: 'control-center',
      type: 'Acceso directo',
      title: 'Centro de control',
      detail: 'Administrar usuarios, permisos y aplicaciones',
      action: 'openControlCenter',
      keywords: ['administración', 'administrar', 'usuarios', 'permisos'],
    });
  }

  for (const application of applications) {
    if (!application?.code || (!isAdministrator && !profile?.allowed_modules?.includes(application.code))) continue;
    const href = application.href || application.url;
    if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//') || href.includes('\\') || /[\r\n]/.test(href)) continue;
    const features = Array.isArray(application.features) ? application.features : [];
    destinations.push({
      id: `module-${application.code}`,
      type: 'Módulo',
      title: application.title || application.name || application.code,
      detail: [application.category, application.description, ...features].filter(Boolean).join(' · '),
      href,
      keywords: [application.code, application.category, application.description, ...features],
    });
  }

  return destinations;
}

export function searchNavigationDestinations(destinations, query, limit = 8) {
  const normalizedQuery = normalizeNavigationText(query);
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  if (!terms.length) return destinations.slice(0, limit);

  return destinations
    .map((destination) => {
      const title = normalizeNavigationText(destination.title);
      const searchable = normalizeNavigationText([
        destination.title,
        destination.detail,
        ...(destination.keywords || []),
      ].join(' '));
      if (!terms.every((term) => searchable.includes(term))) return null;
      const score = terms.reduce((total, term) => (
        total + (title === term ? 30 : title.startsWith(term) ? 20 : title.includes(term) ? 10 : 0)
      ), 0);
      return { destination, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.destination.title.localeCompare(b.destination.title, 'es-MX'))
    .slice(0, limit)
    .map(({ destination }) => destination);
}
