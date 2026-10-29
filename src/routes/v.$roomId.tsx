import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { roomAppend, roomGet, roomToken } from "@/lib/simli.functions";
import { smartReply } from "@/lib/ai.functions";
import { useSpeaker } from "@/components/VoiceStudio";
import { makeRecognizer, sendPaced, toPcm16, type SimliLike, type SR } from "@/lib/simli-talk";
import { normalize } from "@/lib/rules";

export const Route = createFileRoute("/v/$roomId")({
  head: () => ({
    meta: [
      { title: "مكالمة فيديو واردة" },
      { name: "description", content: "مكالمة فيديو مباشرة — اضغط رد للبدء." },
      { property: "og:title", content: "📹 مكالمة فيديو واردة" },
      { property: "og:description", content: "عندك مكالمة فيديو مباشرة، افتح الرابط ورد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RoomPage,
});

type Info = { preview: string; voice: { voiceId?: string; speed?: number; emotion?: string }; rules: { trigger: string; response: string }[]; push: { id: number; t: string } | null; ended: boolean };

function RoomPage() {
  const { roomId } = Route.useParams();
  const get = useServerFn(roomGet);
  const token = useServerFn(roomToken);
  const append = useServerFn(roomAppend);
  const smart = useServerFn(smartReply);
  const tts = useSpeaker();

  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState("");
  const [phase, setPhase] = useState<"ring" | "connecting" | "live" | "ended">("ring");
  const [muted, setMuted] = useState(false);
  const [caption, setCaption] = useState("");
  const [front, setFront] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const selfRef = useRef<HTMLVideoElement>(null);
  const camRef = useRef<MediaStream | null>(null);
  const clientRef = useRef<SimliLike | null>(null);
  const recRef = useRef<SR | null>(null);
  const liveRef = useRef(false);
  const busyRef = useRef(false);
  const mutedRef = useRef(false);
  const seq = useRef({ cur: 0 });
  const histRef = useRef<{ who: "c" | "a"; t: string }[]>([]);
  const lastPush = useRef(0);
  const infoRef = useRef<Info | null>(null);

  useEffect(() => {
    get({ data: { id: roomId } }).then((i) => { setInfo(i); infoRef.current = i; lastPush.current = i.push?.id ?? 0; if (i.ended) setPhase("ended"); })
      .catch((e) => setErr((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const speak = async (text: string) => {
    const c = clientRef.current; if (!c || !liveRef.current) return;
    busyRef.current = true;
    try { recRef.current?.stop(); } catch { /* ignore */ }
    setCaption(text);
    histRef.current = [...histRef.current, { who: "a" as const, t: text }].slice(-6);
    void append({ data: { id: roomId, msgs: [{ who: "a", t: text.slice(0, 600) }] } }).catch(() => {});
    try {
      const v = infoRef.current?.voice ?? {};
      const url = await tts(text, v as never);
      await sendPaced(c, await toPcm16(url), () => liveRef.current, seq.current);
    } catch { /* ignore */ }
    busyRef.current = false;
    if (liveRef.current && !mutedRef.current) { try { recRef.current?.start(); } catch { /* ignore */ } }
  };

  const onHeard = async (text: string) => {
    if (busyRef.current || !liveRef.current) return;
    busyRef.current = true;
    histRef.current = [...histRef.current, { who: "c" as const, t: text }].slice(-6);
    void append({ data: { id: roomId, msgs: [{ who: "c", t: text.slice(0, 600) }] } }).catch(() => {});
    const rules = infoRef.current?.rules ?? [];
    const n = normalize(text);
    const learned = rules.find((r) => { const t = normalize(r.trigger); return t && (n === t || (t.length > 3 && n.includes(t))); });
    let reply = learned?.response ?? "";
    if (!reply) {
      try {
        const out = await smart({ data: { customer: text.slice(0, 1000), product: "", rules: rules.slice(0, 60), mood: "call", history: histRef.current.slice(-4).map((m) => ({ who: m.who, t: m.t.slice(0, 400) })) } });
        reply = out.reply ?? "";
      } catch { reply = "لحظة حبيبي، ما سمعتك زين"; }
    }
    busyRef.current = false;
    if (reply) await speak(reply);
  };

  const listen = () => {
    const r = makeRecognizer(); if (!r) return;
    r.onresult = (e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => {
      const res = e.results[e.results.length - 1]; if (!res) return;
      const t = (res[0]?.transcript ?? "").trim();
      if (res.isFinal && t) void onHeard(t);
    };
    r.onend = () => { if (liveRef.current && !busyRef.current && !mutedRef.current) setTimeout(() => { try { r.start(); } catch { /* ignore */ } }, 200); };
    r.onerror = () => { /* onend يعيد */ };
    recRef.current = r;
    try { r.start(); } catch { /* ignore */ }
  };

  const openCam = async (useFront: boolean) => {
    camRef.current?.getTracks().forEach((t) => t.stop());
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: useFront ? "user" : "environment", width: 480, height: 640 }, audio: false });
      camRef.current = s; if (selfRef.current) selfRef.current.srcObject = s;
    } catch { /* بدون كاميرا تكمل المكالمة */ }
  };

  const answer = async () => {
    if (!videoRef.current || !audioRef.current) return;
    setPhase("connecting");
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => {});
      void openCam(true);
      const { token: tk } = await token({ data: { id: roomId } });
      const { SimliClient, LogLevel } = await import("simli-client");
      const c = new SimliClient(tk, videoRef.current, audioRef.current, null, LogLevel.ERROR) as unknown as SimliLike;
      c.on("stop", () => hang());
      clientRef.current = c;
      await c.start();
      liveRef.current = true; setPhase("live");
      await speak("هلا والله، وحشتني");
      listen();
    } catch (e) { setErr((e as Error).message); setPhase("ring"); }
  };

  const hang = () => {
    if (!liveRef.current && phase === "ended") return;
    liveRef.current = false; setPhase("ended");
    try { recRef.current?.abort?.(); recRef.current?.stop(); } catch { /* ignore */ }
    camRef.current?.getTracks().forEach((t) => t.stop());
    const c = clientRef.current; clientRef.current = null; c?.stop().catch(() => {});
    void append({ data: { id: roomId, msgs: [], end: true } }).catch(() => {});
  };
  useEffect(() => () => { liveRef.current = false; camRef.current?.getTracks().forEach((t) => t.stop()); clientRef.current?.stop().catch(() => {}); }, []);

  // تدخل الملكة + لقطة كاميرا كل 8 ثواني
  useEffect(() => {
    if (phase !== "live") return undefined;
    const poll = setInterval(async () => {
      try {
        const i = await get({ data: { id: roomId } });
        if (i.ended) { hang(); return; }
        if (i.push && i.push.id > lastPush.current) { lastPush.current = i.push.id; seq.current.cur++; busyRef.current = false; void speak(i.push.t); }
      } catch { /* ignore */ }
    }, 2000);
    const snap = setInterval(() => {
      const v = selfRef.current; if (!v || !v.videoWidth) return;
      const cv = document.createElement("canvas"); cv.width = 160; cv.height = Math.round(160 * v.videoHeight / v.videoWidth);
      cv.getContext("2d")?.drawImage(v, 0, 0, cv.width, cv.height);
      void append({ data: { id: roomId, msgs: [], snap: cv.toDataURL("image/jpeg", 0.5) } }).catch(() => {});
    }, 8000);
    return () => { clearInterval(poll); clearInterval(snap); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const toggleMute = () => {
    const m = !mutedRef.current; mutedRef.current = m; setMuted(m);
    if (m) { try { recRef.current?.stop(); } catch { /* ignore */ } } else if (!busyRef.current) { try { recRef.current?.start(); } catch { /* ignore */ } }
  };

  return (
    <div dir="rtl" className="fixed inset-0 overflow-hidden bg-foreground text-background">
      <video ref={videoRef} autoPlay playsInline className={`absolute inset-0 h-full w-full object-cover ${phase === "live" ? "" : "hidden"}`} />
      <audio ref={audioRef} autoPlay />
      {phase !== "live" && info?.preview && <img src={info.preview} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40 blur-sm" />}

      {phase === "live" && (
        <video ref={selfRef} autoPlay playsInline muted className="absolute left-3 top-3 h-40 w-28 rounded-2xl border-2 border-background/70 object-cover shadow-lg" style={{ transform: front ? "scaleX(-1)" : undefined }} />
      )}

      {(phase === "ring" || phase === "connecting") && (
        <div className="relative flex h-full flex-col items-center justify-between py-16">
          <div className="text-center">
            {info?.preview ? <img src={info.preview} alt="" className="mx-auto h-28 w-28 rounded-full border-4 border-background/60 object-cover" /> : <div className="text-7xl">👩🏻</div>}
            <p className="mt-4 text-2xl font-bold">مكالمة فيديو</p>
            <p className="mt-1 animate-pulse text-sm opacity-80">{phase === "connecting" ? "جاري الاتصال…" : err ? err : info ? "يرن…" : "تحميل…"}</p>
          </div>
          {info && !info.ended && (
            <div className="flex gap-16">
              <button aria-label="رفض" onClick={() => setPhase("ended")} className="h-16 w-16 rounded-full bg-destructive text-2xl text-destructive-foreground">✕</button>
              <button aria-label="رد" disabled={phase === "connecting"} onClick={answer} className="h-16 w-16 animate-bounce rounded-full bg-primary text-2xl text-primary-foreground">📹</button>
            </div>
          )}
        </div>
      )}

      {phase === "live" && (
        <>
          {caption && <p className="absolute inset-x-4 bottom-32 rounded-xl bg-foreground/50 p-2 text-center text-sm">{caption}</p>}
          <div className="absolute inset-x-0 bottom-8 flex justify-center gap-6">
            <button aria-label="المايك" onClick={toggleMute} className="h-14 w-14 rounded-full bg-background/20 text-xl backdrop-blur">{muted ? "🔇" : "🎙️"}</button>
            <button aria-label="إنهاء" onClick={hang} className="h-14 w-14 rounded-full bg-destructive text-xl text-destructive-foreground">📞</button>
            <button aria-label="تبديل الكاميرا" onClick={() => { const f = !front; setFront(f); void openCam(f); }} className="h-14 w-14 rounded-full bg-background/20 text-xl backdrop-blur">🔄</button>
          </div>
        </>
      )}

      {phase === "ended" && (
        <div className="flex h-full flex-col items-center justify-center gap-2">
          <p className="text-2xl font-bold">انتهت المكالمة</p>
          <p className="text-sm opacity-70">{err}</p>
        </div>
      )}
    </div>
  );
}
