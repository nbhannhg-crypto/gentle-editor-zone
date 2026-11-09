import { useEffect, useRef, useState } from "react";
import { SoundBoard } from "@/components/SoundBoard";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSpeaker } from "@/components/VoiceStudio";
import { useServerFn } from "@tanstack/react-start";
import { polishSpeech } from "@/lib/ai.functions";
import { unlockAudio } from "@/lib/cable-audio";

/* نظام الاتصال الهجين — إضافة فقط فوق لوحة المكالمة الحية */

const MODES = [
  ["line", "🔌 سلك AUX/Zero-Echo"],
  ["ptt", "🚀 محادثة فويس PTT مباشرة"],
  ["auto", "🤖 طيار آلي 100%"],
  ["copilot", "🧑‍💼 مساعد مشترك"],
] as const;
const DIALECTS = [["najdi", "سعودية نجدية"], ["hijazi", "سعودية حجازية"], ["sanaani", "يمنية صنعانية"], ["adeni", "يمنية عدنية"], ["gulf", "خليجية عامة"]] as const;
const MOODS = [["friendly", "ودودة 😊"], ["happy", "فرحانة 🎉"], ["confident", "رسمية وواثقة 💼"], ["calm", "حنونة وصبورة 🤝"]] as const;
const LAUNCH: [string, string][] = [
  ["👋 الترحيب", "يا هلا وغلا، نورت متجرنا، تفضل تحت أمرك"],
  ["💰 الأسعار والضمان", "سعر البكج 150 ريال ويشمل الضمان الذهبي والاستبدال"],
  ["🏦 الحساب والدفع", "تقدر تحول عبر الراجحي أو الأهلي وأرسل لك الرابط فوراً"],
  ["🤝 الاعتراضات", "أبشر بالخير، ما يصير خاطرك إلا طيب وعندنا خصم خاص لك"],
  ["✅ خاتمة البيع", "تم حجز طلبك يا غالي، عطني اللوكيشن أو العنوان للتوصيل"],
];
const HEAT = (t: string) => {
  if (/(تم|أبي|ابغى|أبغى|احجز|اطلب|حول|الرابط|اللوكيشن)/.test(t)) return { k: "🏆 جاهز للشراء", tip: "أرسل رابط الدفع الآن واطلب العنوان.", v: 95 };
  if (/(غالي|كثير|خصم|أرخص|ارخص|السعر)/.test(t)) return { k: "🤔 متردد بسبب السعر", tip: "العميل يرى السعر مرتفعاً — اعرض خصم 10% أو ضمان إضافي.", v: 55 };
  if (/(متى|كم|وين|توصيل|شحن|متوفر)/.test(t)) return { k: "🔥 مهتم جداً", tip: "جاوب بسرعة وأكد التوفر ومدة التوصيل.", v: 75 };
  return { k: "🙂 يستكشف", tip: "رحّب واسأله عن احتياجه بالضبط.", v: 30 };
};

// 🧹 دمج ذكي: كروم أندرويد يرسل الجملة تراكمياً (مساء ← مساء الخير ← ...) فنستبدل بدل ما نلصق
const norm = (s: string) => s.replace(/[\u064B-\u0652]/g, "").replace(/\s+/g, " ").trim();
const mergeSpeech = (prev: string, next: string) => {
  const a = norm(prev), b = norm(next);
  if (!a) return b; if (!b) return a;
  if (b.startsWith(a) || b.includes(a)) return b;
  if (a.endsWith(b) || a.includes(b)) return a;
  // تداخل: نهاية السابق = بداية الجديد
  const aw = a.split(" "), bw = b.split(" ");
  for (let k = Math.min(aw.length, bw.length); k > 0; k--) {
    if (aw.slice(-k).join(" ") === bw.slice(0, k).join(" ")) return [...aw, ...bw.slice(k)].join(" ");
  }
  return a + " " + b;
};
// يحذف أي كلمة/عبارة تتكرر ورا بعض (مساء مساء الخير مساء الخير ← مساء الخير)
const dedupeSpeech = (s: string) => {
  let w = norm(s).split(" ").filter(Boolean);
  let changed = true;
  while (changed) {
    changed = false;
    for (let n = Math.floor(w.length / 2); n >= 1 && !changed; n--) {
      for (let i = 0; i + 2 * n <= w.length; i++) {
        if (w.slice(i, i + n).join(" ") === w.slice(i + n, i + 2 * n).join(" ")) { w.splice(i + n, n); changed = true; break; }
      }
    }
    // كلمة ناقصة قبل عبارتها الكاملة: «مساء مساء الخير»
    for (let i = 0; i + 1 < w.length && !changed; i++) {
      if (w[i] === w[i + 1]) { w.splice(i, 1); changed = true; }
    }
  }
  return w.join(" ");
};

