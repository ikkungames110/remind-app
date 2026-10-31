// 音声入力: 録音して /api/transcribe（Workers AI Whisper）で文字起こしする
function attachVoice(input, btn) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return;
  btn.hidden = false;
  let rec = null;
  let timer = 0;
  btn.onclick = async () => {
    if (btn.classList.contains('busy')) return;
    if (rec) return rec.stop();
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return alert('マイクの使用を許可してください');
    }
    const chunks = [];
    rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      clearTimeout(timer);
      stream.getTracks().forEach((t) => t.stop());
      rec = null;
      btn.classList.remove('on');
      btn.classList.add('busy');
      try {
        const res = await fetch('/api/transcribe', { method: 'POST', body: new Blob(chunks, { type: chunks[0]?.type }) });
        const { text } = await res.json();
        if (!res.ok) throw 0;
        if (text) input.value = (input.value ? input.value + ' ' : '') + text.trim();
      } catch {
        alert('音声を認識できませんでした');
      }
      btn.classList.remove('busy');
    };
    rec.start();
    btn.classList.add('on');
    timer = setTimeout(() => rec?.stop(), 30e3);
  };
}
