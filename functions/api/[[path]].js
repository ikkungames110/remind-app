import { nextAfter } from '../../shared/schedule.js';

const json = (v, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });

const HM = /^\d{2}:\d{2}$/;

function parse(b) {
  const text = String(b.text || '').trim().slice(0, 200);
  if (!text) return null;
  if (!b.repeat) {
    const at = Number(b.at);
    return at > 0 ? { text, repeat: false, at } : null;
  }
  const days = [...new Set((b.days || []).map(Number))].filter((d) => d >= 0 && d <= 6);
  if (!days.length) return null;
  if (b.mode === 'interval') {
    const every = Number(b.every);
    if (!(every >= 1 && every <= 24) || !HM.test(b.start) || !HM.test(b.end) || b.end < b.start) return null;
    return { text, repeat: true, days, mode: 'interval', every, start: b.start, end: b.end };
  }
  return HM.test(b.time) ? { text, repeat: true, days, mode: 'time', time: b.time } : null;
}

export async function onRequest({ request, env, params }) {
  const path = (params.path || []).join('/');
  const db = env.DB;

  if (path === 'reminders' && request.method === 'GET') {
    const { results } = await db.prepare('SELECT id, data, next FROM reminders ORDER BY next').all();
    return json(results.map((r) => ({ id: r.id, next: r.next, ...JSON.parse(r.data) })));
  }

  if (path === 'reminders' && request.method === 'POST') {
    const r = parse(await request.json());
    if (!r) return json({ error: 'invalid' }, 400);
    const next = nextAfter(r, Date.now());
    if (next === null) return json({ error: 'past' }, 400);
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO reminders (id, data, next) VALUES (?, ?, ?)').bind(id, JSON.stringify(r), next).run();
    return json({ id, next, ...r });
  }

  if (path.startsWith('reminders/') && request.method === 'DELETE') {
    await db.prepare('DELETE FROM reminders WHERE id = ?').bind(path.slice(10)).run();
    return json({ ok: true });
  }

  if (path === 'subscribe' && request.method === 'POST') {
    const s = await request.json();
    if (!s.endpoint || !s.keys?.p256dh || !s.keys?.auth) return json({ error: 'invalid' }, 400);
    await db
      .prepare('INSERT OR REPLACE INTO subs (endpoint, p256dh, auth) VALUES (?, ?, ?)')
      .bind(s.endpoint, s.keys.p256dh, s.keys.auth)
      .run();
    return json({ ok: true });
  }

  return json({ error: 'not found' }, 404);
}
