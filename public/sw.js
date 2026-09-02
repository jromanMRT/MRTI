const CACHE_NAME = 'mrti-shell-v1';
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/offline.html',
  '/offline.css',
  '/company-logo.svg',
  '/favicon.svg',
  '/fonts/ibm-plex-sans-400.woff2',
  '/fonts/ibm-plex-sans-500.woff2',
  '/fonts/ibm-plex-sans-600.woff2',
  '/fonts/big-shoulders-display-800.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.includes('-api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
    return;
  }

  if (!['script', 'style', 'font', 'image', 'manifest'].includes(request.destination)) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
    return response;
  })));
});

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = {}; }
  const showPreview = payload.publicPreview === true;
  event.waitUntil(self.registration.showNotification(showPreview ? payload.title || 'MRTI' : 'MRTI', {
    body: showPreview ? payload.body || 'Tienes una nueva notificación.' : 'Tienes una nueva notificación. Abre MRTI para consultar los detalles.',
    icon: '/company-logo.svg',
    badge: '/company-logo.svg',
    tag: payload.tag || 'mrti-notification',
    data: { url: payload.url || '/?view=notifications' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/?view=notifications', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(target);
      return existing.focus();
    }
    return self.clients.openWindow(target);
  }));
});
