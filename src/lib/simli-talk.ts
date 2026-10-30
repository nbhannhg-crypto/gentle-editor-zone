/** أدوات مشتركة للفيديو الحي: تحويل الصوت + إرساله بتوقيت حقيقي لتطابق الشفايف */
export type SimliLike = {
  start: () => Promise<void>; stop: () => Promise<void>;
  sendAudioData: (d: Uint8Array) => void; ClearBuffer: () => void;
  on: (e: string, cb: (...a: unknown[]) => void) => void;
};

const RATE = 16000;

/** PCM16 أحادي 16kHz مع قص الصمت في البداية والنهاية */
export async function toPcm16(url: string): Promise<Uint8Array> {
  const buf = await (await fetch(url)).arrayBuffer();
  const tmp = new AudioContext();
  const decoded = await tmp.decodeAudioData(buf);
  void tmp.close();
  const len = Math.ceil(decoded.duration * RATE);
  const off = new OfflineAudioContext(1, len, RATE);
  const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
  const out = (await off.startRendering()).getChannelData(0);
  const TH = 0.012;
  let a = 0; while (a < out.length && Math.abs(out[a] ?? 0) < TH) a++;
  let b = out.length - 1; while (b > a && Math.abs(out[b] ?? 0) < TH) b--;
  a = Math.max(0, a - 800); b = Math.min(out.length - 1, b + 1600); // هامش بسيط عشان ما ينقص أول حرف
  // تضخيم ذكي: نرفع الصوت الهادئ لقمة ~0.95 عشان المحرك يفتح الفم طبيعي (بدون تشويه)
  let peak = 0; for (let i = a; i <= b; i++) { const v = Math.abs(out[i] ?? 0); if (v > peak) peak = v; }
  const gain = peak > 0.01 ? Math.min(4, 0.95 / peak) : 1;
  const pcm = new Int16Array(Math.max(0, b - a + 1));
  for (let i = 0; i < pcm.length; i++) { const s = Math.max(-1, Math.min(1, (out[a + i] ?? 0) * gain)); pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
  return new Uint8Array(pcm.buffer);
}

/** يرسل الصوت بنفس سرعة تشغيله (حزم 100ms) بدل دفعة وحدة — هذا اللي يخلي الشفايف مطابقة */
export async function sendPaced(c: SimliLike, pcm: Uint8Array, alive: () => boolean, seq: { cur: number }) {
  const my = ++seq.cur;
  c.ClearBuffer();
  const CH = 3200; // 100ms
  const LEAD = 3;  // 300ms مقدماً عشان ما يتقطع
  const t0 = performance.now();
  for (let i = 0, k = 0; i < pcm.length; i += CH, k++) {
    if (!alive() || my !== seq.cur) return;
    c.sendAudioData(pcm.subarray(i, i + CH));
    if (k >= LEAD) {
      const due = t0 + (k - LEAD + 1) * 100;
      const w = due - performance.now();
      if (w > 0) await new Promise((r) => setTimeout(r, w));
    }
  }
  // ننتظر نهاية الكلام عشان المايك ما يسمعها
  const total = (pcm.length / 32000) * 1000;
  const left = t0 + total + 350 - performance.now();
  if (left > 0) await new Promise((r) => setTimeout(r, left));
}

export type SR = { start: () => void; stop: () => void; abort?: () => void; onresult: unknown; onend: unknown; onerror: unknown; lang: string; continuous: boolean; interimResults: boolean };
export function makeRecognizer(): SR | null {
  const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  const C = W.SpeechRecognition || W.webkitSpeechRecognition;
  if (!C) return null;
  const r = new C(); r.lang = "ar-SA"; r.continuous = false; r.interimResults = true;
  return r;
}
