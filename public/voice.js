// 音声入力（Web Speech API）。非対応ブラウザではボタンを出さない
function attachVoice(input, btn) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  btn.hidden = false;
  let rec = null;
  btn.onclick = () => {
    if (rec) return rec.stop();
    rec = new SR();
    rec.lang = 'ja-JP';
    rec.interimResults = true;
    const base = input.value;
    rec.onresult = (e) => {
      input.value = base + [...e.results].map((r) => r[0].transcript).join('');
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') alert('マイクの使用を許可してください');
    };
    rec.onend = () => {
      rec = null;
      btn.classList.remove('on');
    };
    btn.classList.add('on');
    rec.start();
  };
}
