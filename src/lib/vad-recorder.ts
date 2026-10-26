/** Mic recorder with voice-activity detection. Captures raw PCM continuously with a pre-roll buffer, so the first syllable of each phrase is never clipped, and hands back a 16kHz WAV Blob after silence. */
export type VadHandle = { stop: () => void };

const PRE_ROLL_MS = 400;
const OUT_RATE = 16000;

function encodeWav(chunks: Float32Array[], inRate: number): Blob {
  let len = 0;
  for (const c of chunks) len += c.length;
  const all = new Float32Array(len);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  const ratio = inRate / OUT_RATE;
  const outLen = Math.floor(all.length / ratio);
  const pcm = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const s = Math.floor(i * ratio), e = Math.min(all.length, Math.floor((i + 1) * ratio));
    let sum = 0; for (let j = s; j < e; j++) sum += all[j] ?? 0;
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, e - s)));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const dv = new DataView(buf);
  const w = (p: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(p + i, s.charCodeAt(i)); };
  w(0, "RIFF"); dv.setUint32(4, 36 + pcm.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, OUT_RATE, true); dv.setUint32(28, OUT_RATE * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  w(36, "data"); dv.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Blob([buf], { type: "audio/wav" });
}

export async function startVadRecorder(opts: {
  onPhrase: (blob: Blob, mime: string, info?: { durationMs: number; peak: number }) => void;
  onSpeechStart?: () => void;
  isPaused?: () => boolean;
  onLevel?: (rms: number, speaking: boolean) => void;
  silenceMs?: number;
  minRms?: () => number;
}): Promise<VadHandle> {
  const pro = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } as MediaTrackConstraints;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: pro });
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx: AudioContext = new AC();
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(2048, 1, 1);
  const mute = ctx.createGain(); mute.gain.value = 0;
  src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
  const rate = ctx.sampleRate;
  const frameMs = (2048 / rate) * 1000;
  const preFrames = Math.ceil(PRE_ROLL_MS / frameMs);
  const silenceMs = Math.max(300, opts.silenceMs ?? 900);
  const MIN_RMS = () => Math.min(0.05, Math.max(0.005, opts.minRms?.() ?? 0.012));

  let pre: Float32Array[] = [];
  let rec: Float32Array[] = [];
  let speaking = false, lastVoice = 0, startedAt = 0, noise = 0.01, peak = 0, voiced = 0, stopped = false;

  const flush = () => {
    const dur = Date.now() - startedAt;
    const chunks = rec; rec = [];
    if (dur > 200 && voiced >= 2 && chunks.length) opts.onPhrase(encodeWav(chunks, rate), "audio/wav", { durationMs: dur, peak });
  };

  proc.onaudioprocess = (e) => {
    if (stopped) return;
    const data = new Float32Array(e.inputBuffer.getChannelData(0));
    let sum = 0; for (let i = 0; i < data.length; i++) sum += (data[i] ?? 0) ** 2;
    const rms = Math.sqrt(sum / data.length);
    if (!speaking) noise = noise * 0.95 + rms * 0.05;
    const loud = rms > Math.max(MIN_RMS(), noise * 2.2);
    const now = Date.now();
    opts.onLevel?.(rms, speaking);
    if (opts.isPaused?.()) { speaking = false; rec = []; pre = []; return; }
    if (speaking) {
      rec.push(data);
      if (loud) { lastVoice = now; voiced++; if (rms > peak) peak = rms; }
      if (now - lastVoice > silenceMs || now - startedAt > 25000) { speaking = false; flush(); }
    } else if (loud) {
      speaking = true; startedAt = now - PRE_ROLL_MS; lastVoice = now; voiced = 1; peak = rms;
      rec = [...pre, data]; pre = [];
      opts.onSpeechStart?.();
    } else {
      pre.push(data); if (pre.length > preFrames) pre.shift();
    }
  };
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});

  return {
    stop: () => {
      stopped = true;
      try { proc.disconnect(); src.disconnect(); } catch { /* */ }
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
    },
  };
}

export function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = rej;
    r.readAsDataURL(b);
  });
}
