// BumbleB Kidz PWA service worker — app-shell cache for installability + offline shell.
const CACHE = 'bumbleb-v1';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/manifest.webmanifest', '/icon.svg'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api')) return; // never cache API
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request).then(r => r || caches.match('/'))));
});

// ── Web push (parent PWA): absence alerts, fee reminders, announcements ──
self.addEventListener('push', (e) => {
  let d = { title: 'BumbleB Kidz', body: '', url: '/parent', tag: 'bumbleb' };
  try { d = { ...d, ...(e.data ? e.data.json() : {}) }; } catch { if (e.data) d.body = e.data.text(); }
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag,
    data: { url: d.url },
  }));
});

// Focus an open parent tab if there is one, otherwise open the portal.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/parent';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.includes('/parent') && 'focus' in c) return c.focus();
    return clients.openWindow(url);
  }));
});
