import { nextAfter } from '../shared/schedule.js';
import { sendPush } from './push.js';

const SUBJECT = 'https://remind-app-15e.pages.dev';

async function run(env) {
  const now = Date.now();
  const { results: due } = await env.DB.prepare('SELECT id, data, owner FROM reminders WHERE next <= ?').bind(now).all();
  if (!due.length) return;
  const { results: subs } = await env.DB.prepare('SELECT endpoint, p256dh, auth, owner FROM subs').all();
  const jwk = JSON.parse(env.VAPID_JWK);

  // 先にスケジュールを進める。すべてタスクなので due を立てて完了まで残す
  for (const row of due) {
    const r = JSON.parse(row.data);
    const next = r.repeat ? nextAfter(r, now) : null;
    await env.DB.prepare("UPDATE reminders SET next = ?, data = json_set(data, '$.due', json('true')) WHERE id = ?").bind(next, row.id).run();
  }
  const { results: counts } = await env.DB.prepare("SELECT owner, COUNT(*) AS n FROM reminders WHERE json_extract(data, '$.due') GROUP BY owner").all();
  const badges = new Map(counts.map((c) => [c.owner, c.n]));

  for (const row of due) {
    const r = JSON.parse(row.data);
    // 持ち主の端末にだけ送る。内容は端末側にあるので通常は id だけを送る
    for (const s of subs.filter((s) => s.owner === row.owner)) {
      const payload = { id: row.id, title: r.text, badge: badges.get(row.owner) };
      const res = await sendPush(s, JSON.stringify(payload), jwk, SUBJECT);
      if (res.status === 404 || res.status === 410) {
        await env.DB.prepare('DELETE FROM subs WHERE endpoint = ?').bind(s.endpoint).run();
      } else if (!res.ok) {
        console.log('push failed', res.status, await res.text());
      }
    }
  }
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(run(env));
  },
};
