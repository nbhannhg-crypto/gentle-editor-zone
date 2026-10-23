import { VoiceModelPicker } from "@/components/VoiceModelPicker";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { analyzeDeal, suggestReplies } from "@/lib/ai.functions";
import { addRule, recordUse, type Rule } from "@/lib/rules";
import { useReplyEngine, type Mode } from "@/routes/_authenticated/app";
import { useSpeaker, loadVoice, EMOTIONS } from "@/components/VoiceStudio";

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
  const [deal, setDeal] = useState<Deal | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [emotion, setEmotion] = useState("");
  const recRef = useRef<SR | null>(null);
  const liveRef = useRef(false);
  const mutedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const engine = useReplyEngine(rules, mode, product);
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
  const [ctl, setCtl] = useState({ autoSay: true, echoGuard: true, dedupe: true, showInterim: true, waitMs: 600 });
  const sayRef = useRef<(t: string) => void>(() => {});
  const ctlRef = useRef(ctl);
  const speakingRef = useRef(false);
  const lastHeard = useRef<{ t: string; at: number }>({ t: "", at: 0 });
  const pendingRef = useRef<{ text: string; timer: ReturnType<typeof setTimeout> | null }>({ text: "", timer: null });
  useEffect(() => { try { const s = localStorage.getItem("kingdom_call_ctl"); if (s) setCtl((c) => ({ ...c, ...JSON.parse(s) })); } catch { /* ignore */ } }, []);
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
  const handleCustomer = async (text: string) => {
    setCustomer(text); setBusy(true);
    setLog((l) => [...l, { who: "c", t: text }]);
    try {
      const r = await engine(text);
      setAnswer(r.answer);
      const others = r.matches.filter((m) => m.rule.response_text !== r.answer).map((m) => m.rule.response_text);
      setAlts([...new Set(others)].slice(0, 3));
      recordUse(text, r.rule).then(reload);
      if (ctlRef.current.autoSay && r.answer && liveRef.current) sayRef.current(r.answer);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };

  // يجمع الكلام النهائي وينتظر لحظة صمت قصيرة قبل الرد — يمنع تقطيع الجملة وتكرارها
  const queueHeard = (fin: string) => {
    const c = ctlRef.current;
    const n = norm(fin);
    if (!n) return;
    if (c.echoGuard) {
      const s = lastSaid.current;
      if (s.t && Date.now() - s.at < 6000 && (s.t.includes(n) || n.includes(s.t))) return; // صدى كلامها هي
    }
    if (c.dedupe) {
      const last = lastHeard.current;
      if (Date.now() - last.at < 4000 && (last.t === n || last.t.includes(n))) return;
    }
    const p = pendingRef.current;
    const pn = norm(p.text);
    p.text = pn && n.startsWith(pn) ? fin : pn && pn.includes(n) ? p.text : (p.text ? p.text + " " : "") + fin;
    if (p.timer) clearTimeout(p.timer);
    p.timer = setTimeout(() => {
      const full = p.text.trim(); p.text = ""; p.timer = null;
      if (!full) return;
      lastHeard.current = { t: norm(full), at: Date.now() };
      setInterim("");
      handleCustomer(full);
    }, Math.min(c.waitMs, 300));
  };

  const start = () => {
    const W = window as any;
    const C = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!C) { toast.error("المتصفح ما يدعم سماع الصوت. استخدم Chrome أو اكتب كلام الزبون."); return; }
    const rec: SR = new C();
    rec.lang = "ar-SA"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (e: any) => {
      if (mutedRef.current) return;
      if (ctlRef.current.echoGuard && speakingRef.current) return; // لا تسمع صوت الموظفة نفسها
      let fin = "", tmp = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += t; else tmp += t;
      }
      if (ctlRef.current.showInterim) setInterim(tmp);
      if (fin.trim()) queueHeard(fin.trim());
    };
    rec.onerror = (ev: any) => { if (ev?.error === "not-allowed") { toast.error("🎙️ اسمح للمايك من إعدادات المتصفح"); stop(); } };
    rec.onend = () => { if (liveRef.current && !speakingRef.current) try { rec.start(); } catch { /* ignore */ } };
    recRef.current = rec; liveRef.current = true;
    try { rec.start(); } catch { /* ignore */ }
    setLive(true); setSeconds(0); setDeal(null); setLog([]); setAnswer(""); setCustomer("");
  };

  const stop = () => {
    liveRef.current = false; recRef.current?.stop();
    setLive(false); setInterim(""); audioRef.current?.pause(); setSpeaking(false); setRecording(false);
  };

  // تبادل أدوار: وهي تتكلم المايك مقفل كلياً، وبعد ما تخلص يرجع يسمع
  const lastSaid = useRef<{ t: string; at: number }>({ t: "", at: 0 });
  const micOff = () => {
    speakingRef.current = true;
    const p = pendingRef.current; if (p.timer) clearTimeout(p.timer); p.text = ""; p.timer = null;
    setInterim("");
    try { recRef.current?.abort?.(); } catch { /* ignore */ }
  };
  const micOn = () => {
    setTimeout(() => {
      speakingRef.current = false; setSpeaking(false);
      if (liveRef.current && recRef.current) try { recRef.current.start(); } catch { /* already running */ }
    }, 400);
  };
  const saySeqK = useRef(0);
  const say = async (text: string) => {
    if (!text.trim()) return;
    const guard = ctlRef.current.echoGuard;
    const my = ++saySeqK.current;
    setSpeaking(true);
    lastSaid.current = { t: norm(text), at: Date.now() };
    setLog((l) => [...l, { who: "a", t: text }]);
    try {
      const audio = await tts(text, { emotion });
      if (my !== saySeqK.current) return; // رد أحدث وصل
      // المايك يبقى مفتوح وقت تجهيز الصوت، وينقفل فقط لحظة خروج الصوت
      if (guard) micOff();
      audioRef.current?.pause();
      const a = new Audio(audio); audioRef.current = a;
      a.volume = loud ? 1 : 0.3;
      const done = () => { lastSaid.current.at = Date.now(); if (guard) micOn(); else setSpeaking(false); };
      a.onended = done; a.onerror = done;
      await a.play();
    } catch (e) { toast.error((e as Error).message); if (guard) micOn(); else setSpeaking(false); }
  };

  sayRef.current = say;

  const sendCustom = async () => {
    const t = custom.trim();
    if (!t) return;
    say(t);
    if (customer) {
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
              <button onClick={() => setRecording((r) => !r)} className={`flex h-13 w-13 items-center justify-center rounded-full p-3.5 text-xl transition ${recording ? "animate-pulse bg-rose-500" : "bg-white/15"}`} aria-label="تسجيل">{recording ? "⏺️" : "⚪"}</button>
            </>
          )}
        </div>
        {recording && live && <p className="pb-4 text-center text-xs text-rose-300">⏺️ جاري تسجيل المكالمة</p>}
      </section>

      {/* 🎛️ لوحة تحكم مكالمة المملكة */}
      <section className="mt-4 rounded-2xl border bg-card p-4">
        <h3 className="font-display mb-3 text-lg">🎛️ لوحة تحكم مكالمة المملكة</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            ["autoSay", "🗣️ ترد بالصوت تلقائياً (بدون موافقة)"],
            ["echoGuard", "🔇 ما تسمع نفسها وهي تتكلم (منع الصدى)"],
            ["dedupe", "🧹 منع تكرار الكلمات والجمل"],
            ["showInterim", "👀 أشوف الكلام وهو ينكتب"],
          ] as const).map(([k, l]) => (
            <label key={k} className="flex cursor-pointer items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2 text-sm">
              <span>{l}</span>
              <input type="checkbox" className="h-5 w-5 accent-primary" checked={ctl[k]} onChange={(e) => setCtl((c) => ({ ...c, [k]: e.target.checked }))} />
            </label>
          ))}
        </div>
        <label className="mt-3 block text-sm">
          ⏱️ تنتظر بعد ما تخلص كلامك: <b dir="ltr">{(ctl.waitMs / 1000).toFixed(1)}s</b>
          <input type="range" min={200} max={2000} step={100} value={ctl.waitMs} onChange={(e) => setCtl((c) => ({ ...c, waitMs: Number(e.target.value) }))} className="mt-1 w-full accent-primary" />
          <span className="text-xs text-muted-foreground">أقل = أسرع رد، أكثر = ما تقاطعك وسط الجملة</span>
        </label>
        {log.length > 0 && <Button variant="outline" size="sm" className="mt-3" onClick={() => { setLog([]); setCustomer(""); setAnswer(""); }}>🗑️ مسح المحادثة</Button>}
      </section>

      {/* إدخال كلام الزبون يدوياً */}
      {live && (
        <div className="mt-4 flex gap-2">
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="اكتب كلام الزبون هنا…"
            onKeyDown={(e) => { if (e.key === "Enter" && typed.trim()) { handleCustomer(typed.trim()); setTyped(""); } }} />
          <Button variant="secondary" onClick={() => { if (typed.trim()) { handleCustomer(typed.trim()); setTyped(""); } }}>أرسل</Button>
          <select value={emotion} onChange={(e) => setEmotion(e.target.value)} className="rounded-md border bg-background px-2 text-sm" aria-label="المشاعر">
            {EMOTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      )}

      {/* المحادثة الحية */}
      {log.length > 0 && (
        <section className="mt-4 space-y-2 rounded-2xl border bg-card p-4">
          {interim && <p className="text-sm text-muted-foreground">الزبون يقول الآن: … {interim}</p>}
          {log.slice(-8).map((m, i) => (
            <div key={i} className={`flex ${m.who === "a" ? "justify-start" : "justify-end"}`}>
              <p className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.who === "a" ? "bg-royal text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                {m.who === "a" ? "👩‍💼 " : "🧑 "}{m.t}
              </p>
            </div>
          ))}
        </section>
      )}

      {/* رد الموظفة */}
      {live && customer && (
        <section className="mt-4 rounded-2xl bg-royal p-5 text-primary-foreground shadow-soft">
          <p className="text-sm opacity-80">👩‍💼 الرد المقترح:</p>
          <p className="font-display mt-2 min-h-10 text-xl leading-relaxed">{busy ? "تفكر…" : answer || "ما عندها رد من تعليمك — اطلب اقتراح أو اكتب ردك"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button className="bg-gold text-accent-foreground" disabled={!answer || speaking} onClick={() => say(answer)}>✅ موافق — قوليه</Button>
            {alts.map((s, i) => <Button key={i} variant="secondary" title={s} disabled={speaking} onClick={() => say(s)}>اقتراح {i + 1}</Button>)}
            <Button variant="outline" className="border-primary-foreground/40 bg-transparent text-primary-foreground" onClick={askAi} disabled={busy}>💡 اقترح لي رد</Button>
          </div>
          <div className="mt-3 flex gap-2">
            <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="اكتب رد مختلف — بتقوله وتحفظه كقاعدة"
              className="bg-primary-foreground/10 text-primary-foreground placeholder:text-primary-foreground/50"
              onKeyDown={(e) => { if (e.key === "Enter") sendCustom(); }} />
            <Button variant="secondary" onClick={sendCustom}>قوليها</Button>
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
