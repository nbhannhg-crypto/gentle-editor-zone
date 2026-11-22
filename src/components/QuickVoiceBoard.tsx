import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { listClips } from "@/lib/call-vault";
import { loadPref, savePref } from "@/lib/ui-prefs";

// 🎛️ لوحة الأصوات الفورية: كل جملة تتولد مرة وحدة وتنحفظ في الجهاز، والضغطة بعدها تنطق على طول
type Voice = { id: string; model: string; speed: number; gain: number; emotion: string; volume?: number; device?: string };
type SpeakFn = (a: { data: any }) => Promise<{ audio: unknown }>;
type Item = { t: string; cat: string; custom?: boolean };

const PACKS: Record<string, string[]> = {
  "👋 القستات والترحيب": ["يا هلا بالقست، نورت المساحة", "حياك الله يا خوي، المايك معك تفضل", "حياك الله يا أختي، تفضلي", "ارحبوا يا هلا، نورتوا المجلس", "يا هلا فيك، عرفنا بنفسك باختصار", "منور القست، الله يحييك"],
  "📲 التوجيه والواتساب": ["تواصل معنا على الواتساب وبإذن الله نرسل لك المناسب", "الرابط موجود في البايو، سجل بياناتك هناك", "استخير الله، وتواصل معنا بالخاص", "بياناتك عندنا بسرية تامة، لا تشيل هم", "أرسل رقم طلبك على الواتساب ونتابع معك"],
  "💍 المواصفات": ["اذكر مواصفاتك كاملة لو سمحت", "كم عمرك وطولك ووزنك؟", "وش حالتك الاجتماعية، أعزب ولا مطلق؟", "وش شروطك والمواصفات اللي تبيها؟", "وش وظيفتك ومن أي مدينة؟", "مواصفاتك طيبة، وإن شاء الله نلقى لك المناسب"],
  "🤲 الدعاء والبركة": ["الله يكتب لك الخير ويسخر لك النصيب الطيب", "ربي يسعد قلبك ويجمعك بالحلال", "إذا فيها خير الله يجمعكم، وإن ما فيها خير الله يعوضكم بأحسن", "ما شاء الله تبارك الله", "جزاك الله خير، تشرفنا فيك"],
  "🛡️ إدارة المساحة": ["احترام البث يا جماعة، المساحة للزواج الشرعي", "واحد واحد الله يرضى عليكم، لا تقاطعون", "نعتذر منك، بنقفل المايك الحين", "اللي يبي يطلع قست يرفع يده", "أسرار الناس أمانة، لا أحد ينشر شي من المساحة"],
};
const SMART: [string, string][] = [
  ["💡 رد على طالب زواج", "رد بأسلوب خطابة رزينة على شخص طلب زواج بالمساحة: رحبي فيه، امدحي مواصفاته بلطف، وجهيه للواتساب، وقولي له يستخير. جملتين فقط وبكلام جديد."],
  ["🤲 دعاء جديد", "ادعي لشخص في المساحة بالنصيب الطيب بكلام عفوي جديد من القلب. جملة أو جملتين."],
  ["⚖️ نصيحة واقعية", "انصحي الحضور نصيحة قصيرة واقعية عن الزواج والتفاهم وعدم المبالغة بالشروط. جملتين."],
  ["🔒 تذكير بالستر", "ذكري الحضور بلطف إن المساحة للزواج الشرعي وأسرار الناس أمانة والبيانات بالخاص. جملتين بكلام جديد."],
  ["😊 كسر الصمت", "المساحة هادية، قولي كلام خفيف يحمس الحضور يطلعون قست أو يكتبون بالتعليقات. جملتين."],
  ["🙏 شكر الداعمين", "اشكري الداعمين والحضور بكلام دافئ جديد. جملة أو جملتين."],
];
const LSK = "live_soundboard_custom";
const dbP = () => new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open("quickvoice_v2", 1); r.onupgradeneeded = () => r.result.createObjectStore("a"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const dbGet = async (k: string) => { const db = await dbP(); return new Promise<Blob | undefined>((res) => { const q = db.transaction("a").objectStore("a").get(k); q.onsuccess = () => res(q.result as Blob | undefined); q.onerror = () => res(undefined); }); };
const dbPut = async (k: string, b: Blob) => { const db = await dbP(); return new Promise<void>((res) => { const tx = db.transaction("a", "readwrite"); tx.objectStore("a").put(b, k); tx.oncomplete = () => res(); tx.onerror = () => res(); }); };
const dbDel = async (k: string) => { const db = await dbP(); db.transaction("a", "readwrite").objectStore("a").delete(k); };

export function QuickVoiceBoard({ voice, speak, onSmart, onSay }: { voice: Voice; speak: SpeakFn; onSmart: (label: string, prompt: string) => void; onSay?: (text: string) => void }) {
  const [heard, setHeard] = useState(""); const [hits, setHits] = useState<string[]>([]); const [mic, setMic] = useState(false);
  const score = (h: string, t: string) => { const w = h.split(/\s+/).filter((x) => x.length > 1); return w.filter((x) => t.includes(x)).length / Math.max(1, w.length); };
  const listen = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition; if (!SR) { toast.error("المتصفح ما يدعم المايك، استخدم كروم"); return; }
    const r = new SR(); r.lang = "ar-SA"; r.interimResults = false; setMic(true);
    r.onresult = async (e: any) => { const h = String(e.results[0][0].transcript || "").trim(); setHeard(h);
      let vault: string[] = []; try { vault = (await listClips()).map((c) => c.text); } catch { /* */ }
      const pool = [...new Set([...all.map((i) => i.t), ...vault])];
      const best = pool.map((t) => [t, score(h, t)] as const).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t]) => t);
      setHits(best); if (!best.length) toast.info("ما لقيت صوت محفوظ يطابق، اضغط «انطقيها» يتولد وينحفظ"); };
    r.onerror = () => setMic(false); r.onend = () => setMic(false); r.start();
  };
  const [custom, setCustom] = useState<Item[]>([]);
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [newT, setNewT] = useState(""); const [newCat, setNewCat] = useState("⭐ أصواتي");
  const [q, setQ] = useState(""); const [rate, setRate] = useState(1); const [vol, setVol] = useState(1);
  const [playing, setPlaying] = useState(""); const [prog, setProg] = useState("");
  const a = useRef<HTMLAudioElement | null>(null); const urls = useRef<Record<string, string>>({}); const last = useRef("");
  const key = (t: string) => `${voice.id}|${voice.model}|${voice.speed}|${voice.emotion}|${t}`;
  const [ovr, setOvr] = useState<Record<string, string>>({});
  useEffect(() => { try { setOvr(JSON.parse(localStorage.getItem("live_sb_ovr") || "{}")); } catch { /* */ }
    void loadPref<Record<string, string>>("live_sb_ovr").then((v) => { if (v && typeof v === "object") { setOvr(v); localStorage.setItem("live_sb_ovr", JSON.stringify(v)); } });
    void loadPref<Item[]>(LSK).then((v) => { if (Array.isArray(v)) { setCustom(v); localStorage.setItem(LSK, JSON.stringify(v)); } }); }, []);
  const all: Item[] = [...Object.entries(PACKS).flatMap(([cat, ts]) => ts.map((t) => ({ t: ovr[t] ?? t, cat, orig: t }))), ...custom] as (Item & { orig?: string })[];

  useEffect(() => { try { setCustom(JSON.parse(localStorage.getItem(LSK) || "[]")); } catch { /* */ } const r = Number(localStorage.getItem("live_sb_rate")); if (r) setRate(r); }, []);
  useEffect(() => { let off = false; void (async () => { const m: Record<string, boolean> = {}; for (const i of all) m[i.t] = !!(await dbGet(key(i.t)).catch(() => undefined)); if (!off) setReady(m); })(); return () => { off = true; }; }, [voice.id, voice.model, voice.speed, voice.emotion, custom.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const gen = async (t: string): Promise<Blob> => {
    const r = await speak({ data: { text: t, voiceId: voice.id, custom: true, model: voice.model, speed: voice.speed, volume: voice.gain, emotion: voice.emotion, stable: true } });
    const d = String(r.audio); const bin = atob(d.slice(d.indexOf(",") + 1)); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const b = new Blob([u8], { type: "audio/mpeg" }); await dbPut(key(t), b); setReady((m) => ({ ...m, [t]: true })); return b;
  };
  const get = async (t: string) => { const k = key(t); if (urls.current[k]) return urls.current[k]!; let b = await dbGet(k).catch(() => undefined); if (!b) { setBusy((m) => ({ ...m, [t]: true })); try { b = await gen(t); } finally { setBusy((m) => ({ ...m, [t]: false })); } } const u = URL.createObjectURL(b); urls.current[k] = u; return u; };
  const play = async (t: string) => {
    if (onSay) { last.current = t; setPlaying(t); onSay(t); setTimeout(() => setPlaying((p) => (p === t ? "" : p)), 4000); return; }
    try {
      const u = await get(t); const el = a.current ?? new Audio(); a.current = el; el.pause(); el.src = u; el.playbackRate = rate; el.volume = Math.max(0.05, Math.min(1, vol * (voice.volume ?? 1)));
      if (voice.device && "setSinkId" in el) await (el as any).setSinkId(voice.device).catch(() => {});
      el.onended = () => setPlaying(""); last.current = t; setPlaying(t); await el.play();
    } catch (e) { setPlaying(""); toast.error(e instanceof Error ? e.message : "تعذر النطق"); }
  };
  const stop = () => { a.current?.pause(); setPlaying(""); };
  const prepAll = async () => { const todo = all.filter((i) => !ready[i.t]); let n = 0; for (const i of todo) { setProg(`${++n}/${todo.length}`); try { await gen(i.t); } catch { /* skip */ } } setProg(""); toast.success("كل الأصوات جاهزة للنطق الفوري"); };
  const saveCustom = (c: Item[]) => { setCustom(c); localStorage.setItem(LSK, JSON.stringify(c)); void savePref(LSK, c); };
  const add = async () => { const t = newT.trim(); if (!t) return; if (all.some((i) => i.t === t)) { toast.info("الجملة موجودة"); return; } saveCustom([...custom, { t, cat: newCat.trim() || "⭐ أصواتي", custom: true }]); setNewT(""); setBusy((m) => ({ ...m, [t]: true })); try { await gen(t); toast.success("انحفظ الصوت، اضغطه وينطق على طول"); } catch (e) { toast.error(e instanceof Error ? e.message : "تعذر التوليد"); } finally { setBusy((m) => ({ ...m, [t]: false })); } };
  const remove = (t: string) => { saveCustom(custom.filter((i) => i.t !== t)); void dbDel(key(t)); };
  const regen = async (t: string) => { delete urls.current[key(t)]; setBusy((m) => ({ ...m, [t]: true })); try { await gen(t); toast.success("انعاد توليد الصوت"); } catch { toast.error("تعذر"); } finally { setBusy((m) => ({ ...m, [t]: false })); } };

  const edit = async (i: Item & { orig?: string }) => {
    const n = window.prompt("عدّل الكلام:", i.t)?.trim(); if (!n || n === i.t) return;
    if (i.custom) saveCustom(custom.map((c) => (c.t === i.t ? { ...c, t: n } : c)));
    else if (i.orig) { const o = { ...ovr, [i.orig]: n }; setOvr(o); localStorage.setItem("live_sb_ovr", JSON.stringify(o)); void savePref("live_sb_ovr", o); }
    setBusy((m) => ({ ...m, [n]: true })); try { await gen(n); toast.success("تعدّل الكلام وانحفظ صوته"); } catch { toast.error("تعدّل الكلام، والصوت يتولد أول ضغطة"); } finally { setBusy((m) => ({ ...m, [n]: false })); }
  };
  const cats = [...new Set(all.map((i) => i.cat))];
  const shown = (c: string) => all.filter((i) => i.cat === c && (!q || i.t.includes(q)));
  const nReady = all.filter((i) => ready[i.t]).length;

  return (
    <section className="rounded-2xl border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="font-semibold">🎛️ لوحة الأصوات الفورية</h3><p className="text-xs text-muted-foreground">الصوت المحفوظ ينطق بلحظة الضغط · جاهز {nReady}/{all.length}</p></div>
        <button onClick={() => void prepAll()} disabled={!!prog} className="rounded-full border border-primary bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-60">{prog ? `⏳ تجهيز ${prog}` : "⚡ جهّز كل الأصوات"}</button>
      </div>
      <div className="sticky top-0 z-10 grid grid-cols-4 gap-1.5 rounded-xl bg-muted/60 p-2 text-xs">
        <button onClick={stop} className="rounded-lg bg-destructive py-2 font-bold text-destructive-foreground">⏹ وقف</button>
        <button onClick={() => last.current && void play(last.current)} className="rounded-lg border bg-background py-2">🔁 إعادة</button>
        <label className="col-span-2 flex items-center gap-1">🐢<input type="range" min={0.7} max={1.4} step={0.05} value={rate} onChange={(e) => { const v = Number(e.target.value); setRate(v); localStorage.setItem("live_sb_rate", String(v)); if (a.current) a.current.playbackRate = v; }} className="flex-1" />🐇 {rate.toFixed(2)}</label>
        <label className="col-span-4 flex items-center gap-1">🔉<input type="range" min={0.1} max={1} step={0.05} value={vol} onChange={(e) => { const v = Number(e.target.value); setVol(v); if (a.current) a.current.volume = v; }} className="flex-1" />🔊</label>
        {playing && <div className="col-span-4 truncate text-center text-primary">🔊 {playing}</div>}
      </div>
      <div className="rounded-xl border border-primary/40 p-2 space-y-1.5">
        <button onClick={listen} disabled={mic} className={`w-full rounded-lg py-2.5 text-sm font-bold ${mic ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-primary text-primary-foreground"}`}>{mic ? "🎤 أسمعك… تكلم" : "🎤 تكلم وأدوّر لك الصوت المحفوظ"}</button>
        {heard && <div className="text-xs">📝 سمعت: <b>{heard}</b> <button onClick={() => void play(heard)} className="ms-1 rounded-full border border-primary px-2 py-0.5 text-primary">🔊 انطقيها</button></div>}
        {hits.length > 0 && <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">{hits.map((t) => <button key={t} onClick={() => void play(t)} className="rounded-lg border bg-background px-2 py-2 text-right text-xs">⚡ {t}</button>)}</div>}
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 دوّر على جملة…" className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-2">
        <div className="mb-1.5 text-xs font-semibold">🧠 أزرار ذكية (كلام جديد كل ضغطة)</div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">{SMART.map(([l, p]) => <button key={l} onClick={() => onSmart(l, p)} className="rounded-lg border bg-background px-2 py-2 text-xs font-medium hover:border-primary">{l}</button>)}</div>
      </div>
      {cats.map((c) => { const it = shown(c); if (!it.length) return null; return (
        <div key={c}><div className="mb-1.5 text-xs font-semibold">{c}</div>
          <div className="grid grid-cols-3 gap-1 sm:grid-cols-5">{it.map((i) => (
            <div key={i.t} className={`relative rounded-lg border ${playing === i.t ? "border-primary bg-primary/10" : "bg-background"}`}>
              <button onClick={() => void play(i.t)} disabled={busy[i.t]} className="line-clamp-2 h-12 w-full px-1.5 py-1 text-right text-[11px] leading-tight">{busy[i.t] ? "⏳ " : ready[i.t] ? "🔊 " : "🔈 "}{i.t}</button>
              <div className="absolute bottom-0 left-0 flex gap-1 p-0.5 text-[9px] opacity-60"><button onClick={() => void regen(i.t)} title="أعد التوليد">♻️</button><button onClick={() => void edit(i)} title="عدّل الكلام">✏️</button>{i.custom && <button onClick={() => remove(i.t)} title="حذف">🗑️</button>}</div>
            </div>))}</div>
        </div>); })}
      <div className="rounded-xl border p-2 space-y-2">
        <div className="text-xs font-semibold">➕ سوّ صوت جديد حسب طلبك</div>
        <textarea value={newT} onChange={(e) => setNewT(e.target.value)} rows={2} maxLength={400} placeholder="اكتب الجملة اللي تبيها تنحفظ كزر" className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm" />
        <div className="flex gap-2"><input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="القسم" className="min-w-0 flex-1 rounded-lg border bg-background px-2 py-1.5 text-xs" /><button onClick={() => void add()} disabled={!newT.trim()} className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50">🎙️ ولّد واحفظ</button></div>
      </div>
      <p className="text-[11px] text-muted-foreground">⚡ = محفوظ وينطق فوراً · ○ = يتولد أول مرة ثم ينحفظ. لو غيرت الصوت من الإعدادات اضغط «جهّز كل الأصوات».</p>
    </section>
  );
}
