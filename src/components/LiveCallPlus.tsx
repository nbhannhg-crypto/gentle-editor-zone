import { useEffect, useRef, useState } from "react";
import { VoiceModelPicker } from "@/components/VoiceModelPicker";
import { VoiceSmartVault } from "@/components/VoiceSmartVault";
import { kingdomMem, loadKingdomMem } from "@/lib/voice-vault-cloud";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSpeaker, EMOTIONS } from "@/components/VoiceStudio";

/* إضافات لوحة المكالمة الحية — كلها إضافة، ما تلمس الموجود */

type Clip = { id: string; cat: string; text: string; audio?: string | undefined; speed?: number; emotion?: string; triggers?: string; title?: string; banned?: string; vip?: string | undefined };

/* مطابقة المقاطع: كلمات التشغيل + الربط بمكتبة الردود (إضافة فقط) */
export const CLIP_OPTS_KEY = "live_clip_opts";
export type ClipOpts = { link: boolean; triggers: boolean };
export function loadClipOpts(): ClipOpts {
  try { return { link: true, triggers: true, ...JSON.parse(localStorage.getItem(CLIP_OPTS_KEY) ?? "{}") }; } catch { return { link: true, triggers: true }; }
}
const norm = (s: string) => s.replace(/[\u064B-\u0652\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
const voiceOff = (): string[] => { try { const v = JSON.parse(localStorage.getItem("live_cockpit") ?? "{}").voff; return Array.isArray(v) ? v : []; } catch { return []; } };
/* المجلدات الصوتية المطفأة من شريط المكالمة تُستبعد من المطابقة */
const savedClips = (): Clip[] => {
  const off = voiceOff();
  let local: Clip[] = [];
  try { const v = JSON.parse(localStorage.getItem("live_clips") ?? "[]"); if (Array.isArray(v)) local = v; } catch { /* */ }
  // مقاطع المملكة من الذاكرة (السحابة) — المحلي له الأولوية لو موجود
  const ids = new Set(local.map((c) => c.id));
  const kg = (kingdomMem() as Clip[]).filter((c) => !ids.has(c.id));
  return [...local, ...kg].filter((c) => !off.includes(c.cat));
};
if (typeof window !== "undefined") void loadKingdomMem();
/* تقريب صوتي: يوحّد الحروف المتشابهة نطقاً (ذ/ز/ظ، ث/س/ص، ض/د، ق/ج/ك، ه/ح، ء) */
const phon = (s: string) => norm(s).replace(/[ذظ]/g, "ز").replace(/[ثص]/g, "س").replace(/ض/g, "د").replace(/[قگ]/g, "ج").replace(/ح/g, "ه").replace(/[ءئؤ]/g, "ا").replace(/(.)\1+/g, "$1");
const lev = (a: string, b: string) => {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { let p = d[0]!; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]!; d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; } }
  return d[b.length]!;
};
/** هل عبارة التشغيل موجودة في الكلام بمرونة (خطأ همزة/حرف بسيط) */
function fuzzyHas(text: string, trig: string) {
  const q = ` ${phon(text)} `, t = phon(trig);
  if (!t) return false;
  if (q.includes(` ${t} `)) return true;
  const qw = q.trim().split(" "), tw = t.split(" ");
  for (let i = 0; i + tw.length <= qw.length; i++) {
    if (tw.every((w, k) => { const x = qw[i + k]!; return x === w || (w.length >= 4 && lev(x, w) <= (w.length >= 7 ? 2 : 1)) || x === "ال" + w || "ال" + x === w; })) return true;
  }
  return false;
}
/** كل عبارات التشغيل المفعلة — تُرسل لمحرك التفريغ كمفردات مرجّحة */
export function triggerVocab(max = 120): string[] {
  const out = new Set<string>();
  try { for (const c of savedClips()) for (const t of (c.triggers ?? "").split(/[,،\n\/|]+/)) { const v = t.trim(); if (v) out.add(v); if (out.size >= max) break; } } catch { /* */ }
  return [...out].slice(0, max);
}
/** كلام الزبون يطابق كلمة تشغيل مقطع مسجل؟ يرجع الصوت الجاهز */
export function findTriggerClip(customer: string): { text: string; audio: string } | null {
  if (!loadClipOpts().triggers) return null;
  const q = ` ${norm(customer)} `;
  const clips = savedClips();
  for (const c of clips) {
    if (!c.audio || !c.triggers) continue;
    const bans = (c.banned ?? "").split(/[,،\n\/|]+/).map(norm).filter(Boolean);
    if (bans.some((b) => q.includes(` ${b} `) || norm(customer).includes(b))) continue;
    const ts = c.triggers.split(/[,،\n\/|]+/).map(norm).filter(Boolean);
    if (ts.some((t) => q.includes(` ${t} `) || norm(customer) === t)) return { text: c.text, audio: c.audio };
  }
  // مطابقة مرنة: أخطاء المايك البسيطة (همزة/حرف) — بعد فشل المطابقة الحرفية
  for (const c of clips) {
    if (!c.audio || !c.triggers) continue;
    const bans = (c.banned ?? "").split(/[,،\n\/|]+/).map(norm).filter(Boolean);
    if (bans.some((b) => fuzzyHas(customer, b))) continue;
    const ts = c.triggers.split(/[,،\n\/|]+/).map(norm).filter(Boolean);
    if (ts.some((t) => fuzzyHas(customer, t))) return { text: c.text, audio: c.audio };
  }
  return null;
}
/** نص الرد له تسجيل جاهز في البنك؟ */
export function findLinkedClip(reply: string): string | null {
  if (!loadClipOpts().link) return null;
  const r = norm(reply);
  if (!r) return null;
  return savedClips().find((c) => c.audio && norm(c.text) === r)?.audio ?? null;
}
type Personal = { id: string; name: string; audio: string; vip?: string };
export type Tuning = { voice: string; speed: number; pitch: number; emotion: string };

