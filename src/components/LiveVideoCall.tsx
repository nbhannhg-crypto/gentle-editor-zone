import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { simliCreateFace, simliFaceStatus, simliToken, roomCreate, roomWatch, roomPush } from "@/lib/simli.functions";
import { smartReply } from "@/lib/ai.functions";
import { useSpeaker, loadVoice } from "@/components/VoiceStudio";
import { getStudioVoice } from "@/lib/voice-model";
import { toPcm16, sendPaced, type SimliLike } from "@/lib/simli-talk";
import { addRule, findMatches, type Rule } from "@/lib/rules";

const FACE_KEY = "kingdom_simli_face";
const DONE = /complete|success|done|ready|finished/i;
const BAD = /fail|error/i;

export function LiveVideoCall({ rules = [], storeId, reload }: { rules?: Rule[]; storeId?: string | undefined; reload?: () => Promise<void> } = {}) {
  const mkRoom = useServerFn(roomCreate);
  const watch = useServerFn(roomWatch);
  const pushFn = useServerFn(roomPush);
  const [typed, setTyped] = useState("");
  const [teachQ, setTeachQ] = useState("");
  const [teachA, setTeachA] = useState("");
  const [room, setRoom] = useState("");
  const [roomLog, setRoomLog] = useState<{ who: "c" | "a"; t: string }[]>([]);
  const [roomSnap, setRoomSnap] = useState("");
  const [roomEnded, setRoomEnded] = useState(false);
  const [roomSay, setRoomSay] = useState("");
  const seqRef = useRef({ cur: 0 });
  const rulesRef = useRef(rules);
  useEffect(() => { rulesRef.current = rules; }, [rules]);
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
    if (f.size > 10_000_000) { toast.error("الصورة كبيرة، أقل من 10 ميجا"); return; }
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
    // إرسال بتوقيت حقيقي = شفايف مطابقة للصوت
    await sendPaced(c, pcm, () => liveRef.current, seqRef.current);
  };

  const onHeard = async (text: string) => {
    if (busyRef.current || !liveRef.current) return;
    busyRef.current = true; setHeard(text);
    setLog((l) => [...l, { who: "c", t: text }]);
    try { recRef.current?.stop(); } catch { /* ignore */ }
    try {
      const hit = findMatches(text, rulesRef.current, 1)[0];
      if (hit && hit.score >= 0.75) { if (liveRef.current) await speak(hit.rule.response_text); throw "done"; }
      const { reply } = await smart({ data: { customer: text.slice(0, 1000), product: "", rules: rulesRef.current.slice(0, 60).map((r) => ({ trigger: r.trigger_text.slice(0, 500), response: r.response_text.slice(0, 2000) })), mood: "call", history: logRef.current.slice(-4).map((m) => ({ who: m.who, t: m.t.slice(0, 400) })) } });
      if (reply && liveRef.current) await speak(reply);
    } catch (e) { if (e !== "done") toast.error((e as Error).message); }
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

  // نطق جملة مكتوبة مباشرة (تقاطع أي كلام)
  const sayNow = async (t: string) => {
    if (!t.trim() || !clientRef.current) return;
    seqRef.current.cur++;
    busyRef.current = true;
    try { recRef.current?.stop(); } catch { /* ignore */ }
    try { await speak(t.trim()); } catch (e) { toast.error((e as Error).message); }
    busyRef.current = false;
    if (liveRef.current) { try { recRef.current?.start(); } catch { /* ignore */ } }
  };
  const teach = async (speakToo: boolean) => {
    const q = teachQ.trim(), a = teachA.trim();
    if (!a) { toast.error("اكتب الرد"); return; }
    if (q) {
      const { error } = await addRule(q, a, storeId);
      if (error) toast.error("تعذر الحفظ"); else { toast.success("🧠 تعلّمته وانحفظ"); void reload?.(); }
    }
    if (speakToo) { if (room) await pushFn({ data: { id: room, text: a } }).catch(() => {}); else void sayNow(a); }
    setTeachA(""); if (q) setTeachQ("");
  };

  const shareRoom = async () => {
    if (!ready) { toast.error("جهّز الوجه أول"); return; }
    try {
      const v = loadVoice();
      const { id } = await mkRoom({ data: {
        faceId, storeId: storeId ?? null, preview: preview.length < 4000 ? preview : "",
        voice: { voiceId: getStudioVoice() || v.voiceId, speed: v.speed, emotion: v.emotion },
        rules: rules.slice(0, 200).map((r) => ({ trigger: r.trigger_text.slice(0, 500), response: r.response_text.slice(0, 2000) })),
      } });
      setRoom(id); setRoomLog([]); setRoomSnap(""); setRoomEnded(false);
      const url = `${window.location.origin}/v/${id}`;
      try { await navigator.clipboard.writeText(url); toast.success("🔗 انسخ الرابط — أرسله للشخص"); } catch { toast.success("الرابط جاهز تحت"); }
    } catch (e) { toast.error((e as Error).message); }
  };
  useEffect(() => {
    if (!room) return undefined;
    let stop = false;
    const tick = async () => {
      try { const r = await watch({ data: { id: room } }); if (stop) return; setRoomLog(r.log); setRoomSnap(r.snap); setRoomEnded(r.ended); } catch { /* ignore */ }
      if (!stop) setTimeout(tick, 2500);
    };
    void tick();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);
  const roomUrl = room && typeof window !== "undefined" ? `${window.location.origin}/v/${room}` : "";

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
          <div className="flex gap-2">
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="✍️ اكتب كلام الزبون — ترد عليه" onKeyDown={(e) => { if (e.key === "Enter" && typed.trim()) { void onHeard(typed.trim()); setTyped(""); } }} />
            <Button variant="secondary" onClick={() => { if (typed.trim()) { void onHeard(typed.trim()); setTyped(""); } }}>أرسل</Button>
          </div>
          <Button className="w-full" size="lg" variant="destructive" onClick={end}>⛔ إنهاء المكالمة</Button>
        </div>
      )}
      <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
        <p className="text-sm font-bold">🧠 علّمها / قوليه</p>
        <Input value={teachQ} onChange={(e) => setTeachQ(e.target.value)} placeholder="لو قال الزبون… (اختياري للحفظ)" />
        <Input value={teachA} onChange={(e) => setTeachA(e.target.value)} placeholder="ترد عليه بـ…" onKeyDown={(e) => { if (e.key === "Enter") void teach(true); }} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!live && !room} onClick={() => void teach(true)}>🗣️ قوليه الحين{teachQ.trim() ? " + احفظ" : ""}</Button>
          <Button size="sm" variant="secondary" disabled={!teachQ.trim()} onClick={() => void teach(false)}>💾 احفظ فقط</Button>
        </div>
        <p className="text-xs text-muted-foreground">الرد المتعلّم له أولوية: لو قال الزبون نفس الكلام ترد فيه فوراً.</p>
      </div>

      <div className="space-y-2 rounded-xl border border-primary/40 p-3">
        <p className="text-sm font-bold">🔗 أرسل رابط مكالمة لشخص</p>
        <p className="text-xs text-muted-foreground">يفتح الرابط من جواله، يرن عنده، يرد ويشوفها وتسمعه، وأنت تتابع وتتدخل من هنا. الرابط صالح 24 ساعة.</p>
        <Button className="w-full" disabled={!ready} onClick={shareRoom}>{room ? "🔁 رابط جديد" : "🔗 أنشئ وانسخ الرابط"}</Button>
        {room && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input readOnly value={roomUrl} className="text-xs" dir="ltr" />
              <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard.writeText(roomUrl); toast.success("انسخ"); }}>نسخ</Button>
              <Button size="sm" variant="secondary" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(roomUrl)}`, "_blank")}>واتساب</Button>
            </div>
            <div className="flex gap-3">
              {roomSnap ? <img src={roomSnap} alt="الزبون" className="h-24 w-20 rounded-lg object-cover" /> : <div className="flex h-24 w-20 items-center justify-center rounded-lg bg-muted text-xs">📷 بانتظار</div>}
              <div className="max-h-40 flex-1 space-y-1 overflow-y-auto rounded-lg bg-muted p-2 text-xs">
                {roomEnded && <p className="font-bold text-destructive">انتهت المكالمة</p>}
                {roomLog.length === 0 && <p className="text-muted-foreground">لما يرد تظهر المحادثة هنا…</p>}
                {roomLog.map((m, i) => <div key={i} className={m.who === "a" ? "text-primary" : ""}>{m.who === "a" ? "هي: " : "هو: "}{m.t}</div>)}
              </div>
            </div>
            <div className="flex gap-2">
              <Input value={roomSay} onChange={(e) => setRoomSay(e.target.value)} placeholder="اكتب جملة تقولها له فوراً" onKeyDown={(e) => { if (e.key === "Enter" && roomSay.trim()) { void pushFn({ data: { id: room, text: roomSay.trim() } }); setRoomSay(""); } }} />
              <Button size="sm" onClick={() => { if (roomSay.trim()) { void pushFn({ data: { id: room, text: roomSay.trim() } }); setRoomSay(""); toast.success("راحت"); } }}>🗣️ قوليه</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
