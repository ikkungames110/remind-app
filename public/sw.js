self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  const { title } = e.data ? e.data.json() : { title: 'リマインド' };
  e.waitUntil(self.registration.showNotification(title, { icon: '/icon-192.png', tag: String(Date.now()) }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow('/'))),
  );
});
