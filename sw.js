/* sw.js — Çalışma Odası service worker
   1) Push bildirimlerini alır ve gösterir
   2) Uygulama kabuğunu önbelleğe alır → internet yokken de açılır */

const CACHE = 'co-shell-v2';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    try {
      const c = await caches.open(CACHE);
      await c.addAll(SHELL);
    } catch (_) { /* biri eksikse kurulum yine de sürsün */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // Firebase/CDN/fonksiyonlar → dokunma
  if (url.pathname.startsWith('/api/')) return;         // push fonksiyonu → dokunma
  if (url.pathname.startsWith('/videos/')) return;      // videolar büyük → önbelleğe alma

  // sayfa gezinmeleri: önce ağ, olmazsa önbellekten kabuk
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(CACHE);
        c.put('/index.html', fresh.clone());
        return fresh;
      } catch (_) {
        const c = await caches.open(CACHE);
        return (await c.match('/index.html')) || (await c.match('/')) || Response.error();
      }
    })());
    return;
  }

  // ikon/manifest gibi statikler: önce önbellek, arkada tazele
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req);
    const net = fetch(req).then(r => { if (r && r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});

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