type SR = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };

export function LiveHybrid(p: {
  live: boolean; speaking: boolean; customer: string; log: { who: "c" | "a"; t: string }[];
  say: (t: string) => void; stopAll: () => void;
  send: (a: { text: string; voice: boolean; audio?: string }) => Promise<boolean>;
  persona?: string; onMode?: (m: string) => void;
}) {
  const polish = useServerFn(polishSpeech);
  const [changer, setChangerS] = useState(false);
  const changerRef = useRef(false);
  const setChanger = (v: boolean) => { changerRef.current = v; setChangerS(v); };
  const [target, setTarget] = useState<"call" | "wa">("call");
  const [polished, setPolished] = useState("");
  const tts = useSpeaker();
  const [mode, setMode] = useState<string>("copilot");
  const [dialect, setDialect] = useState("najdi");
  const [mood, setMood] = useState("friendly");
  const [guide, setGuide] = useState(false);
  const [rec, setRec] = useState(false);
  const [heard, setHeard] = useState("");
  const [busy, setBusy] = useState(false);
  const srRef = useRef<SR | null>(null);
  const cache = useRef<Record<string, string>>({});

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("live_hybrid") ?? "{}");
      if (s.mode) setMode(s.mode); if (s.dialect) setDialect(s.dialect); if (s.mood) setMood(s.mood);
      cache.current = JSON.parse(localStorage.getItem("live_audio_cache") ?? "{}");
    } catch { /* ignore */ }
  }, []);
  const persist = (o: Record<string, string>) => localStorage.setItem("live_hybrid", JSON.stringify({ mode, dialect, mood, ...o }));

  // توليد مع خزينة مؤقتة: أي رد اتولد مرة ينرسل بعدها مجاناً
  const voiceOf = async (text: string) => {
    // المفتاح يشمل الصوت المختار — عشان ما يرجع تسجيل بصوت قديم بعد تغيير الصوت
    let vid = ""; try { vid = localStorage.getItem("studio_voice_v1") ?? ""; } catch { /* ignore */ }
    const key = `${vid}|${mood}|${text}`;
    if (cache.current[key]) return cache.current[key];
    const a = await tts(text, { emotion: mood });
    cache.current[key] = a;
    try { localStorage.setItem("live_audio_cache", JSON.stringify(cache.current)); } catch { /* المساحة */ }
    return a;
  };
  const fire = async (text: string) => {
    if (p.live && (mode === "line" || mode === "copilot")) { p.say(text); return; }
    setBusy(true);
    try { await p.send({ text, voice: true, audio: await voiceOf(text) }); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  // مغيّر الصوت: تفريغ ← تنقية وصياغة بأسلوب الموظفة ← نطق في المكالمة أو فويس واتساب
  const changeVoice = async (raw: string) => {
    setBusy(true);
    try {
      const { text } = await polish({ data: { text: raw, dialect: DIALECTS.find(([k]) => k === dialect)?.[1] ?? "", persona: p.persona ?? "" } });
      setPolished(text);
      if (target === "call") { p.say(text); } else { await p.send({ text, voice: true, audio: await voiceOf(text) }); }
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const startPtt = () => {
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const C = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!C) { toast.error("المتصفح ما يدعم تحويل الكلام — جرّب كروم"); return; }
    const r = new C(); r.lang = "ar-SA"; r.interimResults = true; r.continuous = true;
    let final = "";
    r.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t = mergeSpeech(t, e.results[i]?.[0]?.transcript ?? "");
      t = dedupeSpeech(t); final = t; setHeard(t);
    };
    r.onend = () => { setRec(false); if (final.trim()) void (changerRef.current ? changeVoice(final.trim()) : fire(final.trim())); };
    srRef.current = r; setHeard(""); setRec(true); r.start();
  };

  // ⚡ النطق اللحظي السريع: يعرض كلامك وأنت تتكلم، وينطقه فوراً بدون صياغة أو تراجعه وتعدله قبل النطق
  const [talk, setTalk] = useState(false);
  const [autoSend, setAutoSend] = useState(true);
  const autoRef = useRef(true);
  autoRef.current = autoSend;
  const [live, setLiveText] = useState("");
  const [draft, setDraft] = useState("");
  const [lastSaid, setLastSaid] = useState("");
  const talkRef = useRef<SR | null>(null);
  const talkOn = useRef(false);
  // 🛡️ منع التكرار (اختياري — أطفئه مع السماعة لسرعة أعلى) + ⏱️ مهلة السكوت
  const [guard, setGuard] = useState(true);
  const guardRef = useRef(true); guardRef.current = guard;
  const [wait, setWait] = useState(1200);
  const waitRef = useRef(1200); waitRef.current = wait;
  // 🔓 صمام أمان: إذا علق قفل «تنطق» أكثر من 5 ثواني نفكّه تلقائياً عشان المايك ما يرمي كلامك
  const speakSince = useRef(0);
  const rawSpeaking = p.speaking || busy;
  if (rawSpeaking && !speakSince.current) speakSince.current = Date.now();
  if (!rawSpeaking) speakSince.current = 0;
  const speakingRef = useRef(false);
  speakingRef.current = rawSpeaking && Date.now() - speakSince.current < 5000;
  const recent = useRef<{ t: string; at: number }[]>([]);
  // 💬 شات تسلسلي مثل الواتساب
  const [chat, setChat] = useState<{ id: number; who: "me" | "a"; t: string; audio?: string; at: number }[]>([]);
  const chatEnd = useRef<HTMLDivElement | null>(null);
  // 💾 المحادثة محفوظة دائماً — ما تنمسح إلا بزر الحذف
  const chatLoaded = useRef(false);
  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem("live_hybrid_chat") ?? "[]"); if (Array.isArray(s)) setChat(s); } catch { /* ignore */ }
    chatLoaded.current = true;
  }, []);
  useEffect(() => {
    if (!chatLoaded.current) return;
    try { localStorage.setItem("live_hybrid_chat", JSON.stringify(chat.slice(-300))); }
    catch { try { localStorage.setItem("live_hybrid_chat", JSON.stringify(chat.slice(-300).map(({ audio: _a, ...m }) => m))); } catch { /* المساحة */ } }
  }, [chat]);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const lastAId = [...chat].reverse().find((m) => m.who === "a")?.id;
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [chat.length]);
  const norm = (s: string) => s.replace(/[^\u0600-\u06FFa-zA-Z0-9]/g, "");
  const speakNow = async (t: string) => {
    const text = t.trim(); if (!text) return;
    // كلمات النداء القصيرة (ألو، هلا…) تنطق كل مرة حتى لو تكررت
    const greet = /^(ألو|الو|آلو|هلا|اهلا|أهلا|مرحبا|تمام|نعم|اي|ايوه|وينك|مساء الخير|صباح الخير)$/.test(text.replace(/[^\u0600-\u06FF ]/g, "").trim());
    if (guardRef.current && !greet) {
      const n = norm(text), now = Date.now();
      recent.current = recent.current.filter((r) => now - r.at < 6000);
      if (recent.current.some((r) => r.t === n || (n.length > 3 && r.t.includes(n)))) return;
      recent.current.push({ t: n, at: now });
    }
    setLastSaid(text);
    const id = Date.now() + Math.random();
    setChat((c) => [...c, { id, who: "me", t: text, at: Date.now() }]);
    if (target === "call") {
      // 🔁 تناوب ذكي: نقفل المايك وقت نطقها عشان الكلمة تطلع كاملة، ويرجع يفتح لحاله بعدها
      if (talkOn.current && !holdRef.current) {
        pausedRef.current = true; sawSpeak.current = false;
        const old = talkRef.current; talkRef.current = null; setLiveText("");
        try { const o = old as unknown as { abort?: () => void; stop: () => void } | null; if (o?.abort) o.abort(); else o?.stop(); } catch { /* ignore */ }
        setTimeout(() => { if (pausedRef.current && !sawSpeak.current) resumeMic(); }, 6000);
        setTimeout(() => { if (pausedRef.current) resumeMic(); }, 15000);
      }
      p.say(text); setChat((c) => [...c, { id: id + 1, who: "a", t: text, at: Date.now() }]); return;
    }
    setBusy(true);
    try {
      const audio = await voiceOf(text);
      setChat((c) => [...c, { id: id + 1, who: "a", t: text, audio, at: Date.now() }]);
      await p.send({ text, voice: true, audio });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const replay = (m: { id: number; t: string; audio?: string }) => {
    if (m.audio) {
      const a = new Audio(m.audio); setPlayingId(m.id);
      a.onended = a.onerror = a.onpause = () => setPlayingId((x) => (x === m.id ? null : x));
      void a.play().catch(() => { setPlayingId(null); toast.error("تعذر التشغيل"); });
    } else { setPlayingId(m.id); p.say(m.t); setTimeout(() => setPlayingId((x) => (x === m.id ? null : x)), 400); }
  };
  const startTalk = () => {
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const C = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!C) { toast.error("المتصفح ما يدعم تحويل الكلام — جرّب كروم"); return; }
    const r = new C(); r.lang = "ar-SA"; r.interimResults = true; r.continuous = true;
    let done = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending = "";
    let sentence = "";
    let ignore = false;
    const flush = (t: string) => {
      const x = t.trim(); if (!x) return;
      if (autoRef.current) void speakNow(x); else setDraft((d) => (d ? d + " " : "") + x);
    };
    lastHeard.current = Date.now();
    r.onresult = (e) => {
      lastHeard.current = Date.now();
      if (ignore) return;
      if (guardRef.current && speakingRef.current && Date.now() - speakSince.current < 5000) { done = e.results.length; setLiveText(""); return; } // المايك مقفل أثناء نطق الموظفة
      // 🧺 نجمع الجملة كاملة (الأجزاء النهائية + اللي لسه تنقال) وما ننطق إلا بعد ما تسكت
      let interim = "";
      for (let i = done; i < e.results.length; i++) {
        const res = e.results[i]; const t = res?.[0]?.transcript ?? "";
        if (res?.isFinal) { done = i + 1; sentence = mergeSpeech(sentence, t); }
        else interim = mergeSpeech(interim, t);
      }
      pending = dedupeSpeech(mergeSpeech(sentence, interim));
      setLiveText(pending);
      clearTimeout(timer);
      if (pending) timer = setTimeout(() => { const t = pending; pending = ""; sentence = ""; ignore = true; setLiveText(""); try { r.stop(); } catch { /* ignore */ } flush(t); }, waitRef.current);
    };
    // بعد كل جلسة ننشئ مستمع جديد (إعادة تشغيل نفس المستمع تعلّق كروم الجوال)
    r.onend = () => { clearTimeout(timer); if (!ignore && pending.trim()) { const t = pending; pending = ""; sentence = ""; flush(t); } if (talkOn.current && talkRef.current === r) setTimeout(() => { if (talkOn.current) startTalk(); }, 250); else if (!talkOn.current) setTalk(false); };
    talkRef.current = r; talkOn.current = true; setTalk(true);
    unlockAudio();
    try { r.start(); } catch { setTimeout(() => { if (talkOn.current && talkRef.current === r) { try { r.start(); } catch { talkRef.current = null; setTimeout(() => { if (talkOn.current) startTalk(); }, 600); } } }, 400); }
  };
  // 🩺 حارس المايك: إذا المايك شغال بس ما وصل منه شي 12 ثانية (غيبوبة كروم) ننعشه بمستمع جديد
  const lastHeard = useRef(Date.now());
  useEffect(() => {
    const iv = setInterval(() => {
      if (!talkOn.current || holding || pausedRef.current) return;
      if (Date.now() - lastHeard.current > 12000) {
        lastHeard.current = Date.now();
        const old = talkRef.current; talkRef.current = null;
        try { old?.stop(); } catch { /* ignore */ }
        setTimeout(() => { if (talkOn.current) startTalk(); }, 300);
      }
    }, 3000);
    return () => clearInterval(iv);
  });
  const pausedRef = useRef(false);
  const sawSpeak = useRef(false);
  const resumeMic = () => {
    pausedRef.current = false; sawSpeak.current = false;
    if (talkOn.current && !talkRef.current) startTalk();
  };
  useEffect(() => {
    if (!pausedRef.current) return;
    if (p.speaking) { sawSpeak.current = true; return; }
    if (sawSpeak.current) { const t = setTimeout(resumeMic, 250); return () => clearTimeout(t); }
    return undefined;
  }, [p.speaking]);
  const stopTalk = () => { pausedRef.current = false; talkOn.current = false; talkRef.current?.stop(); setTalk(false); setLiveText(""); };
  // ✋ اضغط وتكلّم: يسمع طول ما أنت ضاغط وينطق أول ما تفلت
  const holdRef = useRef<SR | null>(null);
  const [holding, setHolding] = useState(false);
  const holdStart = () => {
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const C = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!C) { toast.error("المتصفح ما يدعم تحويل الكلام — جرّب كروم"); return; }
    const r = new C(); r.lang = "ar-SA"; r.interimResults = true; r.continuous = true;
    let text = "";
    r.onresult = (e) => { let t = ""; for (let i = 0; i < e.results.length; i++) t = mergeSpeech(t, e.results[i]?.[0]?.transcript ?? ""); text = dedupeSpeech(t); setLiveText(text); };
    r.onend = () => { setHolding(false); setLiveText(""); if (text.trim()) void speakNow(text); };
    holdRef.current = r; setHolding(true); unlockAudio();
    try { r.start(); } catch { setHolding(false); toast.error("المايك ما اشتغل — حاول مرة ثانية"); }
  };
  const holdEnd = () => { holdRef.current?.stop(); };
  useEffect(() => () => { talkOn.current = false; talkRef.current?.stop(); }, []);

  const last = [...p.log].reverse().find((m) => m.who === "c")?.t ?? p.customer;
  const heat = HEAT(last || "");

  const exportReport = () => {
    const txt = p.log.map((m) => `${m.who === "c" ? "الزبون" : "الموظفة"}: ${m.t}`).join("\n");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html dir="rtl"><body style="font-family:sans-serif;padding:24px"><h2>📋 تقرير المكالمة</h2><p>${new Date().toLocaleString("ar")}</p><p>حرارة العميل: ${heat.k}</p><pre style="white-space:pre-wrap">${txt.replace(/</g, "&lt;")}</pre></body></html>`);
    w.document.close(); w.print();
  };

  const box = "rounded-2xl border bg-card p-5 shadow-soft";
  return (
    <div className="space-y-6">
      <section className={box}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-display text-lg">🔀 أوضاع الاتصال الهجين</h3>
          <Button variant="destructive" onClick={() => { p.stopAll(); srRef.current?.stop(); toast("⏹️ انكتم فوراً"); }}>⏹️ كتم فوري</Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {MODES.map(([k, l]) => <Button key={k} size="sm" variant={mode === k ? "default" : "outline"} onClick={() => { setMode(k); persist({ mode: k }); p.onMode?.(k); }}>{l}</Button>)}
        </div>

        {mode === "line" && (
          <div className="mt-3 text-sm">
            <p>الموقع يسمع الزبون من المايك وينطق الرد، والصوت يدخل خط المكالمة بالسلك بدون صدى. ابدأ المكالمة من الأعلى.</p>
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => setGuide(!guide)}>🧰 دليل التوصيل السلكي</Button>
            {guide && (
              <ol className="mt-2 list-decimal space-y-1 rounded-xl bg-secondary p-3 pr-6 text-xs">
                <li>مقسم TRRS (رأس 4 أقطاب) في جوال الواتساب: مخرج 🎧 ومخرج 🎙️.</li>
                <li>سلك AUX من سماعة جوال الموقع إلى مدخل 🎙️ في المقسم.</li>
                <li>سماعة أذن في مخرج 🎧 لتسمع الزبون بدون تسريب.</li>
                <li>تحويلة Type-C/Lightning إلى 3.5mm للجوالات الحديثة.</li>
                <li>اختياري: موزع مايك مزدوج بزر كتم لتتدخل بصوتك وقت ما تبي.</li>
                <li>ارفع صوت جوال الموقع للنصف تقريباً عشان ما يتشوه الصوت.</li>
              </ol>
            )}
          </div>
        )}

        {mode === "ptt" && (
          <div className="mt-3 text-sm">
            <p>تكلم بصوتك، والموظفة تعيد جملتك بصوتها وترسلها للزبون فويس (يظهر عنده «يسجل مقطعاً صوتياً»).</p>
            <Button className="mt-2" variant={rec ? "destructive" : "default"} disabled={busy} onClick={() => { if (rec) { srRef.current?.stop(); return; } setChanger(false); startPtt(); }}>
              {rec ? "⏹️ خلصت — أرسل" : busy ? "…جاري الإرسال" : "🎙️ اضغط وتكلم"}
            </Button>
            {heard && <p className="mt-2 rounded-xl bg-secondary p-2">«{heard}»</p>}
          </div>
        )}

        {mode === "auto" && (
          <p className="mt-3 text-sm">الرد الآلي في الواتساب يفرّغ فويس الزبون ويطابقه مع قواعدك ويرد عليه فويس تلقائياً. فعّل «الرد بالصوت» من إعدادات حساب الواتساب.</p>
        )}

        {mode === "copilot" && (
          <div className="mt-3 grid gap-2">
            {LAUNCH.map(([l, t]) => (
              <button key={l} disabled={busy} onClick={() => fire(t)} className="rounded-xl border bg-background p-3 text-right text-sm hover:bg-secondary">
                <b>{l}</b><span className="block text-xs text-muted-foreground">{t}</span>
              </button>
            ))}
            <p className="text-xs text-muted-foreground">{p.live ? "المكالمة شغالة: ينطقها في المكالمة." : "ينرسل للزبون فويس على الواتساب."}</p>
          </div>
        )}
      </section>

      <section className={box}>
        <h3 className="font-display mb-1 text-lg">⚡ النطق اللحظي السريع</h3>
        <p className="text-sm text-muted-foreground">تكلّم وتشوف كلامك يطلع قدامك، والموظفة تنطقه بصوتك المختار فوراً — أو أوقفه وعدّله قبل النطق.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant={target === "call" ? "default" : "outline"} onClick={() => setTarget("call")}>🗣️ في المكالمة</Button>
          <Button size="sm" variant={target === "wa" ? "default" : "outline"} onClick={() => setTarget("wa")}>🚀 فويس واتساب</Button>
          <Button size="sm" variant={autoSend ? "default" : "outline"} onClick={() => setAutoSend(true)}>⚡ نطق فوري</Button>
          <Button size="sm" variant={!autoSend ? "default" : "outline"} onClick={() => setAutoSend(false)}>✍️ راجع قبل النطق</Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant={guard ? "default" : "outline"} onClick={() => setGuard(!guard)}>{guard ? "🛡️ منع التكرار: مفعّل (سبيكر)" : "🎧 منع التكرار: متوقف (سماعة — أسرع)"}</Button>
          {([[700, "⚡ خاطف"], [1200, "🎯 متوازن"], [2000, "⏳ صبور"]] as const).map(([v, l]) => (
            <Button key={v} size="sm" variant={wait === v ? "default" : "outline"} onClick={() => setWait(v)}>{l}</Button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Button className="flex-1" variant={talk ? "destructive" : "default"} onClick={() => (talk ? stopTalk() : startTalk())}>
            {talk ? "⏹️ وقّف الاستماع" : "🎙️ ابدأ أتكلم"}
          </Button>
          <Button variant="outline" onClick={() => { p.stopAll(); toast("🔇 انقطع النطق"); }}>🔇 اقطع النطق</Button>
        </div>
        <div className="mt-3 min-h-12 rounded-xl border bg-background p-3 text-sm">
          {live ? <span className="text-muted-foreground">🎧 {live}…</span> : <span className="text-muted-foreground">{talk ? "أسمعك… تكلم" : "الكلام يطلع هنا وأنت تتكلم"}</span>}
        </div>
        <SoundBoard tts={(t) => tts(t, { emotion: mood })} />
        <Button className="mt-2 w-full select-none" variant={holding ? "destructive" : "secondary"} disabled={talk}
          onPointerDown={(e) => { e.preventDefault(); holdStart(); }} onPointerUp={holdEnd} onPointerLeave={() => holding && holdEnd()}>
          {holding ? "🔴 أسمعك… افلت عشان تنطق" : "✋ اضغط مطوّل وتكلّم — افلت ينطق فوراً"}
        </Button>
        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-xl border bg-secondary/40 p-3">
          {!chat.length && <p className="text-center text-xs text-muted-foreground">💬 المحادثة تطلع هنا بالتسلسل</p>}
          {chat.map((m) => {
            const on = m.who === "a" && (playingId === m.id || (m.id === lastAId && (p.speaking || busy)));
            return (
            <div key={m.id} className={`flex ${m.who === "me" ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${m.who === "me" ? "bg-background" : "bg-primary/15"}`}>
                <p className="text-[10px] text-muted-foreground">{m.who === "me" ? "🎙️ أنت" : "👩‍💼 الموظفة"}</p>
                <p>{m.t}</p>
                {m.who === "a" && (
                  <div className="mt-1 flex h-4 items-center gap-0.5" aria-label={on ? "تنطق الحين" : "ساكتة"}>
                    {Array.from({ length: 14 }).map((_, i) => (
                      <span key={i} className={`w-0.5 rounded-full ${on ? "animate-pulse bg-primary" : "bg-muted-foreground/30"}`}
                        style={{ height: on ? `${30 + ((i * 37) % 70)}%` : "2px", animationDelay: `${i * 60}ms` }} />
                    ))}
                    <span className="ms-1 text-[10px] text-muted-foreground">{on ? "🔊 تنطق" : "⏸️ ساكتة"}</span>
                  </div>
                )}
                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                  <span>{new Date(m.at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}</span>
                  <div className="flex gap-1">
                    {m.who === "a" && <button className="rounded-full bg-background px-2 py-0.5" onClick={() => replay(m)}>▶️ شغّل</button>}
                    <button className="rounded-full bg-background px-2 py-0.5 text-destructive" aria-label="حذف الرسالة" onClick={() => setChat((c) => c.filter((x) => x.id !== m.id))}>🗑️</button>
                  </div>
                </div>
              </div>
            </div>
          ); })}
          <div ref={chatEnd} />
        </div>
        {chat.length > 0 && <Button size="sm" variant="ghost" className="mt-1" onClick={() => { if (confirm("تمسح المحادثة كلها؟")) setChat([]); }}>🧹 مسح المحادثة</Button>}
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="اكتب أو عدّل الكلام هنا…"
          className="mt-2 w-full rounded-xl border bg-background p-2 text-sm" />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" disabled={!draft.trim() || busy} onClick={() => { void speakNow(draft); setDraft(""); }}>🔊 انطقها الحين</Button>
          <Button size="sm" variant="outline" disabled={!draft} onClick={() => setDraft("")}>🗑️ امسح</Button>
          <Button size="sm" variant="outline" disabled={!lastSaid} onClick={() => setDraft(lastSaid)}>✏️ صحّح آخر جملة</Button>
          <Button size="sm" variant="outline" disabled={!lastSaid || busy} onClick={() => void speakNow(lastSaid)}>🔁 أعدها</Button>
        </div>
        <SoundBoard tts={(t) => tts(t, { emotion: mood })} />
        {lastSaid && <p className="mt-2 rounded-xl bg-primary/10 p-2 text-sm">👩‍💼 آخر نطق: «{lastSaid}»</p>}
      </section>

      <section className={box}>
        <h3 className="font-display mb-2 text-lg">🎙️ مغيّر الصوت اللحظي المباشر</h3>
        <p className="text-sm text-muted-foreground">تكلّم بصوتك ولهجتك، والموظفة تفرّغ كلامك وتنقّيه وتصيغه بأسلوبها ولهجتها، وتنطقه بصوتها.</p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant={target === "call" ? "default" : "outline"} onClick={() => setTarget("call")}>🗣️ ابثّه في المكالمة</Button>
          <Button size="sm" variant={target === "wa" ? "default" : "outline"} onClick={() => setTarget("wa")}>🚀 أرسله فويس واتساب</Button>
        </div>
        <Button className="mt-3 w-full" variant={rec && changer ? "destructive" : "default"} disabled={busy}
          onClick={() => { if (rec) { srRef.current?.stop(); return; } setChanger(true); setPolished(""); startPtt(); }}>
          {rec && changer ? "⏹️ خلصت — بدّل صوتي" : busy ? "…تصيغ وتنطق" : "🎙️ تكلّم وأنا أبدّل صوتك"}
        </Button>
        {heard && changer && <p className="mt-2 rounded-xl bg-secondary p-2 text-sm">قلت: «{heard}»</p>}
        {polished && <p className="mt-2 rounded-xl bg-primary/10 p-2 text-sm">👩‍💼 الموظفة: «{polished}»</p>}
      </section>

      <section className={box}>
        <h3 className="font-display mb-3 text-lg">🎭 اللهجة والمشاعر</h3>
        <div className="flex flex-wrap gap-1">
          {DIALECTS.map(([k, l]) => <Button key={k} size="sm" variant={dialect === k ? "default" : "outline"} onClick={() => { setDialect(k); persist({ dialect: k }); }}>{l}</Button>)}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {MOODS.map(([k, l]) => <Button key={k} size="sm" variant={mood === k ? "default" : "outline"} onClick={() => { setMood(k); persist({ mood: k }); }}>{l}</Button>)}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">💾 أي رد اتولد مرة ينحفظ ويرسل بعدها بدون ما يخصم رصيد ({Object.keys(cache.current).length} محفوظ).</p>
      </section>

      <section className={box}>
        <h3 className="font-display mb-2 text-lg">🌡️ حرارة العميل</h3>
        <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full bg-primary transition-all" style={{ width: `${heat.v}%` }} />
        </div>
        <p className="mt-2 font-bold">{heat.k}</p>
        <p className="mt-1 rounded-xl bg-secondary p-2 text-sm">🤫 نصيحة: {heat.tip}</p>
        <Button className="mt-3" variant="outline" disabled={!p.log.length} onClick={exportReport}>🖨️ تصدير التقرير PDF</Button>
      </section>
    </div>
  );
}
