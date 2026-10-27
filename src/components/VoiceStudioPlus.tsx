import { VoiceModelPicker } from "@/components/VoiceModelPicker";
import { useEffect, useRef, useState } from "react";
import { getVoiceModel, setStudioVoice } from "@/lib/voice-model";
import { transcribeSample } from "@/lib/media.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fishSpeak, fishVoiceInfo, fishClone } from "@/lib/ai.functions";
import { waCtrlSend } from "@/lib/wa-ctrl.functions";
import { waList, voiceStateLoad, voiceStateSave } from "@/lib/studio.functions";
import { STUDIO_VOICES } from "@/lib/studio-voices";
import { supabase } from "@/integrations/supabase/client";

/** Added studio sections: tuned preview, link by ID, custom voice, filters, saved clips. Stored locally. */
type Voice = { id: string; title: string; kind?: "clone" | "id"; vis?: "private" | "unlist"; texts?: string[]; at?: number };
type Fix = { w: string; say: string; ok: "ok" | "fix" | "unclear" };
type Clip = { id: string; text: string; audio: string; sec: number; at: number };
const K = "kingdom_voice_plus";
const MOODS = [["", "طبيعي"], ["friendly", "🤝 ترحيب دافئ"], ["confident", "💪 إقناع وثقة"], ["sincere", "🙏 شكر وامتنان"], ["happy", "😊 عفوي ومرح"], ["calm", "😌 هادئ رايق"]] as const;
const FILTERS = [["", "الكل"], ["غرام", "💖 دلع وغرام وسوالف"], ["سعود", "🇸🇦 سعودي"], ["فخم", "👑 رسمي فخم"], ["ناعم", "🌸 ناعم"], ["إعلاني", "📣 إعلاني"], ["هادئ", "😌 هادئ"], ["بدوي", "🏜️ بدوي"], ["طاقة", "⚡ طاقة"]] as const;
const TABS = [["catalog", "🎭 الجاهزة"], ["clone", "🧬 المستنسخة"], ["pub", "🌍 المنشورة"], ["priv", "🔒 الخاصة"], ["fav", "⭐ المفضلة"], ["search", "🔎 بحث بالمعرّف"]] as const;

type St = { chosen: Voice | null; mine: Voice[]; clips: Clip[]; speed: number; pauses: number; mood: string; fixes?: Fix[]; locked?: boolean };
const DEF: St = { chosen: null, mine: [], clips: [], speed: 1, pauses: 0, mood: "", fixes: [] };
const applyFixes = (t: string, f: Fix[] = []) => f.reduce((a, x) => x.ok === "fix" && x.say ? a.split(x.w).join(x.say) : a, t);

function addPauses(t: string, level: number) {
  if (!level) return t;
  const p = level === 1 ? "، " : "... ";
  return t.replace(/([،,.!؟?])\s*/g, `$1${p}`).replace(/\s+و/g, level === 2 ? `${p}و` : " و");
}

