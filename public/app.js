const VAPID_PUBLIC = 'BFVTu8AcOuiyqkJNWbWg0wu-fDMOC8SPMpL5m9lr3kUgt9iFICXI5KakFxT1CxK06BNwrXKs1ouYXKfy-M-vXY4';
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');

// ---- フォーム初期化 ----
for (let h = 1; h <= 12; h++) $('every').add(new Option(`${h}時間おき`, h));

// ---- 日時の選択 ----
const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
// h は文字盤の位置 0〜11（12時の位置が 0）、未選択は null。step は時計が今どちらを選ぶか ('h' | 'm')
let pick;
let touched = false;

const set = (patch) => {
  pick = { ...pick, ...patch };
  touched = true;
  drawPick();
};
const resetPick = () => {
  const n = new Date();
  pick = { date: midnight(n), pm: n.getHours() >= 12, h: null, m: 0, step: 'h' };
  touched = false;
  drawPick();
};
const hour24 = () => pick.h + (pick.pm ? 12 : 0);

const polar = (deg, r) => {
  const a = (deg * Math.PI) / 180;
  return `${(100 + r * Math.sin(a)).toFixed(2)} ${(100 - r * Math.cos(a)).toFixed(2)}`;
};
const hand = (deg, r, cls) => `<path class="hand ${cls}" d="M100 100L${polar(deg, r)}"/>`;

function drawClock() {
  const isH = pick.step === 'h';
  const sel = isH ? (pick.h === null ? null : pick.h * 30) : pick.m * 6;
  let s = '<circle class="face" cx="100" cy="100" r="99"/>';
  for (let i = 0; i < 60; i++) {
    const long = i % 5 === 0;
    s += `<path class="tick" d="M${polar(i * 6, long ? 89 : 92)}L${polar(i * 6, 95)}"/>`;
  }
  if (sel !== null) {
    const [x, y] = polar(sel, 72).split(' ');
    s += `<circle class="pickDot" cx="${x}" cy="${y}" r="14"/>`;
  }
  if (pick.h !== null) {
    s += hand(pick.h * 30 + pick.m / 2, 44, isH ? 'on' : '');
    s += hand(pick.m * 6, 62, isH ? '' : 'on');
    s += '<circle class="hub" cx="100" cy="100" r="4"/>';
  }
  // 午前は 0〜11、午後は 12〜23 を文字盤に出す
  for (let i = 0; i < 12; i++) {
    const [x, y] = polar(i * 30, 72).split(' ');
    const on = isH ? i === pick.h : i * 5 === pick.m;
    const label = isH ? i + (pick.pm ? 12 : 0) : pad(i * 5);
    s += `<text x="${x}" y="${y}" class="${on ? 'sel' : ''}">${label}</text>`;
  }
  s += `<text x="100" y="132" class="ap">‹ ${pick.pm ? '午後' : '午前'} ›</text>`;
  $('clock').innerHTML = s;
}

function drawPick() {
  const d = pick.date;
  $('dateBtn').textContent = `${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）`;
  $('rdH').textContent = pick.h === null ? '--' : hour24();
  $('rdM').textContent = pick.h === null ? '--' : pad(pick.m);
  $('rdM').disabled = pick.h === null;
  $('rdH').classList.toggle('on', pick.step === 'h');
  $('rdM').classList.toggle('on', pick.step === 'm');
  drawClock();
}

// 1回目のタップで時、切り替わって2回目で分を選ぶ（分は5分刻み）
$('clock').onclick = (e) => {
  if (flicked) return;
  const box = $('clock').getBoundingClientRect();
  const dx = e.clientX - box.left - box.width / 2;
  const dy = e.clientY - box.top - box.height / 2;
  const deg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  if (pick.step === 'h') set({ h: Math.round(deg / 30) % 12, step: 'm' });
  else set({ m: (Math.round(deg / 30) * 5) % 60 });
};
// 時計の真ん中から左右どちらかへフリックすると午前午後が入れ替わる
let flickFrom = null;
let flicked = false;
$('clock').onpointerdown = (e) => {
  flicked = false;
  const box = $('clock').getBoundingClientRect();
  const fromCenter = Math.hypot(e.clientX - box.left - box.width / 2, e.clientY - box.top - box.height / 2);
  flickFrom = fromCenter < box.width * 0.28 ? { x: e.clientX, y: e.clientY } : null;
};
$('clock').onpointerup = (e) => {
  if (!flickFrom) return;
  const dx = Math.abs(e.clientX - flickFrom.x);
  const dy = Math.abs(e.clientY - flickFrom.y);
  flickFrom = null;
  if (dx < 24 || dx <= dy) return;
  flicked = true;
  set({ pm: !pick.pm });
};
$('rdH').onclick = () => set({ step: 'h' });
$('rdM').onclick = () => set({ step: 'm' });

