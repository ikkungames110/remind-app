// 日時はすべて日本時間 (UTC+9) で扱う
const OFF = 9 * 3600e3;

const toMin = (s) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

export function slots(r) {
  if (r.mode === 'interval') {
    const out = [];
    for (let m = toMin(r.start); m <= toMin(r.end); m += r.every * 60) out.push(m);
    return out;
  }
  return [toMin(r.time)];
}

// after より後で次に通知する時刻 (ms)。無ければ null
export function nextAfter(r, after) {
  if (!r.repeat) return r.at > after ? r.at : null;
  const d = new Date(after + OFF);
  const ss = slots(r);
  for (let i = 0; i <= 7; i++) {
    const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + i);
    if (!r.days.includes(new Date(base).getUTCDay())) continue;
    for (const m of ss) {
      const t = base + m * 60e3 - OFF;
      if (t > after) return t;
    }
  }
  return null;
}
