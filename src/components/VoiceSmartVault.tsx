import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EMOTIONS } from "@/components/VoiceStudio";
import { VoiceModelPicker } from "@/components/VoiceModelPicker";
import { getStudioVoice, getVoiceModel } from "@/lib/voice-model";
import { vaultContext, pullMine, pullKingdom, pushClip, removeClip, publishKingdom } from "@/lib/voice-vault-cloud";

/* لوحة بنك الأصوات والمجلدات الذكية — إضافة مستقلة، تستخدم نفس مقاطع البنك الحالية */
export type VaultClip = { id: string; cat: string; text: string; audio?: string | undefined; speed?: number; emotion?: string; triggers?: string; title?: string; banned?: string; vip?: string | undefined; voice?: string; model?: string; fname?: string };
type Folder = [string, string];
const BASE: Folder[] = [["welcome", "👋 الترحيب والاستقبال"], ["price", "💰 الأسعار والاعتراضات"], ["ship", "🚚 الشحن والضمان"], ["fun", "💖 غنج وسوالف ودلع"], ["close", "🤝 إغلاق الصفقات"], ["personal", "🔐 مكتبتي الخاصة"], ["kingdom", "👑 أصوات المملكة الرسمية"]];

/* شريط صوت صغير: زر تشغيل بالطرف + خط تقدم + الثواني */
function AudioBar({ load, speed = 1, label }: { load: () => Promise<string>; speed?: number; label: string }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [t, setT] = useState(0);
  const [d, setD] = useState(0);
  const toggle = async () => {
    if (ref.current && on) { ref.current.pause(); setOn(false); return; }
    try {
      if (!ref.current) {
        setBusy(true);
        const el = new Audio(await load());
        el.ontimeupdate = () => setT(el.currentTime);
        el.onloadedmetadata = () => setD(el.duration || 0);
        el.onended = () => { setOn(false); setT(0); };
        ref.current = el;
      }
      ref.current.playbackRate = speed;
      await ref.current.play(); setOn(true);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const seek = (v: number) => { if (ref.current && d) { ref.current.currentTime = v; setT(v); } };
  return (
    <div className="mt-2 flex items-center gap-2 rounded-full border bg-secondary px-2 py-1" title={label}>
      <button type="button" onClick={toggle} disabled={busy} aria-label={on ? "إيقاف" : "تشغيل"}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
        {busy ? "…" : on ? "⏸" : "▶"}
      </button>
      <input type="range" min={0} max={d || 1} step={0.05} value={t} onChange={(e) => seek(+e.target.value)} className="h-1 flex-1 accent-primary" aria-label="تقدم الصوت" />
      <span className="w-14 shrink-0 text-left text-[10px] text-muted-foreground" dir="ltr">{t.toFixed(1)}/{d ? d.toFixed(1) : "–"}s</span>
    </div>
  );
}
const FOLDERS_KEY = "live_vault_folders";
const LABELS_KEY = "live_vault_labels";
const norm = (s: string) => s.replace(/[\u064B-\u0652\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
const splitPh = (s?: string) => (s ?? "").split(/[\/|\n,،]+/).map((x) => x.trim()).filter(Boolean);
const joinPh = (a: string[]) => [...new Map(a.map((x) => [norm(x), x])).values()].join("، ");
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
  const [phrases, setPhrases] = useState("");
  const [emotion, setEmotion] = useState("");
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState("");
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [dur, setDur] = useState<Record<string, number>>({});

  const [labels, setLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(FOLDERS_KEY) ?? "[]"); if (Array.isArray(v)) setCustom(v); } catch { /* */ }
    try { setLabels(JSON.parse(localStorage.getItem(LABELS_KEY) ?? "{}") || {}); } catch { /* */ }
  }, []);
  const kgFolders: Folder[] = [...new Map(p.clips.filter((c) => c.cat.startsWith("kg:")).map((c) => [c.cat, [c.cat, `👑 ${c.fname || "مجلد ملكي"}`] as Folder])).values()];
  const folders = [...BASE, ...custom, ...kgFolders];
  const lbl = (k: string, l: string) => labels[k] || l;

  /* ☁️ مزامنة سحابية (إضافة): المحلي فوري دائماً، والسحابة بالخلفية */
  const [ctx, setCtx] = useState({ storeId: "", admin: false });
  const [kingIds, setKingIds] = useState<Set<string>>(new Set());
  const clipsRef = useRef(p.clips); clipsRef.current = p.clips;
  const synced = useRef<Map<string, string>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncCloud = (next: VaultClip[]) => {
    if (!ctx.storeId) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const own = next.filter((c) => !c.id.startsWith("kg_"));
      const ids = new Set(own.map((c) => c.id));
      for (const c of own) {
        const j = JSON.stringify(c);
        if (synced.current.get(c.id) !== j) { synced.current.set(c.id, j); void pushClip(ctx.storeId, c).catch(() => synced.current.delete(c.id)); }
      }
      for (const id of [...synced.current.keys()]) if (!ids.has(id)) { synced.current.delete(id); void removeClip(ctx.storeId, id).catch(() => {}); }
    }, 800);
  };
  useEffect(() => {
    let off = false;
    (async () => {
      const c = await vaultContext(); if (off) return; setCtx(c);
      try {
        const [mine, kg] = await Promise.all([pullMine(c.storeId), pullKingdom()]);
        if (off) return;
        setKingIds(new Set(kg.map((x) => x.id.replace(/^kg_/, ""))));
        const local = clipsRef.current;
        for (const x of mine) synced.current.set(x.id, JSON.stringify(x));
        const localIds = new Set(local.map((x) => x.id));
        const keepKg = new Map(local.filter((x) => x.id.startsWith("kg_")).map((x) => [x.id, x]));
        const merged = [
          ...local.filter((x) => !x.id.startsWith("kg_")),
          ...mine.filter((x) => !localIds.has(x.id)),
          ...kg.map((x) => ({ ...x, ...(keepKg.get(x.id) ? { triggers: keepKg.get(x.id)!.triggers, banned: keepKg.get(x.id)!.banned } : {}) })),
        ];
        try { p.saveClips(merged); } catch { /* local full — keep going */ }
        // رفع المقاطع المحلية اللي ما وصلت السحابة بعد
        if (c.storeId) for (const x of merged) if (!x.id.startsWith("kg_") && !synced.current.has(x.id)) { synced.current.set(x.id, JSON.stringify(x)); void pushClip(c.storeId, x).catch(() => synced.current.delete(x.id)); }
      } catch { /* offline: localStorage only */ }
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggleKingdom = async (c: VaultClip) => {
    const id = c.id.replace(/^kg_/, ""); const on = !kingIds.has(id);
    try {
      await publishKingdom(c, on);
      setKingIds((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
      toast.success(on ? "👑 انتشر لكل التجار في «أصوات المملكة الرسمية»" : "⭕ انسحب من المملكة");
    } catch (e) { toast.error((e as Error).message); }
  };
  const save = (c: VaultClip[]) => { try { p.saveClips(c); } catch { toast.error("المساحة ممتلئة — احذف مقاطع قديمة"); } syncCloud(c); };
  const [q, setQ] = useState("");
  const [sim, setSim] = useState("");
  const [simRes, setSimRes] = useState<{ clip?: VaultClip | undefined; how: string; ms: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const stopAll = useRef(false);

  const addFolder = () => {
    const name = window.prompt("اسم المجلد الصوتي الجديد؟")?.trim();
    if (!name) return;
    const next: Folder[] = [...custom, [`f_${uid()}`, `📁 ${name}`]];
    setCustom(next); localStorage.setItem(FOLDERS_KEY, JSON.stringify(next)); setCat(next[next.length - 1]![0]);
  };
  const renameFolder = () => {
    const cur = folders.find(([k]) => k === cat);
    const name = window.prompt("الاسم الجديد للمجلد؟", cur ? lbl(cur[0], cur[1]) : "")?.trim();
    if (!name) return;
    const next = { ...labels, [cat]: name };
    setLabels(next); localStorage.setItem(LABELS_KEY, JSON.stringify(next)); toast.success("✏️ تغيّر الاسم");
  };
  const deleteFolder = () => {
    if (!window.confirm("حذف المجلد؟ المقاطع ما تنحذف، تنتقل لمجلد الترحيب")) return;
    const next = custom.filter(([k]) => k !== cat);
    setCustom(next); localStorage.setItem(FOLDERS_KEY, JSON.stringify(next));
    save(p.clips.map((c) => (c.cat === cat ? { ...c, cat: "welcome" } : c))); setCat("welcome");
  };

  const curVoice = () => getStudioVoice() || "";
  const cached = text.trim() ? p.clips.find((c) => c.audio && norm(c.text) === norm(text) && c.cat === cat && (c.voice ?? "") === curVoice()) : undefined;
  const checkOrGen = async () => {
    const t = text.trim();
    if (!t) { toast.error("اكتب العبارة"); return; }
    const ph = splitPh(phrases);
    if (cached) {
      if (!ph.length) { toast("💾 نفس الرد بنفس الصوت موجود أصلاً في هذا المجلد"); setQ(cached.text); return; }
      save(p.clips.map((x) => (x.id === cached.id ? { ...x, triggers: joinPh([...splitPh(x.triggers), ...ph]) } : x)));
      setText(""); setPhrases(""); setQ(cached.text); toast.success(`💾 الصوت موجود — انضافت ${ph.length} عبارة لنفس البطاقة بدون توليد`); return;
    }
    setBusy("gen");
    try {
      const a = await p.tts(t, { emotion });
      save([{ id: uid(), cat, text: t, audio: a, speed, emotion, voice: curVoice(), model: getVoiceModel(), ...(ph.length ? { triggers: joinPh(ph) } : {}) }, ...p.clips]);
      const el = new Audio(a); el.playbackRate = speed; void el.play();
      setText(""); setPhrases(""); toast.success(ph.length ? `🪄 انولّد وانربط بـ ${ph.length} عبارة` : "🪄 انولّد وانحفظ في المجلد");
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
  const inFolder = p.clips.filter((c) => c.cat === cat);
  const qn = norm(q);
  const list = qn ? inFolder.filter((c) => norm(`${c.title ?? ""} ${c.text} ${c.triggers ?? ""}`).includes(qn)) : inFolder;

  /* ===== إضافات: حزم المجلدات ===== */
  const playAll = async () => {
    if (playing) { stopAll.current = true; return; }
    const items = inFolder; if (!items.length) { toast("المجلد فاضي"); return; }
    setPlaying(true); stopAll.current = false;
    try {
      for (const c of items) {
        if (stopAll.current) break;
        const el = new Audio(await audioOf(c)); el.playbackRate = c.speed ?? 1;
        await new Promise<void>((res) => { el.onended = () => res(); el.onerror = () => res(); void el.play().catch(() => res()); const iv = setInterval(() => { if (stopAll.current) { el.pause(); clearInterval(iv); res(); } }, 200); el.addEventListener("ended", () => clearInterval(iv)); });
      }
    } catch (e) { toast.error((e as Error).message); } finally { setPlaying(false); }
  };
  const copyBundle = () => {
    const name = window.prompt("اسم نسخة الحزمة؟", `نسخة ${lbl(cat, folders.find(([k]) => k === cat)?.[1] ?? cat)}`)?.trim();
    if (!name) return;
    const fid = `f_${uid()}`; const next: Folder[] = [...custom, [fid, `📁 ${name}`]];
    setCustom(next); localStorage.setItem(FOLDERS_KEY, JSON.stringify(next));
    save([...inFolder.map((c) => ({ ...c, id: uid(), cat: fid })), ...p.clips]); setCat(fid);
    toast.success(`📋 انتسخت الحزمة (${inFolder.length} مقطع)`);
  };
  const publishBundle = async () => {
    if (!inFolder.length) { toast("المجلد فاضي"); return; }
    if (!window.confirm(`نشر ${inFolder.length} مقطع للمملكة وكل التجار؟`)) return;
    let ok = 0;
    const fname = lbl(cat, folders.find(([k]) => k === cat)?.[1] ?? cat).replace(/^[^\p{L}\p{N}]+/u, "");
    for (const c of inFolder) { try { await publishKingdom({ ...c, fname: c.fname || fname, cat: cat.startsWith("kg:") ? cat.slice(3) : cat }, true, true); ok++; setKingIds((s) => new Set(s).add(c.id.replace(/^kg_/, ""))); } catch { /* يكمل */ } }
    toast.success(`👑 انتشر ${ok} من ${inFolder.length} مقطع للمملكة`);
  };

  /* ===== إضافة: محاكي المطابقة (قراءة فقط) ===== */
  const simulate = () => {
    const t0 = performance.now(); const s = norm(sim);
    if (!s) { setSimRes(null); return; }
    const q2 = ` ${s} `; let hit: VaultClip | undefined; let how = "";
    if (p.opts.triggers) hit = p.clips.find((c) => {
      if (!c.triggers) return false;
      const bans = (c.banned ?? "").split(/[,،\n\/|]+/).map(norm).filter(Boolean);
      if (bans.some((b) => s.includes(b))) return false;
      return c.triggers.split(/[,،\n\/|]+/).map(norm).filter(Boolean).some((w) => q2.includes(` ${w} `) || s === w);
    });
    if (hit) how = "🎯 كلمة تشغيل";
    if (!hit && p.opts.link) { hit = p.clips.find((c) => norm(c.text) === s); if (hit) how = "🔗 مطابق لنص الرد"; }
    setSimRes({ clip: hit, how, ms: performance.now() - t0 });
  };

  return (
    <section className="rounded-2xl border-2 border-primary/30 bg-card p-5 shadow-soft">
      <h3 className="font-display text-lg">🎛️ لوحة تحكم بنك الأصوات والمجلدات الذكية</h3>
      <p className="text-xs text-muted-foreground">Voice Smart Vault</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-secondary px-3 py-1">💾 جاهزة في الكاش: {ready}</span>
        <span className="rounded-full bg-secondary px-3 py-1">🎯 مربوطة بكلمات التشغيل: {linked}</span>
      </div>
      <div className="mt-3 space-y-1 rounded-xl border bg-background p-3 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={p.opts.link} onChange={(e) => p.saveOpts({ ...p.opts, link: e.target.checked })} />🔗 تفعيل الربط التلقائي بمكتبة الردود (يشغّل التسجيل الجاهز بدل توليد صوت)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={p.opts.triggers} onChange={(e) => p.saveOpts({ ...p.opts, triggers: e.target.checked })} />🎯 تفعيل كلمات التشغيل المباشرة للمقاطع</label>
      </div>

      <p className="mt-4 mb-2 text-sm font-medium">📁 المجلدات الصوتية</p>
      <div className="flex flex-wrap gap-1">
        {folders.map(([k, l]) => (
          <Button key={k} size="sm" variant={cat === k ? "default" : "outline"} onClick={() => setCat(k)}>{lbl(k, l)} ({p.clips.filter((c) => c.cat === k).length})</Button>
        ))}
        <Button size="sm" variant="secondary" onClick={addFolder}>➕ مجلد جديد</Button>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        <Button size="sm" variant="ghost" onClick={renameFolder}>✏️ سمّ المجلد المختار</Button>
        {custom.some(([k]) => k === cat) && <Button size="sm" variant="ghost" onClick={deleteFolder}>🗑️ احذف المجلد (المقاطع تنتقل للترحيب)</Button>}
      </div>

      <div className="mt-4 space-y-2 rounded-xl bg-secondary p-3">
        <p className="text-sm font-medium">🪄 الفحص والكاش المسبق</p>
        <label className="block text-xs font-medium">🗣️ كلام الزبون / العبارات المشغّلة</label>
        <textarea value={phrases} onChange={(e) => setPhrases(e.target.value)} rows={2} placeholder="مساء الخير / مساء الفل / مساء العسل" className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
        {splitPh(phrases).length > 0 && <div className="flex flex-wrap gap-1">{splitPh(phrases).map((x, i) => <span key={i} className="rounded-full bg-background px-2 py-0.5 text-[11px]">🎯 {x}</span>)}</div>}
        <label className="block text-xs font-medium">🔊 الرد الذي سيُولد بصوت</label>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب العبارة للتحقق أو التوليد…" />
        {text.trim() && <p className="text-xs">{cached ? "💾 نفس الرد بنفس الصوت موجود — العبارات تنضاف لبطاقته بدون توليد" : "✨ رد جديد (أو صوت بنت مختلفة) — يتولد بنقرة"}</p>}
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

      <div className="mt-4 space-y-2 rounded-xl border border-primary/30 bg-background p-3">
        <p className="text-sm font-medium">🧪 محاكي فحص المطابقة</p>
        <div className="flex gap-2">
          <Input value={sim} onChange={(e) => setSim(e.target.value)} onKeyDown={(e) => e.key === "Enter" && simulate()} placeholder="اكتب كأنك الزبون: مساء الخير، كم التوصيل…" className="h-9 text-sm" />
          <Button size="sm" onClick={simulate}>افحص</Button>
        </div>
        {simRes && (simRes.clip ? (
          <div className="rounded-lg bg-secondary p-2 text-xs">
            <p>✅ {simRes.how} — {simRes.clip.audio ? "⚡ تسجيل جاهز بدون توليد" : "⏳ يتولد أول مرة"} — {simRes.ms.toFixed(1)} ms</p>
            <p className="mt-1 font-medium">"{simRes.clip.title || simRes.clip.text}"</p>
            <AudioBar key={simRes.clip.id} label={simRes.clip.text} speed={simRes.clip.speed ?? 1} load={() => audioOf(simRes.clip!)} />
          </div>
        ) : <p className="rounded-lg bg-secondary p-2 text-xs">⭕ ما فيه مقطع مطابق — المكالمة تكمل بمسارها المعتاد (الردود/الذكاء أو «علّمها»).</p>)}
      </div>

      <p className="mt-4 mb-2 text-sm font-medium">📋 مقاطع المجلد المختار</p>
      <div className="mb-2 flex flex-wrap gap-1">
        <Button size="sm" variant="secondary" onClick={playAll}>{playing ? "⏹️ أوقف التشغيل" : "▶️ تشغيل المجلد متتالي"}</Button>
        <Button size="sm" variant="outline" onClick={copyBundle}>📋 انسخ الحزمة</Button>
        {ctx.admin && <Button size="sm" variant="outline" className="border-gold text-gold" onClick={publishBundle}>👑 انشر المجلد كامل للمملكة</Button>}
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 ابحث داخل المجلد (الاسم، النص، الكلمات)" className="mb-2 h-8 text-xs" />
      <div className="space-y-2">
        {list.map((c) => {
          const upd = (patch: Partial<VaultClip>) => save(p.clips.map((x) => (x.id === c.id ? { ...x, ...patch } : x)));
          const isKg = c.id.startsWith("kg_");
          return (
          <div key={c.id} className="rounded-xl border bg-background p-3">
            <div className="flex items-center gap-2">
              <Input defaultValue={c.title ?? ""} placeholder="🏷️ سمّ المقطع باللي تبي" className="h-8 flex-1 text-sm font-medium"
                onChange={(e) => upd({ title: e.target.value.trim() })} />
              <span className="whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 text-[10px]">{lbl(c.cat, folders.find(([k]) => k === c.cat)?.[1] ?? c.cat)}</span>
            </div>
            <div className="mt-1 flex items-start justify-between gap-2">
              <p className="text-sm">"{c.text}"</p>
              <span className="whitespace-nowrap text-[10px] text-muted-foreground">{c.audio ? `⚡ مخزن${dur[c.id] ? ` (${dur[c.id]!.toFixed(1)} ث)` : ""}` : "⏳ غير مولّد"}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {splitPh(c.triggers).map((w, i, arr) => (
                <span key={i} className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px]">
                  <button type="button" onClick={() => { const v = window.prompt("تعديل العبارة", w)?.trim(); if (v) upd({ triggers: joinPh(arr.map((x, j) => (j === i ? v : x))) }); }}>🎯 {w}</button>
                  <button type="button" aria-label="حذف العبارة" className="text-destructive" onClick={() => upd({ triggers: joinPh(arr.filter((_, j) => j !== i)) })}>×</button>
                </span>
              ))}
              <button type="button" className="rounded-full border px-2 py-0.5 text-[11px]" onClick={() => { const v = window.prompt("أضف عبارة (تقدر تفصل بـ / أو |)"); if (v) upd({ triggers: joinPh([...splitPh(c.triggers), ...splitPh(v)]) }); }}>➕ إضافة عبارة</button>
            </div>
            <AudioBar key={`${c.id}_${c.audio ? c.audio.length : 0}`} label={c.title || c.text} speed={c.speed ?? 1} load={() => audioOf(c)} />
            <div className="mt-2 flex flex-wrap gap-1">
              <Button size="sm" disabled={!p.live || busy === c.id} onClick={() => fire(c)}>⚡ أطلق في المكالمة</Button>
              <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => ptt(c)}>🚀 واتساب</Button>
              {ctx.admin && <Button size="sm" variant={kingIds.has(c.id.replace(/^kg_/, "")) ? "secondary" : "outline"} className="border-gold text-gold" onClick={() => toggleKingdom(c)}>
                {kingIds.has(c.id.replace(/^kg_/, "")) ? "👑 منشور — إلغاء" : "👑 انشر للمملكة"}</Button>}
              <Button size="sm" variant="ghost" onClick={() => { const v = window.prompt("تعديل نص الرد (يحتاج إعادة توليد)", c.text)?.trim(); if (v && v !== c.text) { upd({ text: v, audio: undefined }); toast("✏️ تعدّل — اضغط تشغيل ليتولد الصوت الجديد"); } }}>✏️ نص الرد</Button>
              <Button size="sm" variant="ghost" disabled={busy === c.id} onClick={() => { if (window.confirm("إعادة توليد الصوت؟")) upd({ audio: undefined, voice: curVoice(), model: getVoiceModel() }); }}>🔄 إعادة توليد</Button>
              <Button size="sm" variant="destructive" onClick={() => { if (window.confirm("حذف المقطع نهائياً؟")) { save(p.clips.filter((x) => x.id !== c.id)); toast.success("🗑️ انحذف"); } }}>🗑️ حذف</Button>
            </div>
            <details className="mt-2 rounded-lg border bg-secondary/40 p-2">
              <summary className="cursor-pointer text-xs font-medium">⚙️ تخصيص وتدريب المقطع</summary>
              {isKg && <p className="mt-1 text-[10px] text-muted-foreground">👑 مقطع من المملكة — تعديلك يبقى عندك فقط.</p>}
              <Input defaultValue={c.triggers ?? ""} placeholder="🎯 علّمها: كلمات الزبون (مرحبا, هلا, كم السعر)" className="mt-2 h-8 text-xs"
                onChange={(e) => upd({ triggers: e.target.value })} onBlur={(e) => upd({ triggers: e.target.value.trim() })} />
              <Input defaultValue={c.banned ?? ""} placeholder="🚫 الممنوع: إذا قالها الزبون ما يشتغل هالمقطع" className="mt-2 h-8 text-xs"
                onChange={(e) => upd({ banned: e.target.value })} onBlur={(e) => upd({ banned: e.target.value.trim() })} />
              <Input defaultValue={c.vip ?? ""} dir="ltr" placeholder="⭐ رقم VIP لهذا المقطع (اختياري)" className="mt-2 h-8 text-xs"
                onChange={(e) => upd({ vip: e.target.value.replace(/\D/g, "") })} />
              <select value={c.cat} onChange={(e) => { upd({ cat: e.target.value }); toast.success("📁 انتقل المقطع"); }}
                className="mt-2 w-full rounded-md border bg-background px-2 py-1 text-xs" aria-label="نقل لمجلد">
                {folders.map(([k, l]) => <option key={k} value={k}>📁 {lbl(k, l)}</option>)}
              </select>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <select value={c.emotion ?? ""} onChange={(e) => upd({ emotion: e.target.value, audio: undefined })} className="rounded-md border bg-background px-2 py-1" aria-label="نبرة المقطع">
                  {EMOTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <label className="flex flex-1 items-center gap-1">🎚️ {(c.speed ?? 1).toFixed(2)}x
                  <input type="range" min={0.7} max={1.3} step={0.05} value={c.speed ?? 1} className="flex-1" onChange={(e) => upd({ speed: +e.target.value })} />
                </label>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <Button size="sm" variant="secondary" disabled={busy === c.id} onClick={() => listen(c)}>{busy === c.id ? "…" : "▶️ استماع فوري"}</Button>
                <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => { upd({ audio: undefined }); toast("🔄 بيتولد من جديد عند التشغيل"); }}>🔄 إعادة وزن</Button>
              </div>
            </details>
          </div>
          );
        })}
        {!list.length && <p className="text-sm text-muted-foreground">المجلد فاضي — اكتب عبارة فوق أو سجّل/ارفع صوت.</p>}
      </div>
    </section>
  );
}
