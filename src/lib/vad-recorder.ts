/** Mic recorder with voice-activity detection: records each spoken phrase and hands back a Blob after ~1s of silence. Works in every browser with MediaRecorder (Opera, Chrome, Safari, Samsung). */
export type VadHandle = { stop: () => void };

export async function startVadRecorder(opts: {
  onPhrase: (blob: Blob, mime: string) => void;
  onSpeechStart?: () => void;
  isPaused?: () => boolean;
  silenceMs?: number;
}): Promise<VadHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx: AudioContext = new AC();
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser();
  an.fftSize = 1024;
  src.connect(an);
  const buf = new Uint8Array(an.fftSize);
  const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => (window as any).MediaRecorder?.isTypeSupported?.(m)) || "";
  let rec: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let speaking = false, lastVoice = 0, startedAt = 0, noise = 0.01, stopped = false;
  const silenceMs = opts.silenceMs ?? 1000;

  const begin = () => {
    chunks = [];
    rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const dur = Date.now() - startedAt;
      const type = rec?.mimeType || mime || "audio/webm";
      if (dur > 400 && chunks.length) opts.onPhrase(new Blob(chunks, { type }), type.split(";")[0] ?? type);
    };
    rec.start(250);
    startedAt = Date.now();
  };

  const tick = () => {
    if (stopped) return;
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) { const v = ((buf[i] ?? 128) - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / buf.length);
    if (!speaking) noise = noise * 0.97 + rms * 0.03;
    const loud = rms > Math.max(0.02, noise * 2.5);
    const now = Date.now();
    if (opts.isPaused?.()) { if (speaking) { speaking = false; try { rec?.stop(); } catch { /* */ } } }
    else if (loud) {
      lastVoice = now;
      if (!speaking) { speaking = true; opts.onSpeechStart?.(); begin(); }
      else if (now - startedAt > 25000) { try { rec?.stop(); } catch { /* */ } begin(); }
    } else if (speaking && now - lastVoice > silenceMs) {
      speaking = false;
      try { rec?.stop(); } catch { /* */ }
    }
    requestAnimationFrame(tick);
  };
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});
  requestAnimationFrame(tick);

  return {
    stop: () => {
      stopped = true;
      try { if (rec && rec.state !== "inactive") rec.stop(); } catch { /* */ }
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
