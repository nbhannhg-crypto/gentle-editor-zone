import { VoiceModelPicker } from "@/components/VoiceModelPicker";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { analyzeDeal, suggestReplies, smartReply } from "@/lib/ai.functions";
import { addRule, recordUse, findMatches, type Rule } from "@/lib/rules";
import { useReplyEngine, type Mode } from "@/routes/_authenticated/app";
import { useSpeaker, loadVoice, EMOTIONS } from "@/components/VoiceStudio";
import { startVadRecorder, blobToBase64, type VadHandle } from "@/lib/vad-recorder";
import { transcribeLive } from "@/lib/listen.functions";
import { CallIdentity, StaffSwitcher, useIdentity, identityText } from "@/components/CallIdentity";
import { staffAnswer } from "@/lib/staff";
import { loadCockpit, hitBanned, applyFixes } from "@/components/LiveCockpit";
import { applyCable, loadCable, saveCable } from "@/lib/cable-audio";
import { searchCallSources } from "@/lib/call-brains";
import { CallTranscript, type TMsg } from "@/components/CallTranscript";
import { CallBoxes, loadGlobalBoxes } from "@/components/CallBoxes";
import { LiveVideoCall } from "@/components/LiveVideoCall";

type SR = any;
type Msg = { who: "c" | "a"; t: string };
type Deal = { verdict: "sold" | "hot" | "cold" | "lost"; score: number; summary: string; tips: string[] };

