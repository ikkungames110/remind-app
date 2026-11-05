import { nextAfter } from '../../shared/schedule.js';

const json = (v, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });

const HM = /^\d{2}:\d{2}$/;

// text はクイック登録のときだけ届く。アプリが次に開かれた時点で端末へ移して消す
function parse(b) {
  const text = String(b.text || '').trim().slice(0, 200);
  const r = parseWhen(b);
  return r && (text ? { text, ...r } : r);
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

  // ここから先は端末ごとの合言葉が必要で、自分の予約にしか触れない
  const owner = request.headers.get('authorization')?.match(/^Bearer ([\w-]{20,100})$/)?.[1];
  if (!owner) return json({ error: 'unauthorized' }, 401);

  if (path === 'reminders' && request.method === 'GET') {
    const { results } = await db.prepare('SELECT id, data, next FROM reminders WHERE owner = ? ORDER BY next').bind(owner).all();
    return json(results.map((r) => ({ id: r.id, next: r.next, ...JSON.parse(r.data) })));
  }

  if (path === 'reminders' && request.method === 'POST') {
    const r = parse(await request.json());
    if (!r) return json({ error: 'invalid' }, 400);
    const next = nextAfter(r, Date.now());
    if (next === null) return json({ error: 'past' }, 400);
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO reminders (id, data, next, owner) VALUES (?, ?, ?, ?)').bind(id, JSON.stringify(r), next, owner).run();
    return json({ id, next, ...r });
  }

  // 端末へ保存し終えた内容をサーバーから消す
  if (path === 'reminders/forget' && request.method === 'POST') {
    const { ids } = await request.json();
    const strip = db.prepare("UPDATE reminders SET data = json_remove(data, '$.text') WHERE id = ? AND owner = ?");
    await db.batch(ids.map((id) => strip.bind(String(id), owner)));
    return json({ ok: true });
  }

  // タスク完了: 単発は削除、繰り返しは due を下ろして次回まで待つ
  const done = path.match(/^reminders\/([^/]+)\/done$/);
  if (done && request.method === 'POST') {
    await db.prepare('DELETE FROM reminders WHERE id = ? AND owner = ? AND next IS NULL').bind(done[1], owner).run();
    await db.prepare("UPDATE reminders SET data = json_remove(data, '$.due') WHERE id = ? AND owner = ?").bind(done[1], owner).run();
    return json({ ok: true });
  }

  if (path.startsWith('reminders/') && request.method === 'DELETE') {
    await db.prepare('DELETE FROM reminders WHERE id = ? AND owner = ?').bind(path.slice(10), owner).run();
    return json({ ok: true });
  }

  if (path === 'subscribe' && request.method === 'POST') {
    const s = await request.json();
    if (!s.endpoint || !s.keys?.p256dh || !s.keys?.auth) return json({ error: 'invalid' }, 400);
    const save = db
      .prepare('INSERT OR REPLACE INTO subs (endpoint, p256dh, auth, owner) VALUES (?, ?, ?, ?)')
      .bind(s.endpoint, s.keys.p256dh, s.keys.auth, owner);
    // 持ち主のいない以前の通知先と一致する端末だけが、持ち主のいない以前の予約を引き継ぐ
    const old = await db.prepare('SELECT owner, auth FROM subs WHERE endpoint = ?').bind(s.endpoint).first();
    const isLegacy = old && old.owner === null && old.auth === s.keys.auth;
    const claim = db.prepare('UPDATE reminders SET owner = ? WHERE owner IS NULL').bind(owner);
    await db.batch(isLegacy ? [claim, save] : [save]);
    return json({ ok: true });
  }

  return json({ error: 'not found' }, 404);
}