const CATS = [["welcome", "👋 الترحيب"], ["price", "💰 الأسعار والاعتراضات"], ["ship", "🚚 الشحن والضمان"], ["close", "🤝 إغلاق الصفقات"]] as const;
const DEFAULT_CLIPS: Clip[] = [
  { id: "w1", cat: "welcome", text: "هلا والله ومرحبا فيك، كيف أقدر أخدمك اليوم؟" },
  { id: "p1", cat: "price", text: "السعر هذا يشمل الجودة والضمان، ونقدر نعطيك عرض خاص اليوم." },
  { id: "s1", cat: "ship", text: "التوصيل خلال يومين إلى ثلاثة أيام، ومعه ضمان كامل." },
  { id: "c1", cat: "close", text: "أثبت لك الطلب الحين؟ أرسل لك رابط الدفع على الواتساب." },
];
const VOICES = [["sara", "سارة — سعودية هادئة"], ["reem", "ريم — بيع نشطة"], ["amal", "أمل — رسمية وخدمة عملاء"], ["gulf", "خليجية/يمنية مخصصة"]] as const;
export const TUNING_KEY = "live_tuning";
export function loadTuning(): Tuning {
  try { return { voice: "sara", speed: 1, pitch: 1, emotion: "", ...JSON.parse(localStorage.getItem(TUNING_KEY) ?? "{}") }; }
  catch { return { voice: "sara", speed: 1, pitch: 1, emotion: "" }; }
}
const COUNTRIES: [string, string][] = [["966", "🇸🇦 السعودية"], ["967", "🇾🇪 اليمن"], ["971", "🇦🇪 الإمارات"], ["965", "🇰🇼 الكويت"], ["974", "🇶🇦 قطر"], ["968", "🇴🇲 عمان"], ["973", "🇧🇭 البحرين"], ["20", "🇪🇬 مصر"]];
const country = (n: string) => { const d = n.replace(/\D/g, ""); return COUNTRIES.find(([c]) => d.startsWith(c))?.[1] ?? (d.length >= 6 ? "🌍 دولة أخرى" : ""); };
const uid = () => Math.random().toString(36).slice(2, 9);
const load = <T,>(k: string, d: T): T => { try { const v = JSON.parse(localStorage.getItem(k) ?? "null"); return v ?? d; } catch { return d; } };