document.querySelectorAll('#quick button').forEach((b) => {
  b.onclick = () => {
    const t = new Date(Date.now() + b.dataset.min * 60e3);
    set({ date: midnight(t), pm: t.getHours() >= 12, h: t.getHours() % 12, m: t.getMinutes(), step: 'h' });
  };
});

// 開きっぱなしのアプリに戻ってきたとき、未操作なら今日・現在の午前午後に合わせ直す
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !touched) resetPick();
});

// ---- カレンダー ----
let calMonth;
const drawCal = () => {
  const y = calMonth.getFullYear();
  const mo = calMonth.getMonth();
  const today = midnight(new Date());
  $('calTitle').textContent = `${y}年${mo + 1}月`;
  $('calPrev').disabled = calMonth <= new Date(today.getFullYear(), today.getMonth(), 1);
  const cells = Array.from({ length: calMonth.getDay() }, () => document.createElement('span'));
  for (let d = 1; d <= new Date(y, mo + 1, 0).getDate(); d++) {
    const date = new Date(y, mo, d);
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = d;
    b.disabled = date < today;
    b.classList.toggle('today', +date === +today);
    b.classList.toggle('on', +date === +pick.date);
    b.onclick = () => {
      set({ date });
      $('calDlg').close();
    };
    cells.push(b);
  }
  $('calGrid').replaceChildren(...cells);
};
const shiftCal = (n) => {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + n, 1);
  drawCal();
};
WD.forEach((w) => {
  const s = document.createElement('span');
  s.textContent = w;
  $('calWeek').append(s);
});
$('calPrev').onclick = () => shiftCal(-1);
$('calNext').onclick = () => shiftCal(1);
$('dateBtn').onclick = () => {
  calMonth = new Date(pick.date.getFullYear(), pick.date.getMonth(), 1);
  drawCal();
  $('calDlg').showModal();
};
// 枠の外をタップしたら閉じる
$('calDlg').onclick = (e) => e.target === $('calDlg') && $('calDlg').close();

// ---- 予約一覧 ----
$('openList').onclick = () => $('listDlg').showModal();
$('closeList').onclick = () => $('listDlg').close();
$('copyQuick').onclick = async () => {
  await navigator.clipboard.writeText(`${location.origin}/q#k=${ownerToken()}`);
  $('copyQuick').textContent = 'コピーしました';
  setTimeout(() => ($('copyQuick').textContent = 'クイック登録のURLをコピー'), 1500);
};

const days = new Set([1, 2, 3, 4, 5]);
WD.forEach((w, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = w;
  b.classList.toggle('on', days.has(i));
  b.onclick = () => {
    days.has(i) ? days.delete(i) : days.add(i);
    b.classList.toggle('on', days.has(i));
  };
  $('days').append(b);
});

const mode = () => document.querySelector('input[name=mode]:checked').value;
const sync = () => {
  const rep = $('repeat').checked;
  $('dateBtn').hidden = rep;
  $('quick').hidden = rep;
  $('rep').hidden = !rep;
  $('modeInterval').hidden = mode() !== 'interval';
  $('clockBox').hidden = rep && mode() === 'interval';
};
$('repeat').onchange = sync;
document.querySelectorAll('input[name=mode]').forEach((r) => (r.onchange = sync));

attachVoice($('text'), $('mic'));

