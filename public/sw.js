self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  const { title, badge } = e.data ? e.data.json() : { title: 'リマインド' };
  const tasks = [self.registration.showNotification(title, { icon: '/icon-192.png', tag: String(Date.now()) })];
  if (typeof badge === 'number' && self.navigator.setAppBadge) {
    tasks.push((badge ? self.navigator.setAppBadge(badge) : self.navigator.clearAppBadge()).catch(() => {}));
  }
  e.waitUntil(Promise.all(tasks));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow('/'))),
  );
});
