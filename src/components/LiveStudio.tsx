import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fishSpeak, smartReply } from "@/lib/ai.functions";
import { STUDIO_VOICES } from "@/lib/studio-voices";
import { VOICE_MODELS, type VoiceModel } from "@/lib/voice-model";

type EvType = "comment" | "gift" | "follow" | "like" | "join" | "share";
type Ev = { id: string; type: EvType; user: string; text?: string; gift?: string; count?: number; at: number; sim?: boolean };
type QItem = { id: string; label: string; text: string; status: "thinking" | "ready" | "speaking" | "error" };

const LS = "live_studio_v1";
const DEF = {
  username: "", apiKey: "",
  persona: { name: "نورة", role: "مضيفة بث صوتي على تيك توك", personality: "مرحة، خفيفة دم، ذكية وتحب السوالف، ترحب بالناس بحرارة وتشكرهم.", dialect: "سعودية", rules: "", topicStyle: "تبدأ بموقف أو سؤال من الحياة اليومية ثم تسأل الحضور.", topics: ["القهوة أو الشاي؟", "أغرب موقف صار لكم في السفر", "أكلة ما تملون منها", "حلم الطفولة"], avatar: "" },
  voice: { id: STUDIO_VOICES[0]![0], model: "s2.1-pro" as VoiceModel, speed: 1, gain: 0, emotion: "", volume: 1, device: "" },
  auto: { enabled: false, comments: true, gifts: true, follows: true, likes: false, joins: true, shares: true, ai: false, idle: true, idleSec: 60, likeTh: 100, joinCd: 20, userCd: 30 },
  filters: { banned: [] as string[], blocked: [] as string[], minLen: 2, onlyQ: false, noLinks: true, maxQ: 8 },
  tpl: { gift: "يا عيني على {name}! شكراً على {gift} {count}، ربي يسعدك", follow: "هلا والله {name}، شكراً على المتابعة ونورت البث", like: "شكراً {name} على اللايكات، كملوا الدعم", join: "يا هلا {name}، نورت البث", share: "شكراً {name} على المشاركة، الله يجزاك خير" },
};
type S = typeof DEF;
const QUICK = ["يا هلا ومرحبا بكل اللي دخلوا، نورتوا البث", "لا تنسون المتابعة واللايك عشان يوصل البث لناس أكثر", "اكتبوا لي بالتعليقات من وين تتابعوننا", "شكراً لكل الداعمين، والله إنكم أحلى جمهور"];
const GIFTS = ["وردة", "تيك توك", "قلب", "مجرة", "أسد"];
const NAMES = ["أبو فهد", "نوف", "سلطان", "ريم", "عبدالله", "جوري", "فيصل"];
const COMMENTS = ["وش أخبارك اليوم؟", "من وين انتي؟", "سلام عليكم", "صوتك حلو", "وش رايك بالقهوة؟"];
const ICON: Record<EvType, string> = { comment: "💬", gift: "🎁", follow: "➕", like: "❤️", join: "🚪", share: "🔁" };
const EMOS = [["", "طبيعي"], ["happy", "😊 فرحانة"], ["excited", "🤩 متحمسة"], ["friendly", "🤗 ودودة"], ["calm", "😌 هادئة"]] as const;
let n = 0; const uid = () => `${Date.now().toString(36)}${n++}`;
const fill = (t: string, e: Ev) => t.replace(/\{name\}/g, e.user).replace(/\{gift\}/g, e.gift ?? "").replace(/\{count\}/g, e.count && e.count > 1 ? `×${e.count}` : "");

function parseEuler(m: any): Ev | { viewers: number } | null {
  const t = String(m?.type ?? m?.event ?? "").replace(/^Webcast/, "").replace(/Message$/, "").toLowerCase();
  const d = m?.data ?? m; const u = d?.user ?? {}; const user = String(u.nickname || u.uniqueId || "متابع"); const at = Date.now();
  if (t === "chat") return { id: uid(), type: "comment", user, text: String(d.comment ?? ""), at };
  if (t === "gift") return { id: uid(), type: "gift", user, gift: String(d.giftDetails?.giftName ?? d.giftName ?? "هدية"), count: Number(d.repeatCount ?? 1) || 1, at };
  if (t === "like") return { id: uid(), type: "like", user, count: Number(d.likeCount ?? d.count ?? 1) || 1, at };
  if (t === "member") return { id: uid(), type: "join", user, at };
  if (t === "follow" || t === "social") return { id: uid(), type: t === "social" ? "share" : "follow", user, at };
  if (t === "roomuserseq") { const v = Number(d.viewerCount); return Number.isFinite(v) ? { viewers: v } : null; }
  return null;
}