export function LiveCallPlus(p: {
  waTo: string; setWaTo: (v: string) => void; live: boolean; speaking: boolean; customer: string; answer: string;
  log: { who: "c" | "a"; t: string }[];
  say: (text: string) => void;
  playAudio: (src: string) => void;
  bargeIn: () => void;
  send: (args: { text: string; voice: boolean; audio?: string }) => Promise<boolean>;
  setEmotion: (e: string) => void;
  customers: { name: string; phone: string }[];
}) {
  const tts = useSpeaker();
  const [clips, setClips] = useState<Clip[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [vaultTab, setVaultTab] = useState<"official" | "personal">("official");
  const [cat, setCat] = useState<string>("welcome");
  const [newText, setNewText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [tuning, setTuning] = useState<Tuning>({ voice: "sara", speed: 1, pitch: 1, emotion: "" });
  const [links, setLinks] = useState({ image: "", pay: "", location: "" });
  const [search, setSearch] = useState("");
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [busyId, setBusyId] = useState("");
  const [reports, setReports] = useState<{ at: string; phone: string; text: string }[]>([]);
  const [opts, setOpts] = useState<ClipOpts>({ link: true, triggers: true });
  useEffect(() => { setOpts(loadClipOpts()); }, []);
  const saveOpts = (o: ClipOpts) => { setOpts(o); localStorage.setItem(CLIP_OPTS_KEY, JSON.stringify(o)); };

  useEffect(() => {
    const base = load<Clip[]>("live_clips", DEFAULT_CLIPS);
    const pers = load<Personal[]>("live_personal", []);
    setPersonal(pers);
    // نقل مقاطع «مكتبتي الخاصة» القديمة لمجلد خاص داخل البنك الذكي (مرة وحدة، بدون حذف الأصل)
    const missing = pers.filter((x) => !base.some((c) => c.id === `pv_${x.id}`))
      .map((x) => ({ id: `pv_${x.id}`, cat: "personal", text: x.name, title: x.name, audio: x.audio, vip: x.vip, speed: 1 }));
    if (missing.length) { const merged = [...base, ...missing]; setClips(merged); try { localStorage.setItem("live_clips", JSON.stringify(merged)); } catch { /* */ } }
    else setClips(base);
    setTuning(loadTuning());
    setLinks(load("live_links", { image: "", pay: "", location: "" }));
    setReports(load("live_reports", []));
  }, []);
  const saveClips = (c: Clip[]) => { setClips(c); localStorage.setItem("live_clips", JSON.stringify(c)); };
  const savePersonal = (c: Personal[]) => {
    setPersonal(c);
    try { localStorage.setItem("live_personal", JSON.stringify(c)); } catch { toast.error("المساحة امتلأت — احذف مقاطع قديمة"); }
  };

  const clipAudio = async (c: Clip) => {
    if (c.audio) return c.audio;
    setBusyId(c.id);
    try {
      const a = await tts(c.text, { emotion: c.emotion ?? tuning.emotion });
      const next = clips.map((x) => (x.id === c.id ? { ...x, audio: a } : x));
      try { saveClips(next); } catch { setClips(next); }
      return a;
    } finally { setBusyId(""); }
  };
  const preview = async (c: Clip) => { try { const a = new Audio(await clipAudio(c)); a.playbackRate = c.speed ?? tuning.speed; await a.play(); } catch (e) { toast.error((e as Error).message); } };
  const sendClip = async (c: Clip) => {
    if (p.live) { p.say(c.text); return; }
    try { const a = await clipAudio(c); await p.send({ text: c.text, voice: true, audio: a }); } catch (e) { toast.error((e as Error).message); }
  };

  const launch = async (c: Clip) => { try { p.playAudio(await clipAudio(c)); } catch (e) { toast.error((e as Error).message); } };
  const pttClip = async (c: Clip) => { try { const a = await clipAudio(c); await p.send({ text: c.text, voice: true, audio: a }); } catch (e) { toast.error((e as Error).message); } };
  const [gen, setGen] = useState({ text: "", emotion: "", speed: 1 });
  const [genBusy, setGenBusy] = useState(false);
  const generateSave = async () => {
    const t = gen.text.trim();
    if (!t) { toast.error("اكتب العبارة"); return; }
    setGenBusy(true);
    try {
      const a = await tts(t, { emotion: gen.emotion || tuning.emotion });
      const c: Clip = { id: uid(), cat, text: t, audio: a, speed: gen.speed, emotion: gen.emotion || tuning.emotion };
      try { saveClips([c, ...clips]); } catch { setClips([c, ...clips]); toast("المساحة ممتلئة — الصوت محفوظ لهذي الجلسة"); }
      const el = new Audio(a); el.playbackRate = gen.speed; void el.play();
      setGen({ ...gen, text: "" }); toast.success("🪄 انولّد وانحفظ في بنكك");
    } catch (e) { toast.error((e as Error).message); } finally { setGenBusy(false); }
  };

  const startRec = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(s); const chunks: Blob[] = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = () => {
        s.getTracks().forEach((t) => t.stop());
        const fr = new FileReader();
        fr.onload = () => { savePersonal([{ id: uid(), name: `تسجيل ${new Date().toLocaleTimeString("ar")}`, audio: String(fr.result) }, ...personal]); toast.success("🎙️ انحفظ التسجيل"); };
        fr.readAsDataURL(new Blob(chunks, { type: mr.mimeType || "audio/webm" }));
        setRec(null);
      };
      mr.start(); setRec(mr);
    } catch { toast.error("ما قدرنا نفتح المايك — اسمح للمتصفح"); }
  };
  const upload = (f?: File) => {
    if (!f) return;
    if (f.size > 5_000_000) { toast.error("الملف أكبر من 5 ميجا"); return; }
    const fr = new FileReader();
    fr.onload = () => { savePersonal([{ id: uid(), name: f.name, audio: String(fr.result) }, ...personal]); toast.success("📁 انرفع المقطع"); };
    fr.readAsDataURL(f);
  };

  const saveTuning = () => { localStorage.setItem(TUNING_KEY, JSON.stringify(tuning)); p.setEmotion(tuning.emotion); toast.success("💾 انحفظ الوزن الافتراضي للمكالمات"); };
  const saveLinks = (l: typeof links) => { setLinks(l); localStorage.setItem("live_links", JSON.stringify(l)); };
  const dispatch = async (kind: keyof typeof links, label: string) => {
    const v = links[kind].trim();
    if (!v) { toast.error(`حط ${label} أول في الخانة`); return; }
    await p.send({ text: kind === "image" ? `📸 صورة المنتج: ${v}` : kind === "pay" ? `💳 رابط الدفع: ${v}` : `📍 موقع المتجر: ${v}`, voice: false });
  };
  const quickVoice = async () => {
    const c = clips.find((x) => x.cat === "welcome") ?? clips[0];
    if (!c) { toast.error("ما فيه مقطع ترحيب"); return; }
    try { const a = await clipAudio(c); await p.send({ text: c.text, voice: true, audio: a }); } catch (e) { toast.error((e as Error).message); }
  };

  // التقرير النهائي عند إنهاء المكالمة
  const wasLive = useRef(false);
  useEffect(() => {
    if (p.live) { wasLive.current = true; return; }
    if (!wasLive.current || p.log.length === 0) return;
    wasLive.current = false;
    const said = p.log.filter((m) => m.who === "c").map((m) => m.t).join(" | ");
    const nums = said.match(/\d{2,6}/g)?.join("، ") ?? "—";
    const text = `📋 تقرير المكالمة\nالرقم: ${p.waTo || "—"}\nعدد الجمل: ${p.log.length}\nطلب الزبون: ${said.slice(0, 300) || "—"}\nأرقام/أسعار ذُكرت: ${nums}\nموعد المتابعة: بعد 24 ساعة`;
    const next = [{ at: new Date().toLocaleString("ar"), phone: p.waTo, text }, ...reports].slice(0, 30);
    setReports(next); localStorage.setItem("live_reports", JSON.stringify(next));
    toast.success("📋 انحفظ تقرير المكالمة");
  }, [p.live]); // eslint-disable-line react-hooks/exhaustive-deps

  const found = search.trim() ? p.customers.filter((c) => c.name.includes(search) || c.phone.includes(search)).slice(0, 5) : [];
  const box = "rounded-2xl border bg-card p-5 shadow-soft";

  return (
    <div className="space-y-6">
      {/* 1. وحدة الاتصال المباشر */}
      <section className={box}>
        <h3 className="font-display mb-3 text-lg">📞 وحدة الاتصال المباشر بالواتساب</h3>
        <div className="flex gap-2">
          <Input value={p.waTo} onChange={(e) => p.setWaTo(e.target.value)} placeholder="رقم الزبون 9665xxxxxxxx" dir="ltr" />
          {country(p.waTo) && <span className="self-center whitespace-nowrap text-xs text-muted-foreground">{country(p.waTo)}</span>}
        </div>
        <Input className="mt-2" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔎 ابحث في سجل الزبائن بالاسم أو الرقم" />
        {found.map((c) => (
          <button key={c.phone} onClick={() => { p.setWaTo(c.phone); setSearch(""); }} className="mt-1 block w-full rounded-lg bg-secondary px-3 py-1 text-right text-sm">{c.name} — <span dir="ltr">{c.phone}</span></button>
        ))}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={quickVoice}>⚡ تحويل إلى فويس فوري</Button>
          <Button variant="destructive" disabled={!p.speaking} onClick={p.bargeIn}>🛑 قاطع الموظفة</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">ملاحظة: واتساب ما يسمح بمكالمات صوتية آلية عبر السيرفر — المكالمة الحية تشتغل من المايك هنا، والإرسال للزبون يكون فويس ورسائل.</p>
      </section>

      {/* 2. القسم القديم انشال — كل ميزاته صارت داخل لوحة بنك الأصوات الذكية تحت */}

      {/* 2.5 لوحة بنك الأصوات والمجلدات الذكية (إضافة) */}
      <VoiceSmartVault clips={clips} saveClips={saveClips} opts={opts} saveOpts={saveOpts}
        tts={(t, o) => tts(t, { emotion: o?.emotion || tuning.emotion })} playAudio={p.playAudio} send={p.send} live={p.live} />

      {/* 3. موازين الصوت */}
      <section className={box}>
        <h3 className="font-display mb-3 text-lg">🎚️ موازين وتعديل الصوت اللحظي</h3>
        <select value={tuning.voice} onChange={(e) => setTuning({ ...tuning, voice: e.target.value })} className="w-full rounded-md border bg-background px-2 py-2 text-sm">
          {VOICES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <VoiceModelPicker className="mt-2" />
        <label className="mt-3 block text-sm">السرعة: {tuning.speed.toFixed(2)}x
          <input type="range" min={0.7} max={1.3} step={0.05} value={tuning.speed} className="w-full" onChange={(e) => setTuning({ ...tuning, speed: +e.target.value })} />
        </label>
        <label className="mt-2 block text-sm">النغمة والعمق: {tuning.pitch.toFixed(2)}
          <input type="range" min={0.85} max={1.15} step={0.01} value={tuning.pitch} className="w-full" onChange={(e) => setTuning({ ...tuning, pitch: +e.target.value })} />
        </label>
        <select value={tuning.emotion} onChange={(e) => setTuning({ ...tuning, emotion: e.target.value })} className="mt-2 w-full rounded-md border bg-background px-2 py-2 text-sm" aria-label="المشاعر">
          {EMOTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <Button className="mt-3" onClick={saveTuning}>💾 حفظ الوزن الافتراضي للمكالمات</Button>
      </section>

      {/* 4. قاذف الوسائط */}
      <section className={box}>
        <h3 className="font-display mb-3 text-lg">🚀 قاذف الوسائط أثناء المكالمة</h3>
        <div className="space-y-2">
          <Input value={links.image} onChange={(e) => saveLinks({ ...links, image: e.target.value })} placeholder="رابط صورة المنتج" dir="ltr" />
          <Input value={links.pay} onChange={(e) => saveLinks({ ...links, pay: e.target.value })} placeholder="رابط الدفع" dir="ltr" />
          <Input value={links.location} onChange={(e) => saveLinks({ ...links, location: e.target.value })} placeholder="رابط لوكيشن المتجر" dir="ltr" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => dispatch("image", "رابط الصورة")}>📸 صورة المنتج</Button>
          <Button variant="secondary" onClick={() => dispatch("pay", "رابط الدفع")}>💳 رابط الدفع</Button>
          <Button variant="secondary" onClick={() => dispatch("location", "اللوكيشن")}>📍 اللوكيشن</Button>
        </div>
      </section>

      {/* 5. تقارير المكالمات */}
      {reports.length > 0 && (
        <section className={box}>
          <h3 className="font-display mb-3 text-lg">📋 تقارير المكالمات</h3>
          <div className="max-h-80 space-y-2 overflow-auto">
            {reports.map((r, i) => (
              <div key={i} className="rounded-xl bg-secondary p-3 text-xs">
                <p className="text-muted-foreground">{r.at}</p>
                <pre className="mt-1 whitespace-pre-wrap font-sans">{r.text}</pre>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
