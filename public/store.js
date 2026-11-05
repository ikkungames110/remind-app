// リマインドの内容はこの端末の IndexedDB にだけ保存する（サーバーは通知時刻だけを持つ）
const openStore = () =>
  new Promise((ok, ng) => {
    const q = indexedDB.open('remind', 1);
    q.onupgradeneeded = () => q.result.createObjectStore('texts');
    q.onsuccess = () => ok(q.result);
    q.onerror = () => ng(q.error);
  });
const withStore = async (mode, fn) => {
  const db = await openStore();
  return new Promise((ok, ng) => {
    const t = db.transaction('texts', mode);
    const q = fn(t.objectStore('texts'));
    t.oncomplete = () => {
      db.close();
      ok(q.result);
    };
    t.onerror = () => ng(t.error);
  });
};
const textGet = (id) => withStore('readonly', (s) => s.get(id));
const textPut = (id, text) => withStore('readwrite', (s) => s.put(text, id));
const textDel = (id) => withStore('readwrite', (s) => s.delete(id));

// 端末ごとの合言葉。これを持つ端末だけが自分の予約を読み書きできる
const TOKEN_KEY = 'remind-token';
const savedToken = () => localStorage.getItem(TOKEN_KEY);
const saveToken = (t) => localStorage.setItem(TOKEN_KEY, t);
const ownerToken = () => {
  if (!savedToken()) saveToken(crypto.randomUUID());
  return savedToken();
};
const api = (path, opts = {}) =>
  fetch(`/api/${path}`, { ...opts, headers: { Authorization: `Bearer ${ownerToken()}` } });
