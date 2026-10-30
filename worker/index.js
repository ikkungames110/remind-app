import { nextAfter } from '../shared/schedule.js';
import { sendPush } from './push.js';

const SUBJECT = 'https://remind-app-15e.pages.dev';

async function run(env) {
  const now = Date.now();
  const { results: due } = await env.DB.prepare('SELECT id, data FROM reminders WHERE next <= ?').bind(now).all();
  if (!due.length) return;
  const { results: subs } = await env.DB.prepare('SELECT endpoint, p256dh, auth FROM subs').all();
  const jwk = JSON.parse(env.VAPID_JWK);

  for (const row of due) {
    const r = JSON.parse(row.data);
    for (const s of subs) {
      const res = await sendPush(s, JSON.stringify({ title: r.text }), jwk, SUBJECT);
      if (res.status === 404 || res.status === 410) {
        await env.DB.prepare('DELETE FROM subs WHERE endpoint = ?').bind(s.endpoint).run();
      } else if (!res.ok) {
        console.log('push failed', res.status, await res.text());
      }
    }
    const next = r.repeat ? nextAfter(r, now) : null;
    if (next === null) await env.DB.prepare('DELETE FROM reminders WHERE id = ?').bind(row.id).run();
    else await env.DB.prepare('UPDATE reminders SET next = ? WHERE id = ?').bind(next, row.id).run();
  }
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(run(env));
  },
};