export function VoiceStudioPlus() {
  const [s, setS] = useState<St>(DEF);
  const [sample, setSample] = useState("هلا وغلا نورت متجرنا! آمرني وش ودك فيه؟");
  const [busy, setBusy] = useState("");
  const [vid, setVid] = useState("");
  const [name, setName] = useState("");
  const [priv, setPriv] = useState(true);
  const [file, setFile] = useState<string>("");
  const [rec, setRec] = useState(false);
  const [filter, setFilter] = useState("");
  const [to, setTo] = useState("");
  const [samples, setSamples] = useState<{ data: string; text: string }[]>([]);
  const [vis, setVis] = useState<"private" | "unlist" | "public">("private");
  const [stage, setStage] = useState("");
  const [tab, setTab] = useState<string>("catalog");
  const [q, setQ] = useState("");
  const [retrain, setRetrain] = useState<Voice | null>(null);
  const [word, setWord] = useState("");
  const [say, setSay] = useState("");
  const [last, setLast] = useState<{ text: string; audio: string; sec: number } | null>(null);
  const mr = useRef<MediaRecorder | null>(null);
  const speak = useServerFn(fishSpeak);
  const info = useServerFn(fishVoiceInfo);
  const clone = useServerFn(fishClone);
  const trans = useServerFn(transcribeSample);
  const cache = useRef(new Map<string, string>());
  const [tuneOpen, setTuneOpen] = useState(false);
  const send = useServerFn(waCtrlSend);
  const listWa = useServerFn(waList);
  const [accs, setAccs] = useState<{ name: string; label: string; status: string; number: string }[]>([]);
  const [fromWa, setFromWa] = useState("");
  useEffect(() => {
    listWa().then((l) => setAccs(l)).catch(() => {});
    try { setFromWa(localStorage.getItem(key.current + "_from") || ""); } catch { /* ignore */ }
  }, []);

  // Per-merchant key: each signed-in account sees only its own voices/clips
  const key = useRef(K);
  const loadCloud = useServerFn(voiceStateLoad);
  const saveCloud = useServerFn(voiceStateSave);
  const saveT = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id;
      key.current = uid ? `${K}_${uid}` : K;
      let local: Partial<St> = {};
      try {
        let raw = localStorage.getItem(key.current);
        if (!raw && uid && localStorage.getItem(K)) { raw = localStorage.getItem(K); localStorage.setItem(key.current, raw!); localStorage.removeItem(K); }
        local = JSON.parse(raw || "{}");
        setS({ ...DEF, ...local });
      } catch { /* ignore */ }
      // Cloud copy wins so every device shows the same voices and clips
      try {
        const { state } = await loadCloud();
        if (state) { const c = JSON.parse(state); setS({ ...DEF, ...c }); if (c.chosen?.id) setStudioVoice(c.chosen.id); try { localStorage.setItem(key.current, state); } catch { /* ignore */ } }
        else if (Object.keys(local).length) await saveCloud({ data: { state: JSON.stringify(local) } });
      } catch { /* offline: keep local copy */ }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const up = (p: Partial<St>) => setS((o) => {
    const n = { ...o, ...p }; const json = JSON.stringify(n);
    try { localStorage.setItem(key.current, json); } catch { /* cloud copy still saved */ }
    if (saveT.current) clearTimeout(saveT.current);
    saveT.current = setTimeout(() => { saveCloud({ data: { state: json } }).catch(() => { setTimeout(() => saveCloud({ data: { state: json } }).catch(() => { /* kept on this phone; syncs on next change */ }), 4000); }); }, 800);
    return n;
  });

  const gen = async (voice: Voice | null, text = sample, keep = false) => {
    setBusy(voice?.id ?? "main");
    try {
      const payload = { text: addPauses(applyFixes(text, s.fixes), s.pauses), voiceId: voice?.id ?? "", custom: !!voice, speed: s.speed, volume: 0, emotion: s.mood, model: getVoiceModel() };
      const ck = JSON.stringify(payload);
      let audio = cache.current.get(ck);
      if (!audio) { audio = (await speak({ data: payload })).audio; cache.current.set(ck, audio); }
      const a = new Audio(audio);
      a.onloadedmetadata = () => {
        setLast({ text, audio, sec: Math.round(a.duration || 0) });
        if (keep) up({ clips: [{ id: crypto.randomUUID(), text, audio, sec: Math.round(a.duration || 0), at: Date.now() }, ...s.clips].slice(0, 15) });
      };
      await a.play();
    } catch (e) { toast.error((e as Error).message); }
    setBusy("");
  };
  const choose = (v: Voice) => { up({ chosen: v }); setStudioVoice(v.id); toast.success(`صار الصوت المعتمد: ${v.title}`); };

  const importId = async () => {
    setBusy("id");
    try { const v = await info({ data: { id: vid } }); up({ mine: [...s.mine.filter((m) => m.id !== v.id), { id: v.id, title: v.title }], chosen: { id: v.id, title: v.title } }); toast.success(`✅ ثبّتنا ${v.title}`); setVid(""); }
    catch (e) { toast.error((e as Error).message); }
    setBusy("");
  };

  const toData = (b: Blob) => new Promise<string>((r) => { const f = new FileReader(); f.onload = () => r(String(f.result)); f.readAsDataURL(b); });
  // Decode any browser recording/upload and re-encode as clean 16-bit mono WAV (fixes broken WebM headers)
  const toWav = async (b: Blob): Promise<string> => {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    try {
      const ab = await ctx.decodeAudioData(await b.arrayBuffer());
      const rate = ab.sampleRate, n = ab.length, ch = ab.numberOfChannels;
      const mono = new Float32Array(n);
      for (let c = 0; c < ch; c++) { const d = ab.getChannelData(c); for (let i = 0; i < n; i++) mono[i]! += d[i]! / ch; }
      let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(mono[i]!));
      const g = peak > 0 ? Math.min(0.9 / peak, 4) : 1; // normalize level without clipping
      const buf = new ArrayBuffer(44 + n * 2); const v = new DataView(buf);
      const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true);
      v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
      v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, mono[i]! * g)); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
      return await toData(new Blob([buf], { type: "audio/wav" }));
    } finally { void ctx.close(); }
  };
  const addFiles = async (fs: Blob[]) => {
    for (const f of fs) {
      if (samples.length >= 20) { toast.error("الحد 20 مقطع"); break; }
      if (f.size > 25e6) { toast.error("ملف أكبر من 25MB"); continue; }
      try {
        const data = await toWav(f); setSamples((x) => x.length >= 20 ? x : [...x, { data, text: "✍️ نكتب الكلام تلقائياً…" }]);
        trans({ data: { audio: data } }).then(({ text }) => setSamples((x) => x.map((y) => y.data === data ? { ...y, text: text || "" } : y))).catch(() => setSamples((x) => x.map((y) => y.data === data ? { ...y, text: "" } : y)));
      }
      catch { toast.error("ما قدرنا نقرأ الملف — جرّب صيغة ثانية"); }
    }
  };
  const startRec = async () => {
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
      const m = new MediaRecorder(st); const parts: Blob[] = [];
      m.ondataavailable = (e) => parts.push(e.data);
      m.onstop = async () => { st.getTracks().forEach((t) => t.stop()); setRec(false); await addFiles([new Blob(parts, { type: m.mimeType })]); };
      m.start(); mr.current = m; setRec(true);
      setTimeout(() => { if (m.state === "recording") m.stop(); }, 30000);
    } catch { toast.error("اسمح للمتصفح باستخدام المايك"); }
  };
  const doClone = async () => {
    if (!name.trim() || !samples.length) { toast.error("سجّل أو ارفع مقطع واكتب اسم"); return; }
    setBusy("clone"); setStage("تجهيز المقاطع…");
    const t = setTimeout(() => setStage("توليد البصمة عالية الدقة… (~15–40 ثانية)"), 1200);
    try {
      const allTexts = [...(retrain?.texts ?? []), ...samples.map((x) => x.text)];
      const v = await clone({ data: { name, audios: samples.map((x) => x.data), texts: samples.map((x) => x.text.startsWith("✍️") ? "" : x.text), priv: vis === "private", visibility: vis } });
      const entry: Voice = { id: v.id, title: v.title, kind: "clone", vis: vis === "private" ? "private" : "unlist", texts: allTexts.filter(Boolean).slice(0, 40), at: Date.now() };
      up({ mine: [...s.mine.filter((m) => m.id !== retrain?.id), entry], chosen: entry }); setStudioVoice(entry.id);
      toast.success(`✅ انحفظت البصمة في ${vis === "private" ? "أصواتي الخاصة" : "أصواتي المنشورة"} وصارت الصوت المعتمد${v.visibility !== "private" ? ` — المعرّف: ${v.id}` : ""}`);
      setName(""); setSamples([]); setRetrain(null); setTab("clone");
    } catch (e) { toast.error((e as Error).message); }
    clearTimeout(t); setBusy(""); setStage("");
  };
  const startRetrain = (m: Voice) => { setRetrain(m); setName(m.title); setVis(m.vis === "private" ? "private" : "unlist"); window.scrollTo({ top: 0, behavior: "smooth" }); toast("أضف مقاطع جديدة في قسم الاستنساخ"); };
  const fixes = s.fixes ?? [];
  const rate = (ok: Fix["ok"]) => {
    const w = word.trim(); if (!w) return;
    up({ fixes: [{ w, say: ok === "fix" ? say.trim() : "", ok }, ...fixes.filter((f) => f.w !== w)].slice(0, 200) });
    toast.success(ok === "ok" ? "✅ اعتمدناها" : ok === "fix" ? "🛠️ انحفظ التصحيح ويطبق تلقائياً" : "🤔 انحفظت للمراجعة");
    setWord(""); setSay("");
  };
  const importIdRaw = async (id: string) => {
    setBusy("id");
    try { const v = await info({ data: { id } }); up({ mine: [...s.mine.filter((m) => m.id !== v.id), { id: v.id, title: v.title, kind: "id" }], chosen: { id: v.id, title: v.title } }); toast.success(`✅ ثبّتنا ${v.title}`); setVid(""); setQ(""); }
    catch (e) { toast.error((e as Error).message); }
    setBusy("");
  };
  const mineOf = (k: string) => s.mine.filter((m) => k === "clone" ? m.kind === "clone" : k === "pub" ? m.kind === "clone" && m.vis !== "private" : k === "priv" ? m.kind === "clone" && m.vis === "private" : k === "fav" ? m.kind !== "clone" : false);
  const searchList: [string, string][] = q.trim() ? [...STUDIO_VOICES, ...s.mine.map((m) => [m.id, m.title] as [string, string])].filter(([id, t], i, a) => (t.includes(q.trim()) || id.startsWith(q.trim())) && a.findIndex((x) => x[0] === id) === i) : [];
  const sendClip = async (c: Clip) => {
    if (to.replace(/\D/g, "").length < 8) { toast.error("اكتب رقم العميل"); return; }
    setBusy(c.id);
    const inst = fromWa || accs.find((a) => a.status === "open")?.name || "";
    if (!inst) { toast.error("ما فيه واتساب متصل — اربط رقم أول من لوحة الواتساب"); setBusy(""); return; }
    try { await send({ data: { instance: inst, to: to.replace(/\D/g, ""), text: c.text, voice: true, audio: c.audio } }); toast.success("🎙️ انرسل كفويس أزرق بنفس الصوت"); }
    catch (e) { toast.error((e as Error).message); }
    setBusy("");
  };

  const list = STUDIO_VOICES.filter(([, t]) => !filter || t.includes(filter) || (filter === "سعود" && true) || (filter === "غرام" && /رومانس|دلع|دلوع|حنون|جذاب|كيوت/.test(t)));
  const card = "rounded-2xl border bg-card p-5 shadow-soft";
  const pill = (on: boolean) => `shrink-0 rounded-full border px-3 py-1.5 text-xs ${on ? "bg-primary text-primary-foreground" : "bg-background"}`;

  return (
    <div className="space-y-6">
      <section className={card}>
        <h2 className="font-display text-lg text-primary">🎚️ الموازين الواقعية</h2>
        <VoiceModelPicker className="mt-2" />
        <p className="mt-1 text-sm">الصوت المعتمد: <b>{s.chosen?.title ?? "الصوت المدمج"}</b> {s.chosen && <span dir="ltr" className="text-xs text-muted-foreground">{s.chosen.id.slice(0, 10)}…</span>}</p>
        <label className="mt-3 block text-sm font-medium">جملة المعاينة</label>
        <Input value={sample} onChange={(e) => setSample(e.target.value.slice(0, 300))} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setTuneOpen((o) => !o)}>🎛️ ضبط النبرة والمشاعر {tuneOpen ? "▲" : "▼"}</Button>
          <span className="text-xs text-muted-foreground">{s.locked ? "🔒 مثبتة" : s.speed === 1 && !s.pauses && !s.mood ? "🔄 تلقائي" : "✏️ مخصصة"} — {s.speed.toFixed(2)}x · {["بدون", "خفيفة", "طبيعية"][s.pauses]} · {MOODS.find(([k]) => k === s.mood)?.[1]}</span>
        </div>
        {tuneOpen && <div className="mt-3 animate-in fade-in slide-in-from-top-1 rounded-xl border p-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={s.speed === 1 && !s.pauses && !s.mood} onChange={(e) => e.target.checked ? up({ speed: 1, pauses: 0, mood: "", locked: false }) : up({ locked: false })} disabled={s.locked} /> 🔄 تلقائي (اطفه عشان تضبط بنفسك)</label>
        <fieldset disabled={s.locked} className="disabled:opacity-60">
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div><label className="text-sm font-medium">السرعة: {s.speed.toFixed(1)}x</label>
            <input type="range" min={0.7} max={1.3} step={0.05} value={s.speed} onChange={(e) => up({ speed: Number(e.target.value) })} className="w-full accent-primary" /></div>
          <div><label className="text-sm font-medium">الوقفات والتنفس: {["بدون", "خفيفة", "طبيعية"][s.pauses]}</label>
            <input type="range" min={0} max={2} step={1} value={s.pauses} onChange={(e) => up({ pauses: Number(e.target.value) })} className="w-full accent-primary" /></div>
          <div><label className="text-sm font-medium">نمط المشاعر</label>
            <select value={s.mood} onChange={(e) => up({ mood: e.target.value })} className="mt-1 w-full rounded-md border bg-background px-2 py-2 text-sm">
              {MOODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        </div>
        </fieldset>
        <div className="mt-3 flex gap-2">
          {s.locked ? <Button size="sm" variant="outline" onClick={() => up({ locked: false })}>✏️ فك التثبيت وعدّل</Button>
            : <Button size="sm" onClick={() => { up({ locked: true }); toast.success("🔒 انحفظت النبرة وثبتت في كل الأجهزة"); }}>💾 حفظ وتثبيت النبرة</Button>}
        </div>
        </div>}
        <p className="mt-2 text-xs text-muted-foreground">نعومة ودرجة النبرة تعتمد على الصوت نفسه — اختر صوت ناعم من المكتبة.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => gen(s.chosen)} disabled={!!busy}>{busy === (s.chosen?.id ?? "main") ? "🔊…" : "▶ جرّب الصوت الموزون"}</Button>
          <Button variant="secondary" onClick={() => gen(s.chosen, sample, true)} disabled={!!busy}>💾 ولّد واحفظ في الخزينة</Button>
          {last && <Button variant="outline" onClick={() => { up({ clips: [{ id: crypto.randomUUID(), ...last, at: Date.now() }, ...s.clips].slice(0, 15) }); toast.success("✅ انحفظ نفس المقطع اللي سمعته"); setLast(null); }} disabled={!!busy}>💾 احفظ اللي سمعته في الخزينة</Button>}
        </div>
      </section>
      <Sec title={`🗄️ خزينة المقاطع (${s.clips.length})`}>
        <p className="mb-2 text-xs text-muted-foreground">🟢 يرسل نفس المقطع اللي سمعته كفويس أزرق، ويظهر عند العميل «جاري التسجيل…» قبل وصوله.</p>
        <label className="mb-1 block text-sm font-medium">📱 أرسل من رقم:</label>
        <select value={fromWa} onChange={(e) => { setFromWa(e.target.value); try { localStorage.setItem(key.current + "_from", e.target.value); } catch { /* ignore */ } }} className="mb-2 w-full rounded-md border bg-background px-2 py-2 text-sm">
          <option value="">تلقائي (أول رقم متصل)</option>
          {accs.map((a) => <option key={a.name} value={a.name} disabled={a.status !== "open"}>{a.status === "open" ? "🟢" : "🔴"} {a.label}{a.number ? ` — ${a.number}` : " (غير متصل)"}</option>)}
        </select>
        <Input dir="ltr" className="mb-3" value={to} onChange={(e) => setTo(e.target.value)} placeholder="رقم العميل للإرسال 9665…" />
        {!s.clips.length ? <p className="text-sm text-muted-foreground">ما فيه مقاطع محفوظة. اسمع الصوت ثم اضغط «احفظ اللي سمعته في الخزينة».</p> : (
          <>
            <ul className="max-h-[60vh] space-y-2 overflow-y-auto rounded-xl bg-secondary/40 p-2">
              {s.clips.map((c) => (
                <li key={c.id} className="animate-in fade-in slide-in-from-bottom-2 mr-auto max-w-[92%] rounded-2xl rounded-tl-sm bg-card p-2 text-sm shadow-soft">
                  <p className="line-clamp-2">{c.text}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <audio controls src={c.audio} className="h-8 w-full" />
                    <span className="text-[10px] text-muted-foreground">{c.sec} ث · {new Date(c.at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}</span>
                    <Button size="sm" onClick={() => sendClip(c)} disabled={!!busy}>{busy === c.id ? "…" : "🎙️ أرسل للواتساب"}</Button>
                    <Button size="sm" variant="ghost" onClick={() => up({ clips: s.clips.filter((x) => x.id !== c.id) })}>🗑️</Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Sec>

      <Sec title="🔗 ربط صوت خارجي بالمعرّف">
        <div className="flex gap-2">
          <Input dir="ltr" value={vid} onChange={(e) => setVid(e.target.value)} placeholder="Voice ID" />
          <Button onClick={importId} disabled={!vid.trim() || !!busy}>{busy === "id" ? "…" : "فحص وتثبيت"}</Button>
        </div>
      </Sec>

      <Sec title={retrain ? `🧬 إعادة تدريب: ${retrain.title}` : "🧬 استنساخ صوت جديد"} open={!!retrain || samples.length > 0}>
        <p className="text-xs text-muted-foreground">سجّل أو ارفع من 1 إلى 20 مقطع (كل مقطع 15–30 ثانية بصوت واضح بدون موسيقى). كل ما زادت المقاطع تعلّم النبرة والنطق السعودي أدق. التسجيل يكون بنقاوة استوديو بدون وشيش وبدون تضخيم.</p>
        {retrain && <p className="mt-2 rounded-lg bg-secondary p-2 text-xs">رجعنا لك نصوص التدريب المحفوظة لهذا الصوت. أضف مقاطع جديدة واضغط استنساخ، وبيتحدث الصوت مكان القديم. <button className="underline" onClick={() => { setRetrain(null); setName(""); setSamples([]); }}>إلغاء</button></p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {rec ? <Button variant="destructive" onClick={() => mr.current?.stop()}>⏹️ إيقاف التسجيل</Button> : <Button variant="secondary" onClick={startRec} disabled={samples.length >= 20}>🎙️ سجّل مقطع</Button>}
          <label className="cursor-pointer rounded-md border px-3 py-2 text-sm">📁 رفع ملفات
            <input type="file" accept="audio/*" multiple className="hidden" onChange={async (e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; await addFiles(fs); }} /></label>
        </div>
        {retrain?.texts?.filter(Boolean).length ? (
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{retrain.texts.filter(Boolean).map((t, i) => <li key={i}>📖 {t}</li>)}</ul>
        ) : null}
        {samples.length > 0 && (
          <ul className="mt-3 space-y-2">
            {samples.map((sm, i) => (
              <li key={i} className="animate-in fade-in slide-in-from-bottom-2 rounded-xl border p-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">#{i + 1}</span>
                  <audio controls src={sm.data} className="h-9 flex-1" />
                  <button onClick={() => setSamples((x) => x.filter((_, j) => j !== i))} aria-label="حذف المقطع">✕</button>
                </div>
                <Input className="mt-2" value={sm.text} onChange={(e) => setSamples((x) => x.map((y, j) => j === i ? { ...y, text: e.target.value } : y))} placeholder="اختياري: اكتب الكلام اللي قيل في المقطع بالضبط (يحسن النطق)" />
              </li>
            ))}
          </ul>
        )}
        <Input className="mt-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الصوت (مثلاً: صوت ندى)" />
        <label className="mt-3 block text-sm font-medium">وين ينحفظ الصوت؟</label>
        <select value={vis} onChange={(e) => setVis(e.target.value as typeof vis)} className="mt-1 w-full rounded-md border bg-background px-2 py-2 text-sm">
          <option value="private">🔒 أصواتي الخاصة (لي فقط)</option>
          <option value="unlist">🔗 أصواتي المنشورة بالمعرّف</option>
          <option value="public">🌍 أصواتي المنشورة للناس</option>
        </select>
        {vis === "public" && <p className="mt-1 text-xs text-muted-foreground">ملاحظة: مزود الأصوات ما يسمح بالنشر العام من خارج موقعه، فبيُحفظ «بالرابط» وتقدر تشارك المعرّف مع الناس يستنسخون منه.</p>}
        <Button className="mt-3" onClick={doClone} disabled={!!busy}>{busy === "clone" ? `🧬 ${stage}` : `${retrain ? "إعادة استنساخ" : "استنساخ"} وحفظ البصمة (${samples.length} مقطع)`}</Button>
      </Sec>

      <Sec title="🎓 مختبر تعليم النطق" open={false}>
        <p className="text-xs text-muted-foreground">اكتب كلمة أو جملة واسمعها بالصوت المعتمد، ثم قيّمها. الكلمات المصححة تنطبق تلقائياً في كل توليد.</p>
        <div className="mt-2 flex gap-2">
          <Input value={word} onChange={(e) => setWord(e.target.value)} placeholder="مثلاً: يا عمري، وش تبي؟" />
          <Button variant="secondary" onClick={() => word.trim() && gen(s.chosen, word)} disabled={!!busy || !word.trim()}>▶</Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => rate("ok")} disabled={!word.trim()}>✅ صح واعتمدها</Button>
          <Button size="sm" variant="outline" onClick={() => rate("unclear")} disabled={!word.trim()}>🤔 مو واضحة</Button>
          <Button size="sm" variant="destructive" onClick={() => rate("fix")} disabled={!word.trim() || !say.trim()}>❌ غلط — صححها</Button>
        </div>
        <Input className="mt-2" value={say} onChange={(e) => setSay(e.target.value)} placeholder="كيف تنطق صح؟ اكتبها بالتشكيل أو مثل ما تنقال (مثلاً: يَا عُمْرِي)" />
        {say.trim() && <Button size="sm" variant="ghost" className="mt-1" onClick={() => gen(s.chosen, say)} disabled={!!busy}>▶ اسمع التصحيح</Button>}
        {fixes.length > 0 && (
          <ul className="mt-3 space-y-1">
            {fixes.map((f, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                <span>{f.ok === "ok" ? "✅" : f.ok === "fix" ? "🛠️" : "🤔"}</span>
                <span className="flex-1 truncate">{f.w}{f.say ? ` ← ${f.say}` : ""}</span>
                <button onClick={() => gen(s.chosen, f.say || f.w)}>▶</button>
                <button onClick={() => up({ fixes: fixes.filter((_, j) => j !== i) })} aria-label="حذف">✕</button>
              </li>
            ))}
          </ul>
        )}
      </Sec>

      <section className={card}>
        <h2 className="font-display mb-3 text-lg text-primary">🎭 كتالوج الأصوات</h2>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {TABS.map(([k, l]) => <button key={k} className={pill(tab === k)} onClick={() => setTab(k)}>{l}{k !== "catalog" && k !== "search" ? ` (${mineOf(k).length})` : ""}</button>)}
        </div>
        {tab === "search" && (
          <div className="mt-2 space-y-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو الصق المعرّف (Voice ID)" />
            {/^[a-f0-9]{24,40}$/i.test(q.trim()) && <Button size="sm" onClick={() => { setVid(q.trim()); void importIdRaw(q.trim()); }} disabled={!!busy}>🔗 فحص وتثبيت هذا المعرّف</Button>}
          </div>
        )}
        {tab === "catalog" && <div className="flex gap-2 overflow-x-auto pb-2">{FILTERS.map(([k, l]) => <button key={k} className={pill(filter === k)} onClick={() => setFilter(k)}>{l}</button>)}</div>}
        {(tab === "catalog" || tab === "search") ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {(tab === "search" ? searchList : list).map(([id, t]) => (
              <li key={id} className={`flex items-center gap-2 rounded-xl border p-2 transition-all ${s.chosen?.id === id ? "border-primary bg-secondary" : "bg-background"}`}>
                <span className="flex-1 truncate text-sm">{t}</span>
                <Button size="sm" variant="secondary" onClick={() => gen({ id, title: t })} disabled={!!busy}>{busy === id ? "🔊" : "▶"}</Button>
                <Button size="sm" onClick={() => choose({ id, title: t })}>اختر</Button>
                <button onClick={() => up({ mine: s.mine.some((m) => m.id === id) ? s.mine.filter((m) => m.id !== id) : [...s.mine, { id, title: t }] })}>{s.mine.some((m) => m.id === id) ? "⭐" : "☆"}</button>
              </li>
            ))}
          </ul>
        ) : (
          !mineOf(tab).length ? <p className="mt-3 text-sm text-muted-foreground">ما فيه أصوات هنا للحين. استنسخ صوت واختر وين ينحفظ.</p> : (
            <ul className="mt-3 space-y-2">
              {mineOf(tab).map((m) => (
                <li key={m.id} className={`animate-in fade-in rounded-xl border p-2 ${s.chosen?.id === m.id ? "border-primary bg-secondary" : "bg-background"}`}>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate text-sm">{m.vis === "private" ? "🔒" : m.vis ? "🌍" : "⭐"} {m.title}</span>
                    <Button size="sm" variant="secondary" onClick={() => gen(m)} disabled={!!busy}>{busy === m.id ? "🔊" : "▶"}</Button>
                    <Button size="sm" onClick={() => choose(m)}>{s.chosen?.id === m.id ? "📌 مثبت" : "اختر"}</Button>
                  </div>
                  {m.texts?.filter(Boolean).length ? <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">📖 الكلام داخل الصوت ({m.texts.filter(Boolean).length})</summary><ul className="mt-1 space-y-1">{m.texts.filter(Boolean).map((t, i) => <li key={i}>• {t}</li>)}</ul></details> : null}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {m.vis && m.vis !== "private" && <button className="rounded-full border px-2 py-1" onClick={() => { navigator.clipboard?.writeText(m.id); toast.success("انسخ المعرّف — شاركه"); }}>📋 نسخ المعرّف</button>}
                    {m.kind === "clone" && <button className="rounded-full border px-2 py-1" onClick={() => startRetrain(m)}>🔁 إعادة استنساخ وتدريب</button>}
                    {m.kind === "clone" && <button className="rounded-full border px-2 py-1" onClick={() => up({ mine: s.mine.map((x) => x.id === m.id ? { ...x, vis: x.vis === "private" ? "unlist" : "private" } : x) })}>{m.vis === "private" ? "🌍 انقله للمنشورة" : "🔒 انقله للخاصة"}</button>}
                    <button className="rounded-full border px-2 py-1" onClick={() => up({ mine: s.mine.filter((x) => x.id !== m.id) })}>✕ إزالة</button>
                  </div>
                </li>
              ))}
            </ul>
          )
        )}
      </section>

    </div>
  );
}

function Sec({ title, open = false, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group rounded-2xl border bg-card p-5 shadow-soft">
      <summary className="font-display flex cursor-pointer list-none items-center justify-between text-lg text-primary">
        {title}<span className="text-sm transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="mt-3 animate-in fade-in slide-in-from-top-1">{children}</div>
    </details>
  );
}