export function LiveStudio() {
  const [s, setS] = useState<S>(DEF);
  const [tab, setTab] = useState<"settings" | "persona" | "sim">("sim");
  const [conn, setConn] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [viewers, setViewers] = useState(0);
  const [events, setEvents] = useState<Ev[]>([]);
  const [filter, setFilter] = useState<EvType | "all">("all");
  const [queue, setQueue] = useState<QItem[]>([]);
  const [manual, setManual] = useState("");
  const [paused, setPaused] = useState(false);
  const [listening, setListening] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [simUser, setSimUser] = useState("أبو فهد");
  const [simText, setSimText] = useState("وش أخبارك اليوم؟");
  const [simGift, setSimGift] = useState("وردة");
  const [simCount, setSimCount] = useState(5);
  const [simLikes, setSimLikes] = useState(150);
  const [topic, setTopic] = useState("");
  const speak = useServerFn(fishSpeak);
  const smart = useServerFn(smartReply);
  const ws = useRef<WebSocket | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const playing = useRef(false);
  const sRef = useRef(s); sRef.current = s;
  const qRef = useRef(queue); qRef.current = queue;
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const lastAct = useRef(Date.now());
  const cds = useRef(new Map<string, number>());
  const likes = useRef(new Map<string, number>());
  const history = useRef<{ who: "c" | "a"; t: string }[]>([]);
  const recent = useRef<string[]>([]);

  useEffect(() => { try { const j = JSON.parse(localStorage.getItem(LS) || "{}"); setS((p) => ({ ...p, ...j, persona: { ...p.persona, ...j.persona }, voice: { ...p.voice, ...j.voice }, auto: { ...p.auto, ...j.auto }, filters: { ...p.filters, ...j.filters }, tpl: { ...p.tpl, ...j.tpl } })); } catch { /* */ } }, []);
  useEffect(() => { try { localStorage.setItem(LS, JSON.stringify(s)); } catch { /* */ } }, [s]);
  useEffect(() => () => { ws.current?.close(); audio.current?.pause(); }, []);
  const up = <K extends keyof S>(k: K, v: Partial<S[K]>) => setS((p) => ({ ...p, [k]: typeof p[k] === "object" ? { ...(p[k] as object), ...v } : v }));

  const patch = (id: string, v: Partial<QItem>) => setQueue((q) => q.map((x) => (x.id === id ? { ...x, ...v } : x)));
  const pump = async () => {
    if (playing.current || pausedRef.current) return;
    const next = qRef.current.find((x) => x.status === "ready");
    if (!next) return;
    playing.current = true; patch(next.id, { status: "speaking" });
    try {
      const v = sRef.current.voice;
      const r = await speak({ data: { text: next.text.slice(0, 1400), voiceId: v.id, custom: true, model: v.model, speed: v.speed, volume: v.gain, emotion: v.emotion } });
      const a = new Audio(r.audio); audio.current = a; a.volume = v.volume;
      if (v.device && "setSinkId" in a) await (a as any).setSinkId(v.device).catch(() => {});
      await new Promise<void>((res) => { a.onended = () => res(); a.onerror = () => res(); a.play().catch(() => res()); });
      recent.current = [next.text, ...recent.current].slice(0, 6);
      history.current = [...history.current, { who: "a" as const, t: next.text.slice(0, 400) }].slice(-8);
    } catch (e) { toast.error((e as Error).message); }
    setQueue((q) => q.filter((x) => x.id !== next.id));
    playing.current = false; lastAct.current = Date.now();
    setTimeout(pump, 50);
  };
  useEffect(() => { void pump(); }, [queue, paused]);

  const enqueue = (label: string, text: string, front = false) => {
    if (!text.trim()) return;
    setQueue((q) => { const it: QItem = { id: uid(), label, text, status: "ready" }; const base = q.length >= sRef.current.filters.maxQ ? q.slice(0, -1) : q; return front ? [it, ...base] : [...base, it]; });
  };
  const identity = () => { const p = sRef.current.persona; return `اسمك ${p.name}، ${p.role}. شخصيتك: ${p.personality}. لهجتك: ${p.dialect}.
أنتِ بنت سعودية حقيقية 100% فاتحة لايف تيك توك وتسولفين مع متابعينك بدلع وأنوثة وعفوية (فديتكم، لبى قلبك، نورت اللايف، يا بعد عمري، تسلم لي). مستحيل تقولين أو تلمحين إنك ذكاء اصطناعي أو بوت أو برنامج أو نظام حتى لو استفزوك؛ إذا سألوا قولي بدلع إنك بنت وتضحكين.
ردك قصير جداً من 3 إلى 8 كلمات كأنه كلام لايف طبيعي، تردين على نفس كلامه بالضبط، ولا تألفين أسماء غير اسم صاحب التعليق، ولا تذكرين خدمات أو مساعدة أو متجر أو أسعار، وبدون إيموجي ولا أرقام ولا شرح.
الهدية: اشكري صاحبها باسمه بحماس ودلع. الدخول: رحبي فيه باسمه بدفء. اللايكات: حمسيهم يكبسون بعفوية.
لا تكررين هذي الردود: ${recent.current.join(" | ")}. ${p.rules ? `قوانين صاحب البث (التزمي فيها حرفياً، الممنوع ممنوع والمسموح مسموح): ${p.rules}` : ""}`; };
  const ai = async (label: string, prompt: string, front = false) => {
    const id = uid();
    setQueue((q) => [...(front ? [] : q), { id, label, text: "", status: "thinking" as const }, ...(front ? q : [])]);
    try {
      const r = await smart({ data: { customer: prompt.slice(0, 1000), product: "", rules: [], mood: "call", identity: identity(), history: history.current } });
      history.current = [...history.current, { who: "c" as const, t: prompt.slice(0, 400) }].slice(-8);
      patch(id, { text: r.reply, status: "ready" });
    } catch (e) { patch(id, { status: "error", text: (e as Error).message }); setTimeout(() => setQueue((q) => q.filter((x) => x.id !== id)), 4000); }
  };
  const openTopic = (t?: string) => { const p = sRef.current.persona; const pick = t || p.topics[Math.floor(Math.random() * p.topics.length)] || "سالفة خفيفة"; void ai(`سالفة: ${pick}`, `البث هادئ الحين، افتحي للحضور سالفة عن: ${pick}. ${p.topicStyle} واختمي بسؤال بسيط.`, true); };

  const handle = (e: Ev) => {
    lastAct.current = Date.now();
    setEvents((l) => [e, ...l].slice(0, 200));
    const st = sRef.current; const a = st.auto, f = st.filters;
    if (!a.enabled || f.blocked.some((b) => b && e.user.includes(b))) return;
    const now = Date.now(); const cdKey = `${e.type}:${e.user}`; const cd = (e.type === "join" ? a.joinCd : a.userCd) * 1000;
    if ((cds.current.get(cdKey) ?? 0) > now - cd) return;
    if (e.type === "comment") {
      if (!a.comments) return; const t = (e.text ?? "").trim();
      if (t.length < f.minLen || (f.noLinks && /https?:|www\./.test(t)) || (f.onlyQ && !/[؟?]|وش|كيف|ليش|متى|وين|مين|هل/.test(t)) || f.banned.some((b) => b && t.includes(b))) return;
      cds.current.set(cdKey, now); void ai(`💬 ${e.user}`, `${e.user} كتب في التعليقات: ${t}. ردي عليه بكلمات قليلة ودلع.`); return;
    }
    if (e.type === "like") { if (!a.likes) return; const c = (likes.current.get(e.user) ?? 0) + (e.count ?? 1); if (c < a.likeTh) { likes.current.set(e.user, c); return; } likes.current.set(e.user, 0); }
    const on = { gift: a.gifts, follow: a.follows, like: a.likes, join: a.joins, share: a.shares }[e.type as Exclude<EvType, "comment">];
    if (!on) return; cds.current.set(cdKey, now);
    const tpl = fill(st.tpl[e.type as keyof S["tpl"]], e);
    if (a.ai) void ai(`${ICON[e.type]} ${e.user}`, `حدث في البث: ${tpl}. علّقي برد قصير جداً بدلع سعودي.`); else enqueue(`${ICON[e.type]} ${e.user}`, tpl);
  };
  const handleRef = useRef(handle); handleRef.current = handle;

  useEffect(() => {
    const t = setInterval(() => { const st = sRef.current; if (st.auto.enabled && st.auto.idle && !playing.current && qRef.current.length === 0 && Date.now() - lastAct.current > st.auto.idleSec * 1000) { lastAct.current = Date.now(); openTopic(); } }, 5000);
    return () => clearInterval(t);
  }, []);

  const connect = () => {
    if (ws.current) { ws.current.close(); ws.current = null; setConn("idle"); return; }
    const u = s.username.trim().replace(/^@/, ""); if (!u || !s.apiKey.trim()) { toast.error("اكتب اسم الحساب ومفتاح Euler Stream من الإعدادات"); setTab("settings"); return; }
    setConn("connecting");
    const w = new WebSocket(`wss://ws.eulerstream.com?uniqueId=${encodeURIComponent(u)}&apiKey=${encodeURIComponent(s.apiKey.trim())}`);
    ws.current = w;
    w.onopen = () => { setConn("connected"); toast.success("اتصلنا بالبث 🔴"); };
    w.onerror = () => setConn("error");
    w.onclose = (ev) => { if (ws.current === w) ws.current = null; setConn((c) => (c === "error" ? c : "idle")); if (ev.reason) toast.error(ev.reason); };
    w.onmessage = (ev) => { try { const d = JSON.parse(ev.data); for (const m of Array.isArray(d?.messages) ? d.messages : [d]) { const p = parseEuler(m); if (!p) continue; if ("viewers" in p) setViewers(p.viewers); else handleRef.current(p); } } catch { /* */ } };
  };

  const talk = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error("متصفحك ما يدعم التحدث، جرب كروم"); return; }
    const r = new SR(); r.lang = "ar-SA"; r.interimResults = false;
    r.onresult = (e: any) => { const t = e.results[0][0].transcript; if (t) void ai("🎙️ صاحب البث", `صاحب البث يكلمك الآن على الهواء ويقول: ${t}. ردي عليه كأنكم تتحاورون أمام الحضور.`, true); };
    r.onend = () => setListening(false); r.onerror = () => setListening(false);
    setListening(true); r.start();
  };
  const skip = () => { audio.current?.pause(); audio.current?.dispatchEvent(new Event("ended")); };
  const loadDevices = async () => { try { await navigator.mediaDevices.getUserMedia({ audio: true }).then((st) => st.getTracks().forEach((t) => t.stop())).catch(() => {}); setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audiooutput")); } catch { toast.error("ما قدرنا نقرأ أجهزة الصوت"); } };
  const sim = (e: Omit<Ev, "id" | "at">) => handle({ ...e, id: uid(), at: Date.now(), sim: true });
  const rnd = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]!;
  const wave = () => { const types: EvType[] = ["comment", "gift", "follow", "join", "share", "like"]; for (let i = 0; i < 6; i++) setTimeout(() => { const t = types[i]!; sim({ type: t, user: rnd(NAMES), text: rnd(COMMENTS), gift: rnd(GIFTS), count: t === "like" ? 120 : Math.ceil(Math.random() * 5) }); }, i * 700); };

  const counts = events.reduce((m, e) => ({ ...m, [e.type]: (m[e.type] ?? 0) + 1 }), {} as Record<string, number>);
  const speaking = queue.some((q) => q.status === "speaking");
  const card = "rounded-2xl border bg-card p-4";
  const Toggle = ({ label, v, on }: { label: string; v: boolean; on: (b: boolean) => void }) => (
    <label className="flex items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2 text-sm"><span>{label}</span><input type="checkbox" checked={v} onChange={(e) => on(e.target.checked)} className="size-5 accent-primary" /></label>
  );
  const Num = ({ label, v, on }: { label: string; v: number; on: (x: number) => void }) => (
    <label className="text-xs text-muted-foreground">{label}<Input type="number" value={v} onChange={(e) => on(Number(e.target.value) || 0)} className="mt-1" /></label>
  );

  return (
    <div className="space-y-4">
      <section className={`${card} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="font-display text-xl">🔴 استوديو البث الذكي</h2><p className="text-xs text-muted-foreground">موظفتك ترد على بث تيك توك بصوت من أصوات موقعك</p></div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${conn === "connected" ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-muted text-muted-foreground"}`}>{conn === "connected" ? "● ON AIR" : conn === "connecting" ? "جاري الاتصال…" : conn === "error" ? "خطأ اتصال" : "غير متصل"} · 👁 {viewers}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input value={s.username} onChange={(e) => up("username", e.target.value as never)} placeholder="@username" className="flex-1 min-w-[140px]" dir="ltr" />
          <Button onClick={connect} variant={ws.current ? "secondary" : "default"}>{ws.current ? "⏹ قطع" : "🔗 اتصال بالبث"}</Button>
        </div>
        <Toggle label="🤖 الرد التلقائي" v={s.auto.enabled} on={(b) => up("auto", { enabled: b })} />
        <div className="grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-6">
          {(Object.keys(ICON) as EvType[]).map((k) => <div key={k} className="rounded-xl bg-muted/50 py-2"><div className="text-lg">{ICON[k]}</div>{counts[k] ?? 0}</div>)}
        </div>
      </section>

      <section className={`${card} flex flex-col items-center gap-3 text-center`}>
        <div className={`size-32 overflow-hidden rounded-full border-4 ${speaking ? "border-primary animate-pulse" : "border-border"} bg-muted flex items-center justify-center text-5xl`}>
          {s.persona.avatar ? <img src={s.persona.avatar} alt={s.persona.name} className="size-full object-cover" /> : "👩🏻‍💼"}
        </div>
        <div><div className="font-display text-lg">{s.persona.name}</div><div className="text-xs text-muted-foreground">{speaking ? "🔊 تتكلم الحين…" : queue.some((q) => q.status === "thinking") ? "💭 تفكر…" : "جاهزة"}</div></div>
        <Button className="w-full" size="lg" onClick={talk} disabled={listening}>{listening ? "🎙️ أسمعك… تكلم" : "🎙️ كلّمها بصوتك"}</Button>
        <div className="grid w-full grid-cols-3 gap-2">
          <Button variant="secondary" onClick={() => openTopic()}>✨ افتحي سالفة</Button>
          <Button variant="secondary" onClick={skip}>⏭ تخطي</Button>
          <Button variant="secondary" onClick={() => setPaused((p) => !p)}>{paused ? "▶ استئناف" : "⏸ إيقاف"}</Button>
        </div>
      </section>

      <section className={card}>
        <h3 className="mb-2 font-semibold">✍️ رد يدوي</h3>
        <Textarea value={manual} onChange={(e) => setManual(e.target.value)} rows={3} placeholder="اكتب جملة تقولها الموظفة، أو فكرة وخلّ الذكاء يصيغها بأسلوبها" />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button disabled={!manual.trim()} onClick={() => { enqueue("✍️ يدوي", manual, true); setManual(""); }}>📣 قوليها الآن</Button>
          <Button variant="secondary" disabled={!manual.trim()} onClick={() => { enqueue("✍️ يدوي", manual); setManual(""); }}>➕ للطابور</Button>
          <Button variant="secondary" disabled={!manual.trim()} onClick={() => { void ai("🪄 صياغة", `صاحب البث يبيك تقولين للحضور هالفكرة بأسلوبك: ${manual}`, true); setManual(""); }}>🪄 صيغيها بأسلوبك</Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">{QUICK.map((q) => <button key={q} onClick={() => enqueue("⚡ سريع", q)} className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground">{q}</button>)}</div>
      </section>

      <section className={card}>
        <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">🔊 طابور الردود الصوتية</h3><button onClick={() => setQueue((q) => q.filter((x) => x.status === "speaking"))} className="text-xs text-muted-foreground">🗑 مسح</button></div>
        {queue.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">الطابور فاضي</p> : (
          <ul className="space-y-2">{queue.map((q) => (
            <li key={q.id} className={`rounded-xl px-3 py-2 text-sm ${q.status === "speaking" ? "bg-primary/15" : q.status === "error" ? "bg-destructive/15" : "bg-muted/50"}`}>
              <div className="flex justify-between text-xs text-muted-foreground"><span>{q.label}</span><span>{{ thinking: "💭 تفكر", ready: "⏳ بالدور", speaking: "🔊 تتكلم", error: "⚠️ خطأ" }[q.status]}</span></div>
              {q.text && <div className="mt-1">{q.text}</div>}
            </li>))}</ul>)}
      </section>

      <section className={card}>
        <h3 className="mb-2 font-semibold">📡 أحداث البث</h3>
        <div className="mb-2 flex gap-1.5 overflow-x-auto">{(["all", ...Object.keys(ICON)] as const).map((k) => <button key={k} onClick={() => setFilter(k as EvType | "all")} className={`shrink-0 rounded-full px-3 py-1 text-xs ${filter === k ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{k === "all" ? "الكل" : ICON[k as EvType]}</button>)}</div>
        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {events.filter((e) => filter === "all" || e.type === filter).map((e) => (
            <li key={e.id} className="flex items-start gap-2 rounded-lg bg-muted/40 px-2 py-1.5 text-sm">
              <span>{ICON[e.type]}</span>
              <div className="min-w-0 flex-1"><b>{e.user}</b> {e.sim && <span className="text-[10px] text-muted-foreground">(محاكاة)</span>}<div className="text-xs text-muted-foreground">{e.type === "comment" ? e.text : e.type === "gift" ? `${e.gift} ×${e.count}` : e.type === "like" ? `${e.count} لايك` : { follow: "تابع", join: "دخل البث", share: "شارك البث" }[e.type]}</div></div>
              {e.type === "comment" && <button onClick={() => void ai(`💬 ${e.user}`, `${e.user} كتب: ${e.text}. ردي عليه.`, true)} className="text-xs text-primary">ردي</button>}
            </li>))}
          {events.length === 0 && <li className="py-4 text-center text-sm text-muted-foreground">ما فيه أحداث بعد — جرب المحاكاة</li>}
        </ul>
      </section>

      <div className="flex gap-1 rounded-2xl bg-muted p-1">
        {([["sim", "🧪 المحاكاة"], ["persona", "✨ الشخصية"], ["settings", "⚙️ الإعدادات"]] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-xl py-2 text-sm ${tab === k ? "bg-background font-semibold" : "text-muted-foreground"}`}>{l}</button>)}
      </div>

      {tab === "sim" && (
        <div className="space-y-3">
          {!s.auto.enabled && <p className="rounded-xl bg-muted p-2 text-center text-xs">شغّل «الرد التلقائي» فوق عشان ترد الموظفة على المحاكاة</p>}
          <section className={`${card} space-y-2`}>
            <div className="flex gap-2"><Input value={simUser} onChange={(e) => setSimUser(e.target.value)} placeholder="اسم المتابع" /><Button variant="secondary" onClick={() => setSimUser(rnd(NAMES))}>🎲</Button></div>
            <Button className="w-full" onClick={wave}>⚡ موجة أحداث عشوائية</Button>
          </section>
          <section className={`${card} space-y-2`}><h4 className="font-semibold">💬 تعليق</h4>
            <Input value={simText} onChange={(e) => setSimText(e.target.value)} />
            <div className="flex gap-2"><Button className="flex-1" onClick={() => sim({ type: "comment", user: simUser, text: simText })}>إرسال تعليق</Button><Button variant="secondary" onClick={() => setSimText(rnd(COMMENTS))}>🎲</Button></div>
          </section>
          <section className={`${card} space-y-2`}><h4 className="font-semibold">🎁 هدية</h4>
            <div className="flex gap-2"><Input value={simGift} onChange={(e) => setSimGift(e.target.value)} /><Input type="number" value={simCount} onChange={(e) => setSimCount(Number(e.target.value) || 1)} className="w-20" /></div>
            <div className="flex flex-wrap gap-1.5">{GIFTS.map((g) => <button key={g} onClick={() => setSimGift(g)} className="rounded-full border px-2.5 py-1 text-xs">{g}</button>)}</div>
            <Button onClick={() => sim({ type: "gift", user: simUser, gift: simGift, count: simCount })}>إرسال هدية</Button>
          </section>
          <section className={`${card} space-y-2`}><h4 className="font-semibold">❤️ لايكات</h4>
            <Input type="number" value={simLikes} onChange={(e) => setSimLikes(Number(e.target.value) || 1)} />
            <p className="text-xs text-muted-foreground">تشكر بعد كل {s.auto.likeTh} لايك من نفس الشخص</p>
            <Button onClick={() => sim({ type: "like", user: simUser, count: simLikes })}>إرسال لايكات</Button>
          </section>
          <div className="grid grid-cols-3 gap-2">
            {(["follow", "join", "share"] as const).map((t) => <button key={t} onClick={() => sim({ type: t, user: simUser })} className={`${card} text-sm`}><div className="text-2xl">{ICON[t]}</div>{{ follow: "متابعة", join: "دخول", share: "مشاركة" }[t]}</button>)}
          </div>
        </div>
      )}

      {tab === "persona" && (
        <div className="space-y-3">
          <section className={`${card} space-y-2`}><h4 className="font-semibold">هوية الموظفة</h4>
            {([["name", "الاسم"], ["dialect", "اللهجة"], ["role", "الدور"]] as const).map(([k, l]) => <label key={k} className="block text-xs text-muted-foreground">{l}<Input value={s.persona[k]} onChange={(e) => up("persona", { [k]: e.target.value })} className="mt-1" /></label>)}
            <label className="block text-xs text-muted-foreground">الشخصية وطريقة الكلام<Textarea rows={3} value={s.persona.personality} onChange={(e) => up("persona", { personality: e.target.value })} className="mt-1" /></label>
            <label className="block text-xs text-muted-foreground">قواعد خاصة<Textarea rows={2} value={s.persona.rules} onChange={(e) => up("persona", { rules: e.target.value })} placeholder="مثال: لا تتكلمين عن السياسة" className="mt-1" /></label>
            <div className="flex gap-2">
              <label className="cursor-pointer rounded-md border px-3 py-2 text-sm">🖼 رفع صورة<input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => { const img = new Image(); img.onload = () => { const c = document.createElement("canvas"); c.width = c.height = 256; const m = Math.min(img.width, img.height); c.getContext("2d")!.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, 256, 256); up("persona", { avatar: c.toDataURL("image/jpeg", 0.85) }); }; img.src = String(r.result); }; r.readAsDataURL(f); }} /></label>
              <Button variant="ghost" onClick={() => up("persona", { avatar: "" })}>↺ الافتراضية</Button>
            </div>
          </section>
          <section className={`${card} space-y-2`}><div className="flex items-center justify-between"><h4 className="font-semibold">فتح السوالف</h4><Button size="sm" onClick={() => openTopic()}>✨ جربي الآن</Button></div>
            <Textarea rows={2} value={s.persona.topicStyle} onChange={(e) => up("persona", { topicStyle: e.target.value })} />
            <div className="flex gap-2"><Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="أضف موضوعاً" /><Button variant="secondary" onClick={() => { if (topic.trim()) { up("persona", { topics: [...s.persona.topics, topic.trim()] }); setTopic(""); } }}>إضافة</Button></div>
            <div className="flex flex-wrap gap-1.5">{s.persona.topics.map((t, i) => <span key={i} className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"><button onClick={() => openTopic(t)}>{t}</button><button onClick={() => up("persona", { topics: s.persona.topics.filter((_, j) => j !== i) })}>✕</button></span>)}</div>
            <Button variant="ghost" size="sm" onClick={() => up("persona", DEF.persona)}>↺ استعادة الشخصية الافتراضية</Button>
          </section>
        </div>
      )}

      {tab === "settings" && (
        <div className="space-y-3">
          <section className={`${card} space-y-2`}><h4 className="font-semibold">🎙️ الصوت (من أصوات موقعك)</h4>
            <label className="block text-xs text-muted-foreground">صوت الموظفة<select value={s.voice.id} onChange={(e) => up("voice", { id: e.target.value })} className="mt-1 w-full rounded-md border bg-background p-2 text-sm">{STUDIO_VOICES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></label>
            <label className="block text-xs text-muted-foreground">أو رقم صوت مستنسخ<Input value={s.voice.id} onChange={(e) => up("voice", { id: e.target.value.trim() })} dir="ltr" className="mt-1" /></label>
            <label className="block text-xs text-muted-foreground">الموديل<select value={s.voice.model} onChange={(e) => up("voice", { model: e.target.value as VoiceModel })} className="mt-1 w-full rounded-md border bg-background p-2 text-sm">{VOICE_MODELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <div className="flex flex-wrap gap-1.5">{EMOS.map(([k, l]) => <button key={k} onClick={() => up("voice", { emotion: k })} className={`rounded-full px-3 py-1 text-xs ${s.voice.emotion === k ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{l}</button>)}</div>
            <label className="block text-xs text-muted-foreground">السرعة {s.voice.speed.toFixed(2)}<input type="range" min={0.7} max={1.4} step={0.05} value={s.voice.speed} onChange={(e) => up("voice", { speed: Number(e.target.value) })} className="w-full accent-primary" /></label>
            <label className="block text-xs text-muted-foreground">قوة الصوت {s.voice.gain}<input type="range" min={-6} max={6} step={1} value={s.voice.gain} onChange={(e) => up("voice", { gain: Number(e.target.value) })} className="w-full accent-primary" /></label>
            <label className="block text-xs text-muted-foreground">مستوى السماع {Math.round(s.voice.volume * 100)}%<input type="range" min={0} max={1} step={0.05} value={s.voice.volume} onChange={(e) => up("voice", { volume: Number(e.target.value) })} className="w-full accent-primary" /></label>
            <div className="flex gap-2"><select value={s.voice.device} onChange={(e) => up("voice", { device: e.target.value })} className="flex-1 rounded-md border bg-background p-2 text-sm"><option value="">مخرج الصوت الافتراضي</option>{devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "جهاز صوت"}</option>)}</select><Button variant="secondary" onClick={loadDevices}>🔄</Button></div>
            <Button className="w-full" onClick={() => enqueue("🧪 تجربة", `هلا والله، أنا ${s.persona.name} ومعكم في البث`, true)}>▶ اختبر الصوت</Button>
          </section>
          <section className={`${card} space-y-2`}><h4 className="font-semibold">🤖 الرد التلقائي</h4>
            <div className="grid grid-cols-2 gap-2">
              {([["comments", "التعليقات"], ["gifts", "الهدايا"], ["follows", "المتابعات"], ["likes", "اللايكات"], ["joins", "الدخول"], ["shares", "المشاركات"], ["ai", "ذكاء للأحداث"], ["idle", "سوالف عند الهدوء"]] as const).map(([k, l]) => <Toggle key={k} label={l} v={s.auto[k]} on={(b) => up("auto", { [k]: b })} />)}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Num label="سكوت قبل السالفة (ث)" v={s.auto.idleSec} on={(x) => up("auto", { idleSec: x })} />
              <Num label="حد اللايكات" v={s.auto.likeTh} on={(x) => up("auto", { likeTh: x })} />
              <Num label="مهلة الدخول (ث)" v={s.auto.joinCd} on={(x) => up("auto", { joinCd: x })} />
              <Num label="مهلة نفس الشخص (ث)" v={s.auto.userCd} on={(x) => up("auto", { userCd: x })} />
            </div>
          </section>
          <section className={`${card} space-y-2`}><h4 className="font-semibold">🚫 فلترة التعليقات</h4>
            <div className="grid grid-cols-2 gap-2"><Toggle label="أسئلة فقط" v={s.filters.onlyQ} on={(b) => up("filters", { onlyQ: b })} /><Toggle label="تجاهل الروابط" v={s.filters.noLinks} on={(b) => up("filters", { noLinks: b })} /></div>
            <div className="grid grid-cols-2 gap-2"><Num label="أقل طول" v={s.filters.minLen} on={(x) => up("filters", { minLen: x })} /><Num label="أقصى طابور" v={s.filters.maxQ} on={(x) => up("filters", { maxQ: Math.max(1, x) })} /></div>
            <label className="block text-xs text-muted-foreground">كلمات محظورة (افصل بفاصلة)<Input value={s.filters.banned.join("، ")} onChange={(e) => up("filters", { banned: e.target.value.split(/[,،]/).map((x) => x.trim()).filter(Boolean) })} className="mt-1" /></label>
            <label className="block text-xs text-muted-foreground">مستخدمين محظورين<Input value={s.filters.blocked.join("، ")} onChange={(e) => up("filters", { blocked: e.target.value.split(/[,،]/).map((x) => x.trim()).filter(Boolean) })} className="mt-1" /></label>
          </section>
          <section className={`${card} space-y-2`}><h4 className="font-semibold">📝 الردود الجاهزة</h4><p className="text-xs text-muted-foreground">استخدم {"{name}"} و {"{gift}"} و {"{count}"}</p>
            {([["gift", "هدية"], ["follow", "متابعة"], ["like", "لايكات"], ["join", "دخول"], ["share", "مشاركة"]] as const).map(([k, l]) => <label key={k} className="block text-xs text-muted-foreground">{l}<Textarea rows={2} value={s.tpl[k]} onChange={(e) => up("tpl", { [k]: e.target.value })} className="mt-1" /></label>)}
          </section>
          <section className={`${card} space-y-2`}><h4 className="font-semibold">🔑 ربط تيك توك</h4>
            <p className="text-xs text-muted-foreground">الأحداث الحية تجي من Euler Stream. سجّل في eulerstream.com وانسخ مفتاحك هنا (يبقى محفوظ في جهازك).</p>
            <Input type="password" value={s.apiKey} onChange={(e) => up("apiKey", e.target.value as never)} placeholder="Euler API Key" dir="ltr" />
          </section>
        </div>
      )}
    </div>
  );
}
