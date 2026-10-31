const VAPID_PUBLIC = 'BFVTu8AcOuiyqkJNWbWg0wu-fDMOC8SPMpL5m9lr3kUgt9iFICXI5KakFxT1CxK06BNwrXKs1ouYXKfy-M-vXY4';
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');

// ---- フォーム初期化 ----
const now = new Date(Date.now() + 3600e3);
for (let m = 1; m <= 12; m++) $('month').add(new Option(`${m}月`, m));
for (let d = 1; d <= 31; d++) $('day').add(new Option(`${d}日`, d));
for (let h = 1; h <= 12; h++) $('every').add(new Option(`${h}時間おき`, h));
$('month').value = now.getMonth() + 1;
$('day').value = now.getDate();
$('onceTime').value = `${pad(now.getHours())}:00`;

document.querySelectorAll('#quick button').forEach((b) => {
  b.onclick = () => {
    const t = new Date(Date.now() + b.dataset.min * 60e3);
    $('month').value = t.getMonth() + 1;
    $('day').value = t.getDate();
    $('onceTime').value = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
  };
});

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
  $('once').hidden = rep;
  $('quick').hidden = rep;
  $('onceTime').required = !rep;
  $('rep').hidden = !rep;
  $('modeTime').hidden = mode() !== 'time';
  $('modeInterval').hidden = mode() !== 'interval';
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
  li.querySelector('.w').textContent = (r.task && !isTask ? 'タスク・' : '') + when(r);
  if (isTask) {
    li.querySelector('.check').onclick = async () => {
      li.classList.add('done');
      await fetch(`/api/reminders/${r.id}/done`, { method: 'POST' });
      load();
    };
  } else {
    li.querySelector('.del').onclick = async () => {
      if (!confirm('削除しますか？')) return;
      await fetch(`/api/reminders/${r.id}`, { method: 'DELETE' });
      load();
    };
  }
  return li;
};

async function load() {
  const list = await (await fetch('/api/reminders')).json();
  // 現在のタスク = 通知時刻を過ぎて未完了のタスク。予約 = これから通知するもの
  const tasks = list.filter((r) => r.due);
  const scheduled = list.filter((r) => r.next !== null);
  $('tasks').replaceChildren(...tasks.map((r) => item(r, true)));
  $('list').replaceChildren(...scheduled.map((r) => item(r, false)));
  $('tasksBox').hidden = !tasks.length;
  $('listBox').hidden = !scheduled.length;
  setBadge(tasks.length);
}

// ---- 登録 ----
$('form').onsubmit = async (e) => {
  e.preventDefault();
  const body = { text: $('text').value, task: $('task').checked, repeat: $('repeat').checked };
  if (body.repeat) {
    if (!days.size) return alert('曜日を選択してください');
    body.days = [...days];
    body.mode = mode();
    if (body.mode === 'time') body.time = $('time').value;
    else Object.assign(body, { every: +$('every').value, start: $('start').value, end: $('end').value });
  } else {
    const [h, mi] = $('onceTime').value.split(':').map(Number);
    const y = new Date().getFullYear();
    let at = new Date(y, $('month').value - 1, +$('day').value, h, mi);
    if (at <= Date.now()) at = new Date(y + 1, $('month').value - 1, +$('day').value, h, mi);
    body.at = at.getTime();
  }
  const res = await fetch('/api/reminders', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) return alert('登録できませんでした');
  $('text').value = '';
  load();
};

// ---- 通知 ----
const keyBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function subscribe() {
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) }));
  await fetch('/api/subscribe', { method: 'POST', body: JSON.stringify(sub) });
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');

if (!('PushManager' in window)) {
  $('notify').hidden = false;
  $('notify').onclick = () => alert('共有 →「ホーム画面に追加」から開いてください');
} else if (Notification.permission === 'granted') {
  subscribe();
} else {
  $('notify').hidden = false;
  $('notify').onclick = async () => {
    if ((await Notification.requestPermission()) !== 'granted') return;
    await subscribe();
    $('notify').hidden = true;
  };
}

sync();
load();

// ピンチ・ダブルタップでの拡大を止める
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
