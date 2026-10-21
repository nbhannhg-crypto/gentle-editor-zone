/** Mic recorder with voice-activity detection: records each spoken phrase and hands back a Blob after ~1s of silence. Works in every browser with MediaRecorder (Opera, Chrome, Safari, Samsung). */
export type VadHandle = { stop: () => void };

export async function startVadRecorder(opts: {
  onPhrase: (blob: Blob, mime: string, info?: { durationMs: number; peak: number }) => void;
  onSpeechStart?: () => void;
  isPaused?: () => boolean;
  onLevel?: (rms: number, speaking: boolean) => void;
  silenceMs?: number;
  minRms?: () => number;
}): Promise<VadHandle> {
  const pro = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: { ideal: 16000 } } as MediaTrackConstraints;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: pro }).catch(() => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }));
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
  let speaking = false, lastVoice = 0, startedAt = 0, noise = 0.01, stopped = false, peak = 0, voiced = 0;
  const silenceMs = Math.max(300, opts.silenceMs ?? 450);
  // حد الكلام البشري الواضح: يتجاهل التنفس وهواء الغرفة
  const MIN_RMS = () => Math.min(0.05, Math.max(0.005, opts.minRms?.() ?? 0.012));

  const begin = () => {
    chunks = []; peak = 0; voiced = 0;
    rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    const r = rec;
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onstop = () => {
      const dur = Date.now() - startedAt;
      const type = r.mimeType || mime || "audio/webm";
      // يرسل فقط إذا فيه كلام فعلي كافٍ (ليس وشيش قصير)
      if (dur > 180 && voiced >= 2 && chunks.length) opts.onPhrase(new Blob(chunks, { type }), type.split(";")[0] ?? type, { durationMs: dur, peak });
    };
    r.start(250);
    startedAt = Date.now();
  };

  const tick = () => {
    if (stopped) return;
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) { const v = ((buf[i] ?? 128) - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / buf.length);
    if (!speaking) noise = noise * 0.97 + rms * 0.03;
    const loud = rms > Math.max(MIN_RMS(), noise * 2.2);
    const now = Date.now();
    opts.onLevel?.(rms, speaking);
    if (opts.isPaused?.()) { if (speaking) { speaking = false; chunks = []; voiced = 0; try { rec?.stop(); } catch { /* */ } } }
    else if (loud) {
      lastVoice = now; voiced++; if (rms > peak) peak = rms;
      if (!speaking) { speaking = true; opts.onSpeechStart?.(); begin(); voiced = 1; peak = rms; }
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