const VERDICTS: Record<Deal["verdict"], { label: string; icon: string; cls: string }> = {
  sold: { label: "تم البيع 🎉", icon: "🏆", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-400/40" },
  hot: { label: "مهتم جداً 🔥", icon: "🔥", cls: "bg-amber-500/20 text-amber-300 border-amber-400/40" },
  cold: { label: "متردد 🤔", icon: "💭", cls: "bg-sky-500/20 text-sky-300 border-sky-400/40" },
  lost: { label: "رفض ❌", icon: "🥀", cls: "bg-rose-500/20 text-rose-300 border-rose-400/40" },
};

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export function KingdomCall({ rules, reload, mode, product, storeId }: {
  rules: Rule[]; reload: () => Promise<void>; mode: Mode; product: string; storeId?: string | undefined;
}) {
  const [live, setLive] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [loud, setLoud] = useState(true);
  const [cable, setCable] = useState(false);
  useEffect(() => { setCable(loadCable()); }, []);
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [customer, setCustomer] = useState("");
  const [typed, setTyped] = useState("");
  const [answer, setAnswer] = useState("");
  const [alts, setAlts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [custom, setCustom] = useState("");
  const [log, setLog] = useState<Msg[]>([]);
  const logRef = useRef<Msg[]>([]);
  logRef.current = log;
  const [deal, setDeal] = useState<Deal | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [emotion, setEmotion] = useState("");
  const ident = useIdentity(storeId, "call");
  const identRef = useRef("");
  identRef.current = identityText(ident.id);
  const recRef = useRef<SR | null>(null);
  const liveRef = useRef(false);
  const mutedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const engine = useReplyEngine(rules, mode, product);
  const smart = useServerFn(smartReply);
  const tts = useSpeaker();
  const suggest = useServerFn(suggestReplies);
  const analyze = useServerFn(analyzeDeal);

  const [avatar, setAvatar] = useState("");
  useEffect(() => { setEmotion(loadVoice().emotion); setAvatar(localStorage.getItem("kingdom_avatar") ?? ""); }, []);
  const pickAvatar = (f?: File) => {
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); const s = 300; c.width = s; c.height = s;
      const k = Math.max(s / img.width, s / img.height);
      c.getContext("2d")!.drawImage(img, (s - img.width * k) / 2, (s - img.height * k) / 2, img.width * k, img.height * k);
      const url = c.toDataURL("image/jpeg", 0.85);
      setAvatar(url); localStorage.setItem("kingdom_avatar", url); toast.success("✅ صارت صورة الموظفة");
    };
    img.src = URL.createObjectURL(f);
  };
  // لوحة التحكم — محفوظة بالجهاز
  const [ctl, setCtl] = useState({ autoSay: true, echoGuard: true, dedupe: true, showInterim: true, waitMs: 300, evo: false, evoLearn: true, src: "hybrid" as "ai" | "rules" | "hybrid", match: 0.8 });
  const vadRef = useRef<VadHandle | null>(null);
  const evoOn = useRef(false); // نمط التطور شغال في هذه المكالمة
  const sayRef = useRef<(t: string) => void>(() => {});
  const ctlRef = useRef(ctl);
  const speakingRef = useRef(false);
  const lastHeard = useRef<{ t: string; at: number }>({ t: "", at: 0 });
  const pendingRef = useRef<{ text: string; timer: ReturnType<typeof setTimeout> | null }>({ text: "", timer: null });
  useEffect(() => { try { const s = localStorage.getItem("kingdom_call_ctl"); if (s) { const j = JSON.parse(s); if (j.waitMs === 600) j.waitMs = 300; setCtl((c) => ({ ...c, ...j })); } } catch { /* ignore */ } }, []);
  useEffect(() => { ctlRef.current = ctl; localStorage.setItem("kingdom_call_ctl", JSON.stringify(ctl)); }, [ctl]);
  useEffect(() => { speakingRef.current = speaking; }, [speaking]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [live]);
  useEffect(() => () => { liveRef.current = false; recRef.current?.stop(); audioRef.current?.pause(); }, []);

  const norm = (s: string) => s.replace(/[\u064B-\u0652.,!?؟،]/g, "").replace(/\s+/g, " ").trim();
  // 🧠 تعليم فوري بالذاكرة: يشتغل في نفس اللحظة قبل ما يوصل التحديث من السحابة
  const taughtRef = useRef<Rule[]>([]);
  const replySeq = useRef(0);
  const customRef = useRef<HTMLInputElement | null>(null);
  const teachNow = (q: string, a: string) => {
    if (!q.trim() || !a.trim()) return;
    const nq = norm(q);
    taughtRef.current = [
      { id: `mem-${Date.now()}`, trigger_text: q, response_text: a, use_count: 0 } as unknown as Rule,
      ...taughtRef.current.filter((x) => norm(x.trigger_text) !== nq),
    ];
  };
  const handleCustomer = async (text: string) => {
    const seq = ++replySeq.current;
    setCustomer(text); setBusy(true);
    setLog((l) => [...l, { who: "c", t: text }]);
    try {
      // 🔗 لوحة تحكم المكالمة المباشرة هي المرجع: الدقة ومصدر الرد والقواعد والمكتبات
      const ck0 = loadCockpit(); const gb = loadGlobalBoxes();
      const ck = { ...ck0, persona: [...gb.persona, ck0.persona].filter(Boolean).join("\n"), banned: [...gb.banned, ...ck0.banned] };
      const b = (ck as { brains?: { mine?: boolean; ai?: boolean } }).brains;
      const ckSrc = b ? (b.mine && b.ai ? "hybrid" : b.ai ? "ai" : "rules") : ctlRef.current.src;
      const c0 = { ...ctlRef.current, match: ck.match ?? ctlRef.current.match, src: ckSrc };
      const myRules = ck.rulesOff ? [] : rules;
      // 🥇 أولوية مطلقة لتعليمك: المتعلَّم حالاً ثم قواعدك — حتى لو المصدر «ذكاء خالص»
      const fresh = taughtRef.current;
      const ms = findMatches(text, [...fresh, ...myRules]);
      const strict = ms[0] && ms[0].score >= c0.match ? ms[0] : undefined;
      const loose = ms[0] && ms[0].score >= Math.min(c0.match, 0.7) ? ms[0] : undefined;
      const best = strict ?? loose;
      let r: { answer: string; rule?: Rule | undefined; matches: typeof ms; source: string };
      const chat = async () => ({ answer: (await smart({ data: { customer: text, product: `${ck.persona ? `معلومات وقصة الموظفة (التزمي فيها حرفياً):\n${ck.persona}` : ""}${ck.banned.length ? `\nكلام ممنوع تقولينه أبداً: ${ck.banned.join("، ")}` : ""}`.slice(0, 2000), rules: myRules.slice(0, 200).map((x) => ({ trigger: x.trigger_text, response: x.response_text })), mood: "call" as const, identity: identRef.current, history: logRef.current.slice(-8).map((m) => ({ who: m.who, t: m.t.slice(0, 400) })) } })).reply, rule: undefined, matches: ms, source: "ai" });
      const lib = async () => ((ck.secs?.length ?? 0) || (ck.kbrains?.length ?? 0)) ? await searchCallSources(text, ck.secs ?? [], ck.kbrains ?? [], c0.match) : "";
      const who = staffAnswer(text, identRef.current);
      if (who) r = { answer: who, rule: undefined, matches: ms, source: "staff" };
      else if (best) r = { answer: best.rule.response_text, rule: best.rule.id.startsWith("mem-") ? undefined : best.rule, matches: ms, source: "rule" };
      else if (c0.src === "ai") r = await chat();
      else {
        const l = await lib();
        if (l) r = { answer: l, rule: undefined, matches: ms, source: "lib" };
        else if (c0.src === "rules") r = { answer: "", rule: undefined, matches: ms, source: "none" };
        else r = await chat();
      }
      if (seq !== replySeq.current) return; // انضغط إيقاف أو وصل كلام أحدث
      const bad = r.answer ? hitBanned(r.answer, ck) : undefined;
      if (bad) { toast.error(`🚫 الرد فيه كلمة ممنوعة «${bad}»`); r = { ...r, answer: "" }; }
      if (r.answer) r = { ...r, answer: applyFixes(r.answer, ck) };
      setAnswer(r.answer);
      const others = r.matches.filter((m) => m.rule.response_text !== r.answer).map((m) => m.rule.response_text);
      setAlts([...new Set(others)].slice(0, 3));
      recordUse(text, r.rule).then(reload);
      if (ctlRef.current.autoSay && r.answer && liveRef.current) sayRef.current(r.answer);
      // 🧬 تعلّم ذاتي: رد جديد من الذكاء ينحفظ قاعدة عشان المرة الجاية يرد فوراً
      if (evoOn.current && ctlRef.current.evoLearn && !r.rule && r.answer && r.source === "ai") {
        void addRule(text, r.answer, storeId).then(({ error }) => { if (!error) { toast.success("🧬 تعلّمت رد جديد"); void reload(); } });
      }
    } catch (e) {
      const m = (e as Error).message || "";
      // بدل إشعار «المفاتيح مشغولة» ترد الموظفة بدلع وتكمل المكالمة
      if (/مشغول/.test(m) && liveRef.current) {
        if (seq === replySeq.current) {
          const say = ["ما سمعتك يا بعد عمري، عيد لي فديتك", "الصوت يقطع عندك يا روحي، وش قلت؟", "عيدها لي يا قلبي ما وضحت"][Math.floor(Math.random() * 3)]!;
          setAnswer(say); if (ctlRef.current.autoSay) sayRef.current(say);
        }
      } else toast.error(m);
    }
    setBusy(false);
  };

  // يجمع الكلام النهائي وينتظر لحظة صمت قصيرة قبل الرد — يمنع تقطيع الجملة وتكرارها
  const queueHeard = (fin: string) => {
    const c = ctlRef.current;
    const n = norm(fin);
    if (!n) return;
    if (c.echoGuard) {
      const s = lastSaid.current;
      // صدى فقط: جملة طويلة تطابق كلامها تقريباً خلال 1.5 ثانية بعد ما سكتت
      if (s.t && n.length >= 8 && Date.now() - s.at < 1500 && (n === s.t || (s.t.includes(n) && n.length > s.t.length * 0.6))) return;
    }
    if (c.dedupe) {
      const last = lastHeard.current;
      if (Date.now() - last.at < 1500 && last.t === n) return;
    }
    const p = pendingRef.current;
    const pn = norm(p.text);
    p.text = pn && n.startsWith(pn) ? fin : pn && pn.includes(n) ? p.text : (p.text ? p.text + " " : "") + fin;
    if (p.timer) clearTimeout(p.timer);
    const fire = () => {
      const full = p.text.trim(); p.text = ""; p.timer = null;
      if (!full) return;
      lastHeard.current = { t: norm(full), at: Date.now() };
      setInterim("");
      handleCustomer(full);
    };
    if (c.waitMs <= 0) { p.timer = null; fire(); } else p.timer = setTimeout(fire, c.waitMs);
  };

  // 🧬 نمط التطور: سماع ذكي يكشف الصمت + مقاطعة فورية (يشتغل بكل المتصفحات)
  const startEvo = async () => {
    try {
      liveRef.current = true; evoOn.current = true;
      setLive(true); setSeconds(0); setDeal(null); setAnswer(""); setCustomer("");
      vadRef.current = await startVadRecorder({
        silenceMs: 800,
        isPaused: () => mutedRef.current,
        // وهي تتكلم نرفع الحساسية شوي عشان صوتها ما يقاطعها
        minRms: () => (speakingRef.current ? 0.035 : 0.012),
        onSpeechStart: () => {
          if (!speakingRef.current) return;
          saySeqK.current++; audioRef.current?.pause();
          speakingRef.current = false; setSpeaking(false);
        },
        onPhrase: async (blob, mime) => {
          if (!liveRef.current) return;
          try {
            const b64 = await blobToBase64(blob);
            const r = await transcribeLive({ data: { audio: b64, mime } });
            const t = (r.text ?? "").trim();
            if (t && liveRef.current) queueHeard(t);
          } catch { /* تجاهل جملة فشل تفريغها */ }
        },
      });
    } catch {
      toast.error("🎙️ اسمح للمايك من إعدادات المتصفح"); stop();
    }
  };

  const start = () => {
    if (ctlRef.current.evo) { void startEvo(); return; }
    const W = window as any;
    const C = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!C) { toast.error("المتصفح ما يدعم سماع الصوت. استخدم Chrome أو اكتب كلام الزبون."); return; }
    // كائن جديد ونظيف كل مرة — أندرويد يعلّق لو أعدنا تشغيل نفس الكائن
    const make = (): SR => {
      const rec: SR = new C();
      rec.lang = "ar-SA"; rec.continuous = true; rec.interimResults = true;
      rec.onresult = (e: any) => {
        if (mutedRef.current) return;
        if (ctlRef.current.echoGuard && speakingRef.current) return;
        let fin = "", tmp = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) fin += t; else tmp += t;
        }
        if (ctlRef.current.showInterim) setInterim(tmp);
        if (fin.trim()) queueHeard(fin.trim());
      };
      rec.onerror = (ev: any) => {
        if (ev?.error === "not-allowed") { toast.error("🎙️ اسمح للمايك من إعدادات المتصفح"); stop(); return; }
        // السلك/تبديل منفذ الصوت: نرجّع السماع بهدوء بعد لحظة بدل ما يعلّق
        if (ev?.error === "audio-capture" || ev?.error === "network") {
          setTimeout(() => { if (liveRef.current && recRef.current === rec && !speakingRef.current) restartRec(); }, 400);
        }
      };
      rec.onend = () => {
        if (!liveRef.current || recRef.current !== rec) return;
        if (speakingRef.current) return; // micOn يعيد التشغيل
        restartRec();
      };
      return rec;
    };
    makeRecRef.current = make;
    const rec = make();
    recRef.current = rec; liveRef.current = true;
    // نطلب المايك مرة لتفعيل مدخل السلك/السماعة في أندرويد ثم نحرره فوراً
    navigator.mediaDevices?.getUserMedia?.({ audio: true })
      .then((s) => s.getTracks().forEach((t) => t.stop()))
      .catch(() => {})
      .finally(() => { if (recRef.current === rec && liveRef.current) { try { rec.start(); } catch { restartRec(); } } });
    setLive(true); setSeconds(0); setDeal(null); setAnswer(""); setCustomer("");
  };
  const makeRecRef = useRef<(() => SR) | null>(null);
  const restartRec = () => {
    if (!liveRef.current || evoOn.current || !makeRecRef.current) return;
    // stop بدل abort: أندرويد يقفل خط السلك لو انقطع المايك بقوة
    const old = recRef.current; if (old) { old.onend = null; old.onerror = null; try { old.stop?.(); } catch { /* ignore */ } }
    const r = makeRecRef.current(); recRef.current = r;
    // أندرويد يحتاج وقت يفك منفذ الصوت (السلك) قبل جلسة جديدة؛ ولو فشل البدء نعيد المحاولة بدل ما يموت المايك
    const tryStart = (n: number) => {
      if (recRef.current !== r || !liveRef.current || speakingRef.current) return;
      try { r.start(); } catch { if (n < 8) setTimeout(() => tryStart(n + 1), 500); }
    };
    setTimeout(() => tryStart(0), 350);
  };

  // تبديل فوري: لو المكالمة شغالة وتغيّر محرك السماع نعيد تشغيله على طول
  const switchCtl = (key: string, v: unknown) => {
    const prevEvo = ctlRef.current.evo;
    const next = { ...ctlRef.current, [key]: v } as typeof ctl;
    ctlRef.current = next; setCtl(next);
    if (key === "evo" && liveRef.current && prevEvo !== v) {
      stop();
      setTimeout(() => start(), 150);
      toast.success(v ? "🧠 صار السماع بالذكاء الدقيق" : "⚡ صار السماع بالمتصفح");
    }
  };

  const stop = () => {
    evoOn.current = false; vadRef.current?.stop(); vadRef.current = null;
    liveRef.current = false; recRef.current?.stop();
    setLive(false); setInterim(""); audioRef.current?.pause(); setSpeaking(false); setRecording(false);
  };

  // تبادل أدوار: وهي تتكلم المايك مقفل كلياً، وبعد ما تخلص يرجع يسمع
  const lastSaid = useRef<{ t: string; at: number }>({ t: "", at: 0 });
  const micOff = () => {
    speakingRef.current = true;
    const p = pendingRef.current; if (p.timer) clearTimeout(p.timer); p.text = ""; p.timer = null;
    setInterim("");
    try { recRef.current?.stop?.(); } catch { /* ignore */ }
  };
  const micOn = () => {
    setTimeout(() => {
      speakingRef.current = false; setSpeaking(false);
      if (liveRef.current && !evoOn.current) restartRec();
    }, 250);
  };
  const saySeqK = useRef(0);
  const say = async (text: string) => {
    if (!text.trim()) return;
    // نمط التطور: المايك يظل مفتوح عشان تقدر تقاطعها
    const guard = ctlRef.current.echoGuard && !evoOn.current;
    const my = ++saySeqK.current;
    lastSaid.current = { t: norm(text), at: Date.now() };
    setLog((l) => [...l, { who: "a", t: text }]);
    try {
      const audio = await tts(text, { emotion });
      if (my !== saySeqK.current) return; // رد أحدث وصل
      // المايك يبقى مفتوح وقت تجهيز الصوت، وينقفل فقط لحظة خروج الصوت
      setSpeaking(true);
      if (guard) micOff();
      audioRef.current?.pause();
      const a = new Audio(audio); audioRef.current = a;
      a.volume = loud ? 1 : 0.3;
      if (cable) applyCable(a);
      const done = () => { lastSaid.current.at = Date.now(); if (guard) micOn(); else setSpeaking(false); };
      a.onended = done; a.onerror = done;
      await a.play();
    } catch (e) { toast.error((e as Error).message); if (guard) micOn(); else setSpeaking(false); }
  };

  sayRef.current = say;

  // 🛑 إيقاف الرد فوراً: يلغي الصوت الجاري أو اللي يتجهز، ويفتح لك خانة الكتابة
  const stopReply = () => {
    saySeqK.current++; replySeq.current++;
    try { audioRef.current?.pause(); } catch { /* ignore */ }
    setBusy(false); setAnswer("");
    if (speakingRef.current) micOn(); else setSpeaking(false);
    setTimeout(() => customRef.current?.focus(), 50);
  };

  const sendCustom = async () => {
    const t = custom.trim();
    if (!t) return;
    say(t);
    if (customer) {
      teachNow(customer, t);
      const { error } = await addRule(customer, t, storeId);
      if (!error) { toast.success("قلتها وحفظتها كقاعدة جديدة 🧠"); reload(); }
    }
    setCustom("");
  };

  const askAi = async () => {
    if (!customer) { toast.error("لازم الزبون يقول شي أول"); return; }
    setBusy(true);
    try {
      const { replies } = await suggest({ data: { customer, product, rules: rules.slice(0, 200).map((r) => ({ trigger: r.trigger_text, response: r.response_text })) } });
      setAlts(replies.slice(0, 3));
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };

  const runDealEye = async () => {
    if (log.length < 2) { toast.error("المحادثة قصيرة — خل الزبون يتكلم شوي"); return; }
    setAnalyzing(true);
    try {
      const d = await analyze({ data: { conversation: log.slice(-40) } });
      setDeal(d);
    } catch (e) { toast.error((e as Error).message); }
    setAnalyzing(false);
  };

  const bars = [0.4, 0.9, 0.6, 1, 0.5, 0.8, 0.35, 0.7];

  return (
    <div className="mx-auto max-w-2xl">
      <details className="mb-4">
        <summary className="cursor-pointer rounded-xl bg-card p-3 text-center font-bold shadow">📹 مكالمة فيديو حية (صورة تتكلم)</summary>
        <div className="mt-3"><LiveVideoCall /></div>
      </details>
      {/* شاشة الاتصال */}
      <section className="overflow-hidden rounded-3xl bg-[#0b1220] text-white shadow-2xl">
        <div className="flex flex-col items-center px-6 pt-8">
          <div className={`relative flex h-36 w-36 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-6xl shadow-lg transition-transform duration-300 ${live ? "ring-4 ring-amber-400/30" : ""} ${speaking ? "scale-105 animate-pulse ring-8 ring-amber-300/60" : ""}`}>
            {avatar ? <img src={avatar} alt="صورة الموظفة" className="h-full w-full object-cover" /> : "👩‍💼"}
            {live && <span className="absolute bottom-1 left-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs">✓</span>}
          </div>
          <label className="mt-2 cursor-pointer text-xs text-amber-300 underline">
            📷 {avatar ? "غيّر صورة الموظفة" : "حط صورة للموظفة"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => pickAvatar(e.target.files?.[0])} />
          </label>
          {avatar && <button onClick={() => { setAvatar(""); localStorage.removeItem("kingdom_avatar"); }} className="text-[10px] text-white/50">إزالة الصورة</button>}
          {!live && (
            <select value={emotion} onChange={(e) => setEmotion(e.target.value)} className="mt-2 rounded-md bg-white/10 px-2 py-1 text-xs" aria-label="نبرة الصوت">
              {EMOTIONS.map(([k, l]) => <option key={k} value={k} className="text-black">🎚️ {l}</option>)}
            </select>
          )}
          <h2 className="font-display mt-4 text-2xl">موظفة المملكة</h2>
          <VoiceModelPicker className="mt-2" />
          <p className="mt-1 text-sm text-white/60">
            {live ? (speaking ? "🔊 تتكلم…" : muted ? "🎙️ المايك مكتوم" : "تسمع الزبون…") : "جاهزة للاتصال"}
          </p>
          {live && <p className="mt-1 font-mono text-lg text-amber-300" dir="ltr">{fmt(seconds)}</p>}

          {/* موجة صوتية */}
          <div className="mt-4 flex h-10 items-end gap-1.5" aria-hidden>
            {bars.map((h, i) => (
              <span key={i} className={`w-1.5 rounded-full bg-amber-400/80 ${live && !muted ? "animate-pulse" : ""}`}
                style={{ height: `${h * 100}%`, animationDelay: `${i * 0.12}s`, opacity: live ? 1 : 0.25 }} />
            ))}
          </div>
        </div>

        {/* أزرار التحكم */}
        <div className="mt-6 flex items-center justify-center gap-4 px-6 pb-6">
          {!live ? (
            <button onClick={start} className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-2xl shadow-lg transition hover:scale-105" aria-label="ابدأ المكالمة">📞</button>
          ) : (
            <>
              <button onClick={() => setMuted((m) => !m)} className={`flex h-13 w-13 items-center justify-center rounded-full p-3.5 text-xl transition ${muted ? "bg-white text-black" : "bg-white/15"}`} aria-label="كتم">{muted ? "🔇" : "🎙️"}</button>
              <button onClick={stop} className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-2xl shadow-lg transition hover:scale-105" aria-label="إنهاء">📵</button>
              <button onClick={() => setLoud((l) => !l)} className={`flex h-13 w-13 items-center justify-center rounded-full p-3.5 text-xl transition ${loud ? "bg-white text-black" : "bg-white/15"}`} aria-label="مكبر الصوت">🔊</button>
              <button onClick={() => { const v = !cable; setCable(v); saveCable(v); toast.success(v ? "🎧 وضع السلك النقي شغال" : "🔈 رجع الصوت العادي"); }} className={`flex h-13 w-13 items-center justify-center rounded-full p-3.5 text-xl transition ${cable ? "bg-white text-black" : "bg-white/15"}`} aria-label="وضع السلك النقي">🎧</button>
              <button onClick={() => setRecording((r) => !r)} className={`flex h-13 w-13 items-center justify-center rounded-full p-3.5 text-xl transition ${recording ? "animate-pulse bg-rose-500" : "bg-white/15"}`} aria-label="تسجيل">{recording ? "⏺️" : "⚪"}</button>
            </>
          )}
        </div>
        {recording && live && <p className="pb-4 text-center text-xs text-rose-300">⏺️ جاري تسجيل المكالمة</p>}
        <div className="mx-4 mb-4 rounded-xl bg-white/10 px-3 py-2 text-xs">
          <div className="flex items-center justify-between"><span>⏱️ انتظار نهاية الجملة (السلك)</span><b dir="ltr">{(ctl.waitMs / 1000).toFixed(1)}s</b></div>
          <input type="range" min={0} max={2000} step={100} value={ctl.waitMs} onChange={(e) => setCtl((c) => ({ ...c, waitMs: Number(e.target.value) }))} className="mt-1 w-full accent-primary" aria-label="توقيت انتظار الجملة" />
          <div className="flex justify-between opacity-70"><span>⚡ أسرع</span><span>🐢 يكمل الجملة</span></div>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border bg-card p-3"><StaffSwitcher storeId={storeId} channel="call" />
        <details className="mt-2 rounded-xl border p-2"><summary className="cursor-pointer text-sm font-semibold">👯 إدارة طاقم الموظفات (إظهار / إخفاء)</summary><div className="mt-2"><CallIdentity storeId={storeId} /></div></details></section>
      <CallBoxes storeId={storeId} />

      {/* 🎛️ لوحة تحكم مكالمة المملكة */}
      <section className="mt-4 rounded-2xl border bg-card p-4">
        <h3 className="font-display mb-3 text-lg">🎛️ لوحة تحكم مكالمة المملكة</h3>
        <p className="mb-3 rounded-lg bg-secondary px-3 py-2 text-xs text-secondary-foreground">🔗 دقة المطابقة ومصدر الرد والقواعد والمكتبات والعقول والكلمات الممنوعة تتحكم فيها من «لوحة تحكم المكالمة المباشرة» وتطبّق هنا تلقائياً، وأي تعليم هنا ينحفظ للاثنتين.</p>
        {([
          ["🎙️ السماع", "evo", [[true, "🧠 الذكاء الدقيق"], [false, "⚡ المتصفح السريع"]]],
        ] as const).map(([title, key, opts]) => (
          <div key={key} className="mb-3">
            <p className="mb-1 text-sm font-semibold">{title}</p>
            <div className="flex flex-wrap gap-2">
              {opts.map(([v, l]) => {
                const on = (ctl as Record<string, unknown>)[key] === v;
                return (
                  <button key={String(v)} type="button" onClick={() => switchCtl(key, v)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-primary bg-primary text-primary-foreground" : "bg-secondary"}`}>
                    {on ? "✓ " : ""}{l}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            ["autoSay", "🗣️ ترد بالصوت تلقائياً (بدون موافقة)"],
            ["echoGuard", "🔇 ما تسمع نفسها وهي تتكلم (منع الصدى)"],
            ["dedupe", "🧹 منع تكرار الكلمات والجمل"],
            ["showInterim", "👀 أشوف الكلام وهو ينكتب"],
            ["evoLearn", "🧠 التطور يتعلّم: يحفظ الردود الجديدة كقواعد"],
          ] as const).map(([k, l]) => (
            <label key={k} className="flex cursor-pointer items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2 text-sm">
              <span>{l}</span>
              <input type="checkbox" className="h-5 w-5 accent-primary" checked={ctl[k]} onChange={(e) => setCtl((c) => ({ ...c, [k]: e.target.checked }))} />
            </label>
          ))}
        </div>
        <div className="mt-3 text-sm">
          ⏱️ سرعة الرد بعد كلامك: <b dir="ltr">{(ctl.waitMs / 1000).toFixed(1)}s</b>
          <div className="mt-1 flex flex-wrap gap-2">
            {([[0, "⚡ فوري"], [300, "🚀 سريع"], [800, "⏳ تنتظر الجملة"], [1500, "🐢 صبورة"]] as const).map(([v, l]) => (
              <Button key={v} type="button" size="sm" variant={ctl.waitMs === v ? "default" : "outline"} onClick={() => setCtl((c) => ({ ...c, waitMs: v }))}>{l}</Button>
            ))}
          </div>
          <input type="range" min={0} max={2000} step={100} value={ctl.waitMs} onChange={(e) => setCtl((c) => ({ ...c, waitMs: Number(e.target.value) }))} className="mt-2 w-full accent-primary" />
        </div>
        {log.length > 0 && <Button variant="outline" size="sm" className="mt-3" onClick={() => { setLog([]); setCustomer(""); setAnswer(""); }}>🗑️ مسح المحادثة</Button>}
      </section>

      <CallTranscript log={log as TMsg[]} setLog={(f) => setLog((l) => f(l as TMsg[]) as Msg[])} storeId={storeId} kind="kcall" live={live} onSay={(t) => void say(t)} reload={reload} onTaught={teachNow} />

      {interim && <p className="mt-3 text-sm text-muted-foreground">الزبون يقول الآن: … {interim}</p>}

      {/* إدخال كلام الزبون يدوياً — تحت المحادثة وفوق الرد المقترح */}
      {live && (
        <div className="mt-3 flex gap-2">
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="اكتب كلام الزبون هنا…"
            onKeyDown={(e) => { if (e.key === "Enter" && typed.trim()) { handleCustomer(typed.trim()); setTyped(""); } }} />
          <Button variant="secondary" onClick={() => { if (typed.trim()) { handleCustomer(typed.trim()); setTyped(""); } }}>أرسل</Button>
          <select value={emotion} onChange={(e) => setEmotion(e.target.value)} className="rounded-md border bg-background px-2 text-sm" aria-label="المشاعر">
            {EMOTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      )}

      {/* رد الموظفة */}
      {live && customer && (
        <section className="mt-4 rounded-2xl bg-royal p-5 text-primary-foreground shadow-soft">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm opacity-80">👩‍💼 الرد المقترح:</p>
            {(busy || speaking || answer) && (
              <Button size="sm" variant="destructive" onClick={stopReply}>🛑 إيقاف الرد</Button>
            )}
          </div>
          <p className="font-display mt-2 min-h-10 text-xl leading-relaxed">{busy ? "تفكر…" : answer || "ما عندها رد من تعليمك — اطلب اقتراح أو اكتب ردك"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button className="bg-gold text-accent-foreground" disabled={!answer || speaking} onClick={() => say(answer)}>✅ موافق — قوليه</Button>
            {alts.map((s, i) => <Button key={i} variant="secondary" title={s} disabled={speaking} onClick={() => say(s)}>اقتراح {i + 1}</Button>)}
            <Button variant="outline" className="border-primary-foreground/40 bg-transparent text-primary-foreground" onClick={askAi} disabled={busy}>💡 اقترح لي رد</Button>
          </div>
          <div className="mt-3 flex gap-2">
            <Input ref={customRef} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="اكتب ردك — تنطقه فوراً وتحفظه وتكمّل"
              className="bg-primary-foreground/10 text-primary-foreground placeholder:text-primary-foreground/50"
              onKeyDown={(e) => { if (e.key === "Enter") sendCustom(); }} />
            <Button variant="secondary" onClick={sendCustom}>🗣️ قولي وكمّلي</Button>
          </div>
        </section>
      )}

      {/* عين الصفقة */}
      {log.length >= 2 && (
        <div className="mt-4 text-center">
          <Button onClick={runDealEye} disabled={analyzing} className="bg-gold text-accent-foreground">
            {analyzing ? "👁️ تحلل الصفقة…" : "👁️ عين الصفقة — هل تم البيع؟"}
          </Button>
        </div>
      )}
      {deal && (
        <section className={`mt-4 rounded-2xl border p-5 ${VERDICTS[deal.verdict].cls} bg-[#0b1220]`}>
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl">{VERDICTS[deal.verdict].icon} {VERDICTS[deal.verdict].label}</h3>
            <span className="font-mono text-2xl" dir="ltr">{deal.score}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${deal.score}%` }} />
          </div>
          <p className="mt-3 text-sm">{deal.summary}</p>
          {deal.tips.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm opacity-90">
              {deal.tips.map((t, i) => <li key={i}>💡 {t}</li>)}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
