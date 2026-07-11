/* sw.js — Çalışma Odası service worker
   Push bildirimlerini alır ve gösterir. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch (_) { d = { title: 'Çalışma Odası 💜', body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'Çalışma Odası 💜';
  const opts = {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag || undefined,
    data: { url: d.url || '/' }
  };
  e.waitUntil((async () => {
    // sayfa zaten önde ve odaktaysa toast gösteriyor; bildirimi atla
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (cs.some(c => c.focused)) return;
    await self.registration.showNotification(title, opts);
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (cs.length) { cs[0].focus(); }
    else { self.clients.openWindow((e.notification.data && e.notification.data.url) || '/'); }
  })());
});
