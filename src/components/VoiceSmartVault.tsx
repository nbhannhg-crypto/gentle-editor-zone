import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EMOTIONS } from "@/components/VoiceStudio";
import { VoiceModelPicker } from "@/components/VoiceModelPicker";

/* لوحة بنك الأصوات والمجلدات الذكية — إضافة مستقلة، تستخدم نفس مقاطع البنك الحالية */
export type VaultClip = { id: string; cat: string; text: string; audio?: string | undefined; speed?: number; emotion?: string; triggers?: string };
type Folder = [string, string];
const BASE: Folder[] = [["welcome", "👋 الترحيب والاستقبال"], ["price", "💰 الأسعار والاعتراضات"], ["ship", "🚚 الشحن والضمان"], ["fun", "💖 غنج وسوالف ودلع"], ["close", "🤝 إغلاق الصفقات"]];
const FOLDERS_KEY = "live_vault_folders";
const norm = (s: string) => s.replace(/[\u064B-\u0652\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
const uid = () => Math.random().toString(36).slice(2, 9);

export function VoiceSmartVault(p: {
  clips: VaultClip[];
  saveClips: (c: VaultClip[]) => void;
  opts: { link: boolean; triggers: boolean };
  saveOpts: (o: { link: boolean; triggers: boolean }) => void;
  tts: (text: string, o?: { emotion?: string }) => Promise<string>;
  playAudio: (src: string) => void;
  send: (a: { text: string; voice: boolean; audio?: string }) => Promise<boolean>;
  live: boolean;
}) {
  const [custom, setCustom] = useState<Folder[]>([]);
  const [cat, setCat] = useState("welcome");
  const [text, setText] = useState("");
  const [emotion, setEmotion] = useState("");
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState("");
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [dur, setDur] = useState<Record<string, number>>({});

  useEffect(() => { try { const v = JSON.parse(localStorage.getItem(FOLDERS_KEY) ?? "[]"); if (Array.isArray(v)) setCustom(v); } catch { /* */ } }, []);
  const folders = [...BASE, ...custom];
  const save = (c: VaultClip[]) => { try { p.saveClips(c); } catch { toast.error("المساحة ممتلئة — احذف مقاطع قديمة"); } };

  const addFolder = () => {
    const name = window.prompt("اسم المجلد الصوتي الجديد؟")?.trim();
    if (!name) return;
    const next: Folder[] = [...custom, [`f_${uid()}`, `📁 ${name}`]];
    setCustom(next); localStorage.setItem(FOLDERS_KEY, JSON.stringify(next)); setCat(next[next.length - 1]![0]);
  };

  const cached = text.trim() ? p.clips.find((c) => c.audio && norm(c.text) === norm(text)) : undefined;
  const checkOrGen = async () => {
    const t = text.trim();
    if (!t) { toast.error("اكتب العبارة"); return; }
    if (cached) {
      if (cached.cat === cat) { toast("💾 موجودة أصلاً في هذا المجلد"); return; }
      save([{ ...cached, id: uid(), cat }, ...p.clips]); setText(""); toast.success("💾 كانت محفوظة — انضافت فوراً بدون توليد"); return;
    }
    setBusy("gen");
    try {
      const a = await p.tts(t, { emotion });
      save([{ id: uid(), cat, text: t, audio: a, speed, emotion }, ...p.clips]);
      const el = new Audio(a); el.playbackRate = speed; void el.play();
      setText(""); toast.success("🪄 انولّد وانحفظ في المجلد");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(""); }
  };

  const addAudio = (audio: string, name: string) => save([{ id: uid(), cat, text: text.trim() || name, audio, speed: 1 }, ...p.clips]);
  const upload = (f?: File) => {
    if (!f) return;
    if (f.size > 5_000_000) { toast.error("الملف أكبر من 5 ميجا"); return; }
    const fr = new FileReader();
    fr.onload = () => { addAudio(String(fr.result), f.name); setText(""); toast.success("📁 انرفع المقطع للمجلد"); };
    fr.readAsDataURL(f);
  };
  const startRec = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(s); const chunks: Blob[] = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = () => {
        s.getTracks().forEach((t) => t.stop());
        const fr = new FileReader();
        fr.onload = () => { addAudio(String(fr.result), `تسجيل ${new Date().toLocaleTimeString("ar")}`); setText(""); toast.success("🎙️ انحفظ التسجيل في المجلد"); };
        fr.readAsDataURL(new Blob(chunks, { type: mr.mimeType || "audio/webm" }));
        setRec(null);
      };
      mr.start(); setRec(mr);
    } catch { toast.error("ما قدرنا نفتح المايك — اسمح للمتصفح"); }
  };

  const audioOf = async (c: VaultClip) => {
    if (c.audio) return c.audio;
    setBusy(c.id);
    try { const a = await p.tts(c.text, { emotion: c.emotion ?? "" }); save(p.clips.map((x) => (x.id === c.id ? { ...x, audio: a } : x))); return a; }
    finally { setBusy(""); }
  };
  const listen = async (c: VaultClip) => {
    try { const el = new Audio(await audioOf(c)); el.playbackRate = c.speed ?? 1; el.onloadedmetadata = () => setDur((d) => ({ ...d, [c.id]: el.duration })); await el.play(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const fire = async (c: VaultClip) => { try { p.playAudio(await audioOf(c)); } catch (e) { toast.error((e as Error).message); } };
  const ptt = async (c: VaultClip) => { try { await p.send({ text: c.text, voice: true, audio: await audioOf(c) }); } catch (e) { toast.error((e as Error).message); } };

  const ready = p.clips.filter((c) => c.audio).length;
  const linked = p.clips.filter((c) => c.audio && c.triggers?.trim()).length;
  const list = p.clips.filter((c) => c.cat === cat);

  return (
    <section className="rounded-2xl border-2 border-primary/30 bg-card p-5 shadow-soft">
      <h3 className="font-display text-lg">🎛️ لوحة تحكم بنك الأصوات والمجلدات الذكية</h3>
      <p className="text-xs text-muted-foreground">Voice Smart Vault</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-secondary px-3 py-1">💾 جاهزة في الكاش: {ready}</span>
        <span className="rounded-full bg-secondary px-3 py-1">🎯 مربوطة بكلمات التشغيل: {linked}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant={p.opts.link ? "default" : "outline"} onClick={() => p.saveOpts({ ...p.opts, link: !p.opts.link })}>🔗 الربط بمكتبة الردود: {p.opts.link ? "مفعل" : "موقف"}</Button>
        <Button size="sm" variant={p.opts.triggers ? "default" : "outline"} onClick={() => p.saveOpts({ ...p.opts, triggers: !p.opts.triggers })}>🎯 كلمات الزبون: {p.opts.triggers ? "مفعل" : "موقف"}</Button>
      </div>

      <p className="mt-4 mb-2 text-sm font-medium">📁 المجلدات الصوتية</p>
      <div className="flex flex-wrap gap-1">
        {folders.map(([k, l]) => (
          <Button key={k} size="sm" variant={cat === k ? "default" : "outline"} onClick={() => setCat(k)}>{l} ({p.clips.filter((c) => c.cat === k).length})</Button>
        ))}
        <Button size="sm" variant="secondary" onClick={addFolder}>➕ مجلد جديد</Button>
      </div>

      <div className="mt-4 space-y-2 rounded-xl bg-secondary p-3">
        <p className="text-sm font-medium">🪄 الفحص والكاش المسبق</p>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب العبارة للتحقق أو التوليد…" />
        {text.trim() && <p className="text-xs">{cached ? "💾 متوفرة مسبقاً — تنضاف فوراً بدون توليد" : "✨ عبارة جديدة — تتولد بنقرة"}</p>}
        <VoiceModelPicker />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select value={emotion} onChange={(e) => setEmotion(e.target.value)} className="rounded-md border bg-background px-2 py-1" aria-label="النبرة">
            {EMOTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <label className="flex flex-1 items-center gap-1">السرعة {speed.toFixed(2)}x
            <input type="range" min={0.7} max={1.3} step={0.05} value={speed} className="flex-1" onChange={(e) => setSpeed(+e.target.value)} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy === "gen"} onClick={checkOrGen}>{busy === "gen" ? "…يتولد" : "🔍 فحص / توليد"}</Button>
          {rec ? <Button variant="destructive" onClick={() => rec.stop()}>⏹️ أوقف واحفظ</Button> : <Button variant="outline" onClick={startRec}>🎙️ سجّل من المايك</Button>}
          <label className="cursor-pointer rounded-md border bg-background px-3 py-2 text-sm">📁 ارفع MP3/WAV
            <input type="file" accept="audio/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        </div>
      </div>

      <p className="mt-4 mb-2 text-sm font-medium">📋 مقاطع المجلد المختار</p>
      <div className="space-y-2">
        {list.map((c) => (
          <div key={c.id} className="rounded-xl border bg-background p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm">"{c.text}"</p>
              <span className="whitespace-nowrap text-[10px] text-muted-foreground">{c.audio ? `⚡ مخزن${dur[c.id] ? ` (${dur[c.id]!.toFixed(1)} ث)` : ""}` : "⏳ غير مولّد"}</span>
            </div>
            <Input defaultValue={c.triggers ?? ""} placeholder="🎯 كلمات الزبون: مرحبا, هلا, مساء الخير" className="mt-2 h-8 text-xs"
              onBlur={(e) => save(p.clips.map((x) => (x.id === c.id ? { ...x, triggers: e.target.value.trim() } : x)))} />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <select value={c.emotion ?? ""} onChange={(e) => save(p.clips.map((x) => (x.id === c.id ? { ...x, emotion: e.target.value, audio: undefined } : x)))} className="rounded-md border bg-background px-2 py-1" aria-label="نبرة المقطع">
                {EMOTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <label className="flex flex-1 items-center gap-1">🎚️ {(c.speed ?? 1).toFixed(2)}x
                <input type="range" min={0.7} max={1.3} step={0.05} value={c.speed ?? 1} className="flex-1" onChange={(e) => save(p.clips.map((x) => (x.id === c.id ? { ...x, speed: +e.target.value } : x)))} />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              <Button size="sm" variant="secondary" disabled={busy === c.id} onClick={() => listen(c)}>{busy === c.id ? "…" : "▶️ استماع فوري"}</Button>
              <Button size="sm" disabled={!p.live || busy === c.id} onClick={() => fire(c)}>⚡ أطلق في المكالمة الآن</Button>
              <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => ptt(c)}>🚀 PTT واتساب</Button>
              <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => { save(p.clips.map((x) => (x.id === c.id ? { ...x, audio: undefined } : x))); toast("🔄 بيتولد من جديد عند التشغيل"); }}>🔄 إعادة وزن</Button>
            </div>
          </div>
        ))}
        {!list.length && <p className="text-sm text-muted-foreground">المجلد فاضي — اكتب عبارة فوق أو سجّل/ارفع صوت.</p>}
      </div>
    </section>
  );
}
