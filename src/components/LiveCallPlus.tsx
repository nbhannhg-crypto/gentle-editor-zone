import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSpeaker, EMOTIONS } from "@/components/VoiceStudio";

/* إضافات لوحة المكالمة الحية — كلها إضافة، ما تلمس الموجود */

type Clip = { id: string; cat: string; text: string; audio?: string | undefined; speed?: number; emotion?: string };
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

  useEffect(() => {
    setClips(load("live_clips", DEFAULT_CLIPS));
    setPersonal(load("live_personal", []));
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

      {/* 2. بنك الأصوات المزدوج */}
      <section className={box}>
        <div className="mb-3 flex gap-2">
          <Button size="sm" variant={vaultTab === "official" ? "default" : "secondary"} onClick={() => setVaultTab("official")}>📚 المقاطع الرسمية</Button>
          <Button size="sm" variant={vaultTab === "personal" ? "default" : "secondary"} onClick={() => setVaultTab("personal")}>🔐 مكتبتي الخاصة</Button>
        </div>
        {vaultTab === "official" ? (
          <>
            <div className="mb-3 flex flex-wrap gap-1">
              {CATS.map(([k, l]) => <Button key={k} size="sm" variant={cat === k ? "default" : "outline"} onClick={() => setCat(k)}>{l}</Button>)}
            </div>
            <div className="mb-3 space-y-2 rounded-xl bg-secondary p-3">
              <p className="text-sm font-medium">🪄 توليد وحفظ مسبق ({CATS.find(([k]) => k === cat)?.[1]})</p>
              <Input value={gen.text} onChange={(e) => setGen({ ...gen, text: e.target.value })} placeholder="اكتب العبارة…" />
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <select value={gen.emotion} onChange={(e) => setGen({ ...gen, emotion: e.target.value })} className="rounded-md border bg-background px-2 py-1" aria-label="النبرة">
                  {EMOTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <label className="flex flex-1 items-center gap-1">السرعة {gen.speed.toFixed(2)}x
                  <input type="range" min={0.7} max={1.3} step={0.05} value={gen.speed} className="flex-1" onChange={(e) => setGen({ ...gen, speed: +e.target.value })} />
                </label>
              </div>
              <Button disabled={genBusy} onClick={generateSave}>{genBusy ? "…يتولد" : "🪄 ولّد واحفظ في بنكي"}</Button>
            </div>
            <div className="space-y-2">
              {clips.filter((c) => c.cat === cat).map((c) => (
                <div key={c.id} className="rounded-xl border bg-background p-3">
                  <p className="text-sm">{c.text}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Button size="sm" variant="secondary" disabled={busyId === c.id} onClick={() => preview(c)}>{busyId === c.id ? "…" : "▶️ استماع فوري"}</Button>
                    <Button size="sm" disabled={!p.live || busyId === c.id} onClick={() => launch(c)}>🗣️ أطلق في المكالمة</Button>
                    <Button size="sm" disabled={busyId === c.id} onClick={() => pttClip(c)}>🚀 أرسل كـ PTT</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(editing === c.id ? null : c.id)}>✏️ تعديل</Button>
                    <Button size="sm" variant="outline" onClick={() => saveClips(clips.filter((x) => x.id !== c.id))}>🗑️ حذف</Button>
                    {c.audio && <span className="self-center text-[10px] text-muted-foreground">💾 محفوظ</span>}
                  </div>
                  {editing === c.id && (
                    <div className="mt-2 space-y-2 rounded-lg bg-secondary p-2 text-xs">
                      <Input defaultValue={c.text} onBlur={(e) => saveClips(clips.map((x) => (x.id === c.id ? { ...x, text: e.target.value, audio: undefined } : x)))} />
                      <label className="block">السرعة {(c.speed ?? 1).toFixed(2)}x
                        <input type="range" min={0.7} max={1.3} step={0.05} value={c.speed ?? 1} className="w-full" onChange={(e) => saveClips(clips.map((x) => (x.id === c.id ? { ...x, speed: +e.target.value } : x)))} />
                      </label>
                      <select value={c.emotion ?? ""} onChange={(e) => saveClips(clips.map((x) => (x.id === c.id ? { ...x, emotion: e.target.value, audio: undefined } : x)))} className="w-full rounded-md border bg-background px-2 py-1">
                        {EMOTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Input value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="نص المقطع الرسمي الجديد…" />
              <Button variant="outline" onClick={() => { if (newText.trim()) { saveClips([...clips, { id: uid(), cat, text: newText.trim(), emotion: tuning.emotion }]); setNewText(""); } }}>➕ أضف</Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {rec ? <Button variant="destructive" onClick={() => rec.stop()}>⏹️ أوقف واحفظ</Button> : <Button onClick={startRec}>🎙️ سجّل من المايك</Button>}
              <label className="cursor-pointer rounded-md border px-3 py-2 text-sm">📁 ارفع ملف صوتي
                <input type="file" accept="audio/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
              </label>
            </div>
            <div className="mt-3 space-y-2">
              {personal.map((c) => (
                <div key={c.id} className="rounded-xl border bg-background p-3">
                  <Input defaultValue={c.name} className="h-8 text-sm" onBlur={(e) => savePersonal(personal.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))} />
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Button size="sm" variant="secondary" onClick={() => new Audio(c.audio).play()}>🎧 معاينة</Button>
                    <Button size="sm" disabled={!p.live} onClick={() => p.playAudio(c.audio)}>📢 شغّل في المكالمة</Button>
                    <Button size="sm" variant="outline" onClick={() => p.send({ text: c.name, voice: true, audio: c.audio })}>🎙️ أرسل فويس</Button>
                    <Button size="sm" variant="outline" onClick={() => savePersonal(personal.filter((x) => x.id !== c.id))}>🗑️</Button>
                  </div>
                  <Input defaultValue={c.vip ?? ""} dir="ltr" placeholder="⭐ رد مفضل لرقم VIP (اختياري)" className="mt-2 h-8 text-xs"
                    onBlur={(e) => savePersonal(personal.map((x) => (x.id === c.id ? { ...x, vip: e.target.value.replace(/\D/g, "") } : x)))} />
                </div>
              ))}
              {!personal.length && <p className="text-sm text-muted-foreground">ما فيه مقاطع خاصة للحين.</p>}
            </div>
            {p.waTo && personal.find((x) => x.vip && p.waTo.replace(/\D/g, "").endsWith(x.vip)) && (
              <p className="mt-2 text-xs text-primary">⭐ هذا الرقم VIP وله مقطع مفضل جاهز.</p>
            )}
          </>
        )}
      </section>

      {/* 3. موازين الصوت */}
      <section className={box}>
        <h3 className="font-display mb-3 text-lg">🎚️ موازين وتعديل الصوت اللحظي</h3>
        <select value={tuning.voice} onChange={(e) => setTuning({ ...tuning, voice: e.target.value })} className="w-full rounded-md border bg-background px-2 py-2 text-sm">
          {VOICES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
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