// ---- 一覧 ----
const fmtDays = (ds) => (ds.length === 7 ? '毎日' : [...ds].sort().map((d) => WD[d]).join(''));
const when = (r) => {
  if (!r.repeat) {
    const d = new Date(r.at);
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if (r.mode === 'interval') return `${fmtDays(r.days)} ${r.start}–${r.end} ${r.every}時間おき`;
  return `${fmtDays(r.days)} ${r.time}`;
};

const setBadge = (n) => {
  if (!('setAppBadge' in navigator)) return;
  (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
};

const item = (r, isTask) => {
  const li = document.createElement('li');
  li.innerHTML = isTask
    ? '<button class="check" aria-label="完了"></button><div class="body"><div class="t"></div><div class="w"></div></div>'
    : '<div class="body"><div class="t"></div><div class="w"></div></div><button class="del" aria-label="削除">×</button>';
  li.querySelector('.t').textContent = r.text;
  li.querySelector('.w').textContent = when(r);
  if (isTask) {
    li.querySelector('.check').onclick = async () => {
      li.classList.add('done');
      await api(`reminders/${r.id}/done`, { method: 'POST' });
      // 繰り返しは次回の通知でまた使うので内容を残す
      if (r.next === null) await textDel(r.id);
      load();
    };
  } else {
    li.querySelector('.del').onclick = async () => {
      if (!confirm('削除しますか？')) return;
      await api(`reminders/${r.id}`, { method: 'DELETE' });
      await textDel(r.id);
      load();
    };
  }
  return li;
};

async function load() {
  const list = await (await api('reminders')).json();
  // サーバーに内容が残っていたら（以前の登録・クイック登録）端末へ移してサーバーから消す
  const moved = list.filter((r) => r.text);
  await Promise.all(moved.map((r) => textPut(r.id, r.text)));
  if (moved.length) await api('reminders/forget', { method: 'POST', body: JSON.stringify({ ids: moved.map((r) => r.id) }) });
  for (const r of list) r.text ??= (await textGet(r.id)) ?? '（内容なし）';
  // 現在のタスク = 通知時刻を過ぎて未完了のタスク。予約 = これから通知するもの
  const tasks = list.filter((r) => r.due);
  const scheduled = list.filter((r) => r.next !== null);
  $('tasks').replaceChildren(...tasks.map((r) => item(r, true)));
  $('list').replaceChildren(...scheduled.map((r) => item(r, false)));
  $('tasksBox').hidden = !tasks.length;
  $('listEmpty').hidden = !!scheduled.length;
  $('openList').textContent = scheduled.length ? `予約一覧（${scheduled.length}）` : '予約一覧';
  setBadge(tasks.length);
}

// ---- 登録 ----
$('form').onsubmit = async (e) => {
  e.preventDefault();
  const text = $('text').value.trim();
  if (!text) return alert('内容を入力してください');
  const body = { repeat: $('repeat').checked };
  if (!$('clockBox').hidden && pick.h === null) return alert('時計で時刻を選んでください');
  if (body.repeat) {
    if (!days.size) return alert('曜日を選択してください');
    body.days = [...days];
    body.mode = mode();
    if (body.mode === 'time') body.time = `${pad(hour24())}:${pad(pick.m)}`;
    else Object.assign(body, { every: +$('every').value, start: $('start').value, end: $('end').value });
  } else {
    const d = pick.date;
    const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour24(), pick.m);
    if (at <= Date.now()) return alert('過ぎた時刻は登録できません');
    body.at = at.getTime();
  }
  const res = await api('reminders', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) return alert('登録できませんでした');
  await textPut((await res.json()).id, text);
  $('text').value = '';
  resetPick();
  load();
  // 予約は一覧を開かないと見えないので、登録できたことをボタンで伝える
  $('submit').textContent = '登録しました';
  setTimeout(() => ($('submit').textContent = '登録'), 1500);
};

// ---- 通知 ----
const keyBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function subscribe() {
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) }));
  await api('subscribe', { method: 'POST', body: JSON.stringify(sub) });
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');

if (!('PushManager' in window)) {
  $('notify').hidden = false;
  $('notify').onclick = () => alert('共有 →「ホーム画面に追加」から開いてください');
} else if (Notification.permission === 'granted') {
  // 以前から通知を受けていた端末は、ここで既存の予約を引き継ぐので読み直す
  subscribe().then(load);
} else {
  $('notify').hidden = false;
  $('notify').onclick = async () => {
    if ((await Notification.requestPermission()) !== 'granted') return;
    await subscribe();
    $('notify').hidden = true;
    load();
  };
}

// ブラウザに端末内の保存データを消されにくくする
navigator.storage?.persist?.();

resetPick();
sync();
load();

// ピンチ・ダブルタップでの拡大を止める
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
