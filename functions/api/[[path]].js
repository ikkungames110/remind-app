import { nextAfter } from '../../shared/schedule.js';

const json = (v, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });

const HM = /^\d{2}:\d{2}$/;

function parse(b) {
  const text = String(b.text || '').trim().slice(0, 200);
  if (!text) return null;
  const r = parseWhen(b);
  return r && { text, ...r };
}

function parseWhen(b) {
  if (!b.repeat) {
    const at = b.after ? Date.now() + Number(b.after) * 60e3 : Number(b.at);
    return at > 0 ? { repeat: false, at } : null;
  }
  const days = [...new Set((b.days || []).map(Number))].filter((d) => d >= 0 && d <= 6);
  if (!days.length) return null;
  if (b.mode === 'interval') {
    const every = Number(b.every);
    if (!(every >= 1 && every <= 24) || !HM.test(b.start) || !HM.test(b.end) || b.end < b.start) return null;
    return { repeat: true, days, mode: 'interval', every, start: b.start, end: b.end };
  }
  return HM.test(b.time) ? { repeat: true, days, mode: 'time', time: b.time } : null;
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

  // タスク完了: 単発は削除、繰り返しは due を下ろして次回まで待つ
  const done = path.match(/^reminders\/([^/]+)\/done$/);
  if (done && request.method === 'POST') {
    await db.prepare('DELETE FROM reminders WHERE id = ? AND next IS NULL').bind(done[1]).run();
    await db.prepare("UPDATE reminders SET data = json_remove(data, '$.due') WHERE id = ?").bind(done[1]).run();
    return json({ ok: true });
  }

  if (path.startsWith('reminders/') && request.method === 'DELETE') {
    await db.prepare('DELETE FROM reminders WHERE id = ?').bind(path.slice(10)).run();
    return json({ ok: true });
  }

  if (path === 'transcribe' && request.method === 'POST') {
    const buf = new Uint8Array(await request.arrayBuffer());
    if (!buf.length || buf.length > 5e6) return json({ error: 'invalid' }, 400);
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    const out = await env.AI.run('@cf/openai/whisper-large-v3-turbo', { audio: btoa(bin), language: 'ja' });
    // 無音のときに Whisper が出しがちな定型文は捨てる
    const text = (out.text || '').trim();
    return json({ text: /^(ご視聴ありがとうございました|ありがとうございました)[。!！]*$/.test(text) ? '' : text });
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
