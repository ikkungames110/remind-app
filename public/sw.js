importScripts('/store.js');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  const { id, title, badge } = e.data ? e.data.json() : {};
  e.waitUntil(
    (async () => {
      // サーバーは id だけ送ってくるので、通知の文面は端末内の保存データから取る
      const local = id ? await textGet(id).catch(() => null) : null;
      const tasks = [
        self.registration.showNotification(local || title || 'リマインド', { icon: '/icon-192.png', tag: String(Date.now()) }),
      ];
      if (typeof badge === 'number' && self.navigator.setAppBadge) {
        tasks.push((badge ? self.navigator.setAppBadge(badge) : self.navigator.clearAppBadge()).catch(() => {}));
      }
      await Promise.all(tasks);
    })(),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow('/'))),
  );
});
