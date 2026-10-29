import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { simliCreateFace, simliFaceStatus, simliToken } from "@/lib/simli.functions";
import { smartReply } from "@/lib/ai.functions";
import { useSpeaker } from "@/components/VoiceStudio";

const FACE_KEY = "kingdom_simli_face";
const DONE = /complete|success|done|ready|finished/i;
const BAD = /fail|error/i;

type SimliLike = { start: () => Promise<void>; stop: () => Promise<void>; sendAudioData: (d: Uint8Array) => void; ClearBuffer: () => void; on: (e: string, cb: (...a: unknown[]) => void) => void };

/** يحوّل أي ملف صوت إلى PCM16 أحادي 16kHz اللي يحتاجه تحريك الشفايف */
async function toPcm16(url: string): Promise<Uint8Array> {
  const buf = await (await fetch(url)).arrayBuffer();
  const Ctx = window.OfflineAudioContext;
  const tmp = new AudioContext();
  const decoded = await tmp.decodeAudioData(buf);
  tmp.close();
  const len = Math.ceil(decoded.duration * 16000);
  const off = new Ctx(1, len, 16000);
  const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
  const out = (await off.startRendering()).getChannelData(0);
  const pcm = new Int16Array(out.length);
  for (let i = 0; i < out.length; i++) { const s = Math.max(-1, Math.min(1, out[i] ?? 0)); pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
  return new Uint8Array(pcm.buffer);
}

export function LiveVideoCall() {
  const create = useServerFn(simliCreateFace);
  const status = useServerFn(simliFaceStatus);
  const getToken = useServerFn(simliToken);
  const smart = useServerFn(smartReply);
  const tts = useSpeaker();

  const [faceId, setFaceId] = useState("");
  const [faceState, setFaceState] = useState("");
  const [preview, setPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [live, setLive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [heard, setHeard] = useState("");
  const [said, setSaid] = useState("");
  const [log, setLog] = useState<{ who: "c" | "a"; t: string }[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const clientRef = useRef<SimliLike | null>(null);
  const recRef = useRef<{ stop: () => void; start: () => void; abort?: () => void } | null>(null);
  const liveRef = useRef(false);
  const busyRef = useRef(false);
  const logRef = useRef(log);
  useEffect(() => { logRef.current = log; }, [log]);

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(FACE_KEY) || "{}"); if (s.faceId) { setFaceId(s.faceId); setFaceState(s.state || ""); setPreview(s.preview || ""); } } catch { /* ignore */ }
  }, []);
  const saveFace = (id: string, state: string, pv = preview) => { setFaceId(id); setFaceState(state); localStorage.setItem(FACE_KEY, JSON.stringify({ faceId: id, state, preview: pv.slice(0, 200_000) })); };

  // متابعة تجهيز الوجه
  useEffect(() => {
    if (!faceId || DONE.test(faceState) || BAD.test(faceState) || faceState === "manual") return undefined;
    let stop = false;
    const tick = async () => {
      try {
        const s = await status({ data: { faceId } });
        if (stop) return;
        saveFace(faceId, s.status);
        if (!DONE.test(s.status) && !BAD.test(s.status)) setTimeout(tick, 15000);
      } catch { if (!stop) setTimeout(tick, 20000); }
    };
    tick();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceId, faceState]);

  const upload = async (f: File) => {
    if (f.size > 10_000_000) return toast.error("الصورة كبيرة، أقل من 10 ميجا");
    setUploading(true);
    try {
      const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });
      setPreview(data);
      const out = await create({ data: { image: data, name: "kingdom" } });
      saveFace(out.faceId, "queued", data);
      toast.success("انرفعت الصورة ✨ تجهيز الوجه الحي ياخذ عدة دقائق");
    } catch (e) { toast.error((e as Error).message); }
    setUploading(false);
  };

  const ready = !!faceId && (DONE.test(faceState) || faceState === "manual");

  const speak = async (text: string) => {
    const c = clientRef.current; if (!c) return;
    setSaid(text); setLog((l) => [...l, { who: "a", t: text }]);
    const url = await tts(text);
    const pcm = await toPcm16(url);
    c.ClearBuffer();
    const CH = 6000;
    for (let i = 0; i < pcm.length; i += CH) c.sendAudioData(pcm.subarray(i, i + CH));
    // تقدير مدة الكلام عشان ما تسمع نفسها
    await new Promise((r) => setTimeout(r, (pcm.length / 32000) * 1000 + 400));
  };

  const onHeard = async (text: string) => {
    if (busyRef.current || !liveRef.current) return;
    busyRef.current = true; setHeard(text);
    setLog((l) => [...l, { who: "c", t: text }]);
    try { recRef.current?.stop(); } catch { /* ignore */ }
    try {
      const { reply } = await smart({ data: { customer: text.slice(0, 1000), product: "", rules: [], mood: "call", history: logRef.current.slice(-4).map((m) => ({ who: m.who, t: m.t.slice(0, 400) })) } });
      if (reply && liveRef.current) await speak(reply);
    } catch (e) { toast.error((e as Error).message); }
    busyRef.current = false;
    if (liveRef.current) { try { recRef.current?.start(); } catch { /* ignore */ } }
  };

  const listen = () => {
    const W = window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
    const C = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!C) { toast.error("متصفحك ما يدعم سماع الصوت، جرّب كروم"); return; }
    const rec = new C(); rec.lang = "ar-SA"; rec.continuous = false; rec.interimResults = true;
    rec.onresult = (e: any) => {
      const r = e.results[e.results.length - 1];
      const t = r[0].transcript.trim();
      if (r.isFinal) { if (t) onHeard(t); } else setHeard(t);
    };
    rec.onend = () => { if (liveRef.current && !busyRef.current) setTimeout(() => { try { rec.start(); } catch { /* ignore */ } }, 200); };
    rec.onerror = () => { /* onend يعيد التشغيل */ };
    recRef.current = rec;
    try { rec.start(); } catch { /* ignore */ }
  };

  const start = async () => {
    if (!ready || !videoRef.current || !audioRef.current) return;
    setConnecting(true);
    try {
      const { token } = await getToken({ data: { faceId } });
      const { SimliClient, LogLevel } = await import("simli-client");
      const c = new SimliClient(token, videoRef.current, audioRef.current, null, LogLevel.ERROR) as unknown as SimliLike;
      c.on("stop", () => end());
      clientRef.current = c;
      await c.start();
      liveRef.current = true; setLive(true); setLog([]);
      await speak("هلا والله، وحشتني");
      listen();
    } catch (e) { toast.error(`ما قدرت أفتح المكالمة: ${String((e as Error)?.message ?? e)}`); clientRef.current = null; }
    setConnecting(false);
  };

  const end = () => {
    liveRef.current = false; setLive(false); busyRef.current = false;
    try { recRef.current?.abort?.(); recRef.current?.stop(); } catch { /* ignore */ }
    const c = clientRef.current; clientRef.current = null;
    c?.stop().catch(() => {});
  };
  useEffect(() => () => end(), []);

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-bold">📹 مكالمة فيديو حية</h3>
        {live && <span className="animate-pulse rounded-full bg-destructive px-2 py-0.5 text-xs text-destructive-foreground">● مباشر</span>}
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-2xl bg-muted">
        <video ref={videoRef} autoPlay playsInline className={`h-full w-full object-cover ${live ? "" : "hidden"}`} />
        <audio ref={audioRef} autoPlay />
        {!live && (preview ? <img src={preview} alt="الموظفة" className="h-full w-full object-cover opacity-80" /> : <div className="flex h-full items-center justify-center text-6xl">👩🏻</div>)}
        {connecting && <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-sm font-bold">جاري الاتصال…</div>}
      </div>

      {!live && (
        <div className="space-y-2">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">1) ارفع صورة وجه واضحة من الأمام</span>
            <Input type="file" accept="image/*" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
          </label>
          {faceId && (
            <p className="text-xs text-muted-foreground">
              حالة الوجه: {ready ? "✅ جاهز للاتصال" : BAD.test(faceState) ? "❌ فشل التجهيز، جرّب صورة ثانية" : `⏳ يتجهز (${faceState || "بالانتظار"}) — ياخذ عدة دقائق`}
            </p>
          )}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">عندي رقم وجه جاهز من Simli</summary>
            <div className="mt-2 flex gap-2">
              <Input id="manual-face" placeholder="Face ID" defaultValue={faceState === "manual" ? faceId : ""} />
              <Button size="sm" variant="secondary" onClick={() => { const v = (document.getElementById("manual-face") as HTMLInputElement)?.value.trim(); if (v) { saveFace(v, "manual"); toast.success("انحفظ"); } }}>حفظ</Button>
            </div>
          </details>
          <Button className="w-full" size="lg" disabled={!ready || connecting} onClick={start}>📞 2) دق اتصال</Button>
        </div>
      )}

      {live && (
        <div className="space-y-2">
          <p className="text-sm">🎙️ تسمعك: <span className="text-muted-foreground">{heard || "…"}</span></p>
          <p className="text-sm">💬 قالت: <span className="font-semibold">{said}</span></p>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-muted p-2 text-xs">
            {log.map((m, i) => <div key={i} className={m.who === "a" ? "text-primary" : ""}>{m.who === "a" ? "هي: " : "أنت: "}{m.t}</div>)}
          </div>
          <Button className="w-full" size="lg" variant="destructive" onClick={end}>⛔ إنهاء المكالمة</Button>
        </div>
      )}
    </div>
  );
}
