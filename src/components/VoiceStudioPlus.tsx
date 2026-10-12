import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fishSpeak, fishVoiceInfo, fishClone } from "@/lib/ai.functions";
import { waCtrlSend } from "@/lib/wa-ctrl.functions";
import { STUDIO_VOICES } from "@/lib/studio-voices";

/** Added studio sections: tuned preview, link by ID, custom voice, filters, saved clips. Stored locally. */
type Voice = { id: string; title: string };
type Clip = { id: string; text: string; audio: string; sec: number; at: number };
const K = "kingdom_voice_plus";
const MOODS = [["", "طبيعي"], ["friendly", "🤝 ترحيب دافئ"], ["confident", "💪 إقناع وثقة"], ["sincere", "🙏 شكر وامتنان"], ["happy", "😊 عفوي ومرح"], ["calm", "😌 هادئ رايق"]] as const;
const FILTERS = [["", "الكل"], ["سعود", "🇸🇦 سعودي"], ["فخم", "👑 رسمي فخم"], ["ناعم", "🌸 ناعم"], ["إعلاني", "📣 إعلاني"], ["هادئ", "😌 هادئ"], ["بدوي", "🏜️ بدوي"], ["طاقة", "⚡ طاقة"]] as const;

type St = { chosen: Voice | null; mine: Voice[]; clips: Clip[]; speed: number; pauses: number; mood: string };
const DEF: St = { chosen: null, mine: [], clips: [], speed: 1, pauses: 0, mood: "" };

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
  const mr = useRef<MediaRecorder | null>(null);
  const speak = useServerFn(fishSpeak);
  const info = useServerFn(fishVoiceInfo);
  const clone = useServerFn(fishClone);
  const send = useServerFn(waCtrlSend);

  useEffect(() => { try { setS({ ...DEF, ...JSON.parse(localStorage.getItem(K) || "{}") }); } catch { /* ignore */ } }, []);
  const up = (p: Partial<St>) => setS((o) => { const n = { ...o, ...p }; try { localStorage.setItem(K, JSON.stringify(n)); } catch { toast.error("المساحة امتلأت، احذف مقاطع قديمة"); } return n; });

  const gen = async (voice: Voice | null, text = sample, keep = false) => {
    setBusy(voice?.id ?? "main");
    try {
      const { audio } = await speak({ data: { text: addPauses(text, s.pauses), voiceId: voice?.id ?? "", custom: !!voice, speed: s.speed, volume: 0, emotion: s.mood } });
      const a = new Audio(audio);
      a.onloadedmetadata = () => {
        if (keep) up({ clips: [{ id: crypto.randomUUID(), text, audio, sec: Math.round(a.duration || 0), at: Date.now() }, ...s.clips].slice(0, 15) });
      };
      await a.play();
    } catch (e) { toast.error((e as Error).message); }
    setBusy("");
  };
  const choose = (v: Voice) => { up({ chosen: v }); toast.success(`صار الصوت المعتمد: ${v.title}`); };

  const importId = async () => {
    setBusy("id");
    try { const v = await info({ data: { id: vid } }); up({ mine: [...s.mine.filter((m) => m.id !== v.id), { id: v.id, title: v.title }], chosen: { id: v.id, title: v.title } }); toast.success(`✅ ثبّتنا ${v.title}`); setVid(""); }
    catch (e) { toast.error((e as Error).message); }
    setBusy("");
  };

  const toData = (b: Blob) => new Promise<string>((r) => { const f = new FileReader(); f.onload = () => r(String(f.result)); f.readAsDataURL(b); });
  const startRec = async () => {
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true });
      const m = new MediaRecorder(st); const parts: Blob[] = [];
      m.ondataavailable = (e) => parts.push(e.data);
      m.onstop = async () => { st.getTracks().forEach((t) => t.stop()); setFile(await toData(new Blob(parts, { type: m.mimeType }))); setRec(false); };
      m.start(); mr.current = m; setRec(true);
      setTimeout(() => { if (m.state === "recording") m.stop(); }, 30000);
    } catch { toast.error("اسمح للمتصفح باستخدام المايك"); }
  };
  const doClone = async () => {
    if (!name.trim() || !file) { toast.error("سجّل أو ارفع مقطع واكتب اسم"); return; }
    setBusy("clone");
    try { const v = await clone({ data: { name, audio: file, priv } }); up({ mine: [...s.mine, v], chosen: v }); toast.success("✅ انحفظت البصمة الصوتية"); setName(""); setFile(""); }
    catch (e) { toast.error((e as Error).message); }
    setBusy("");
  };
  const sendClip = async (c: Clip) => {
    if (to.replace(/\D/g, "").length < 8) { toast.error("اكتب رقم العميل"); return; }
    setBusy(c.id);
    try { await send({ data: { instance: "default", to: to.replace(/\D/g, ""), text: c.text, voice: true } }); toast.success("🎙️ انرسل كفويس"); }
    catch (e) { toast.error((e as Error).message); }
    setBusy("");
  };

  const list = STUDIO_VOICES.filter(([, t]) => !filter || t.includes(filter) || (filter === "سعود" && true));
  const card = "rounded-2xl border bg-card p-5 shadow-soft";
  const pill = (on: boolean) => `shrink-0 rounded-full border px-3 py-1.5 text-xs ${on ? "bg-primary text-primary-foreground" : "bg-background"}`;

  return (
    <div className="space-y-6">
      <section className={card}>
        <h2 className="font-display text-lg text-primary">🎚️ الموازين الواقعية</h2>
        <p className="mt-1 text-sm">الصوت المعتمد: <b>{s.chosen?.title ?? "الصوت المدمج"}</b> {s.chosen && <span dir="ltr" className="text-xs text-muted-foreground">{s.chosen.id.slice(0, 10)}…</span>}</p>
        <label className="mt-3 block text-sm font-medium">جملة المعاينة</label>
        <Input value={sample} onChange={(e) => setSample(e.target.value.slice(0, 300))} />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div><label className="text-sm font-medium">السرعة: {s.speed.toFixed(1)}x</label>
            <input type="range" min={0.7} max={1.3} step={0.05} value={s.speed} onChange={(e) => up({ speed: Number(e.target.value) })} className="w-full accent-primary" /></div>
          <div><label className="text-sm font-medium">الوقفات والتنفس: {["بدون", "خفيفة", "طبيعية"][s.pauses]}</label>
            <input type="range" min={0} max={2} step={1} value={s.pauses} onChange={(e) => up({ pauses: Number(e.target.value) })} className="w-full accent-primary" /></div>
          <div><label className="text-sm font-medium">نمط المشاعر</label>
            <select value={s.mood} onChange={(e) => up({ mood: e.target.value })} className="mt-1 w-full rounded-md border bg-background px-2 py-2 text-sm">
              {MOODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">نعومة ودرجة النبرة تعتمد على الصوت نفسه — اختر صوت ناعم من المكتبة.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => gen(s.chosen)} disabled={!!busy}>{busy === (s.chosen?.id ?? "main") ? "🔊…" : "▶ جرّب الصوت الموزون"}</Button>
          <Button variant="secondary" onClick={() => gen(s.chosen, sample, true)} disabled={!!busy}>💾 ولّد واحفظ في الخزينة</Button>
        </div>
      </section>

      <section className={card}>
        <h2 className="font-display mb-2 text-lg text-primary">🔗 ربط صوت خارجي بالمعرّف</h2>
        <div className="flex gap-2">
          <Input dir="ltr" value={vid} onChange={(e) => setVid(e.target.value)} placeholder="Voice ID" />
          <Button onClick={importId} disabled={!vid.trim() || !!busy}>{busy === "id" ? "…" : "فحص وتثبيت"}</Button>
        </div>
      </section>

      <section className={card}>
        <h2 className="font-display mb-2 text-lg text-primary">🧬 استنساخ صوت جديد</h2>
        <p className="text-xs text-muted-foreground">سجّل 15–30 ثانية بصوت واضح أو ارفع ملف (MP3/WAV/OGG). استخدم صوتك أو صوت شخص وافق على ذلك.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {rec ? <Button variant="destructive" onClick={() => mr.current?.stop()}>⏹️ إيقاف التسجيل</Button> : <Button variant="secondary" onClick={startRec}>🎙️ سجّل من المايك</Button>}
          <label className="cursor-pointer rounded-md border px-3 py-2 text-sm">📁 رفع ملف
            <input type="file" accept="audio/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { if (f.size > 10e6) toast.error("الملف أكبر من 10MB"); else setFile(await toData(f)); } }} /></label>
          {file && <audio controls src={file} className="h-9" />}
        </div>
        <Input className="mt-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الصوت (مثلاً: صوت ندى)" />
        <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> خاص بي فقط</label>
        <Button className="mt-3" onClick={doClone} disabled={!!busy}>{busy === "clone" ? "…جاري الحفظ" : "استنساخ وحفظ البصمة"}</Button>
        {s.mine.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {s.mine.map((m) => (
              <span key={m.id} className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${s.chosen?.id === m.id ? "border-primary bg-secondary" : ""}`}>
                <button onClick={() => gen(m)}>▶</button><button onClick={() => choose(m)}>{m.title}</button>
                <button onClick={() => up({ mine: s.mine.filter((x) => x.id !== m.id) })} aria-label="إزالة">✕</button>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="font-display mb-3 text-lg text-primary">🎭 كتالوج الأصوات الجاهزة</h2>
        <div className="flex gap-2 overflow-x-auto pb-2">{FILTERS.map(([k, l]) => <button key={k} className={pill(filter === k)} onClick={() => setFilter(k)}>{l}</button>)}</div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {list.map(([id, t]) => (
            <li key={id} className={`flex items-center gap-2 rounded-xl border p-2 ${s.chosen?.id === id ? "border-primary bg-secondary" : "bg-background"}`}>
              <span className="flex-1 truncate text-sm">{t}</span>
              <Button size="sm" variant="secondary" onClick={() => gen({ id, title: t })} disabled={!!busy}>{busy === id ? "🔊" : "▶"}</Button>
              <Button size="sm" onClick={() => choose({ id, title: t })}>اختر</Button>
              <button onClick={() => up({ mine: s.mine.some((m) => m.id === id) ? s.mine.filter((m) => m.id !== id) : [...s.mine, { id, title: t }] })}>{s.mine.some((m) => m.id === id) ? "⭐" : "☆"}</button>
            </li>
          ))}
        </ul>
      </section>

      <section className={card}>
        <h2 className="font-display mb-2 text-lg text-primary">🗄️ خزينة المقاطع الصوتية</h2>
        {!s.clips.length ? <p className="text-sm text-muted-foreground">ما فيه مقاطع محفوظة. اضغط «ولّد واحفظ في الخزينة».</p> : (
          <>
            <Input dir="ltr" className="mb-3" value={to} onChange={(e) => setTo(e.target.value)} placeholder="رقم العميل للإرسال 9665…" />
            <ul className="space-y-2">
              {s.clips.map((c) => (
                <li key={c.id} className="rounded-xl border p-2 text-sm">
                  <p>{c.text} <span className="text-xs text-muted-foreground">({c.sec} ث)</span></p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <audio controls src={c.audio} className="h-8 max-w-full" />
                    <Button size="sm" onClick={() => sendClip(c)} disabled={!!busy}>{busy === c.id ? "…" : "🎙️ أرسل للواتساب"}</Button>
                    <Button size="sm" variant="ghost" onClick={() => up({ clips: s.clips.filter((x) => x.id !== c.id) })}>🗑️</Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
