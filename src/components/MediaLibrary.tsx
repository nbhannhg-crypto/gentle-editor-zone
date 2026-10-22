import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { transcribeMedia } from "@/lib/media.functions";
import { MicButton } from "@/components/MicButton";
import { mediaAnalyze, mediaSendOne, waList } from "@/lib/studio.functions";
import { emptyMeta, pullMeta, pushMeta, removeMeta, type MediaMeta } from "@/lib/media-meta";
import { bestMedia, normalizeArabic } from "@/lib/media-match";
import { LibraryGuide, LibraryLock, MediaEditor, ShareBar } from "@/components/MediaTools";

type Item = { id: string; kind: string; title: string; code: string; transcript: string; path: string; mime: string; url?: string | undefined };
const KINDS = [["audio", "🎙️ أصوات"], ["video", "🎬 فيديو"], ["image", "🎨 تصاميم"]] as const;

export function MediaLibrary({ storeId }: { storeId?: string | undefined }) {
  const [kind, setKind] = useState<string>("audio");
  const [items, setItems] = useState<Item[]>([]);
  const [busyT, setBusyT] = useState("");
  const [q, setQ] = useState("");
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const transcribe = useServerFn(transcribeMedia);
  const analyze = useServerFn(mediaAnalyze);
  const sendOne = useServerFn(mediaSendOne);
  const [meta, setMeta] = useState<Record<string, MediaMeta>>({});
  const [folder, setFolder] = useState("");
  const [sessions, setSessions] = useState<string[]>([]);
  const [session, setSession] = useState("");
  const [sendTo, setSendTo] = useState("");
  const [sim, setSim] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  useEffect(() => { if (storeId) void pullMeta(storeId).then(setMeta).catch(() => {}); }, [storeId]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const loadCounts = async () => {
    if (!storeId) return;
    const r = await Promise.all(KINDS.map(([k]) => supabase.from("media_library").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("kind", k)));
    setCounts(Object.fromEntries(KINDS.map(([k], i) => [k, r[i]?.count ?? 0])));
  };
  const rename = async (it: Item, t: string) => {
    setRenaming(null);
    const v = t.trim(); if (!v || v === it.title) return;
    const { error } = await supabase.from("media_library").update({ title: v }).eq("id", it.id);
    if (error) toast.error(error.message); else { setItems((x) => x.map((i) => (i.id === it.id ? { ...i, title: v } : i))); toast.success("انحفظ الاسم ✅"); }
  };
  useEffect(() => {
    waList().then((l) => { const o = l.filter((i) => i.status === "open").map((i) => i.name); setSessions(o); if (o[0]) setSession((s) => s || o[0]!); }).catch(() => {});
  }, []);
  const m = (id: string) => meta[id] ?? emptyMeta();
  const setM = (id: string, patch: Partial<MediaMeta>) => {
    const next = { ...m(id), ...patch };
    setMeta((x) => ({ ...x, [id]: next }));
    if (storeId) void pushMeta(storeId, id, next).catch(() => toast.error("ما انحفظ بالسحابة، جرّب مرة ثانية"));
  };
  const runAnalyze = async (it: Item) => {
    setAiBusy(it.id);
    try {
      const r = await analyze({ data: { id: it.id } });
      const cur = m(it.id);
      setM(it.id, { ocr: r.ocr, summary: r.summary, tags: [...new Set([...cur.tags, ...r.tags])], questions: [...new Set([...cur.questions, ...r.questions])] });
      toast.success("الذكاء فهم الملف ✨");
    } catch (e) { toast.error((e as Error).message); } finally { setAiBusy(null); }
  };
  const sendItem = async (it: Item) => {
    const num = sendTo.replace(/\D/g, "").replace(/^05/, "9665");
    if (!session) { toast.error("ما فيه رقم واتساب مربوط ومفتوح"); return; }
    if (!/^\d{8,15}$/.test(num)) { toast.error("اكتب رقم الزبون صح"); return; }
    try {
      await sendOne({ data: { name: session, number: num, id: it.id, caption: "" } });
      setM(it.id, { sends: m(it.id).sends + 1 });
      toast.success(it.kind === "audio" ? "انرسل كرسالة صوتية 🎙️" : "انرسل ✅");
    } catch (e) { toast.error((e as Error).message); }
  };

  const load = async () => {
    if (!storeId) return;
    let qy = supabase.from("media_library").select("*").eq("store_id", storeId);
    if (kind !== "all") qy = qy.eq("kind", kind);
    const { data } = await qy.order("created_at", { ascending: false }).limit(kind === "all" ? 1000 : 300);
    const rows = (data ?? []) as Item[];
    if (rows.length) {
      const { data: urls } = await supabase.storage.from("media-library").createSignedUrls(rows.map((r) => r.path), 3600);
      rows.forEach((r, i) => { r.url = urls?.[i]?.signedUrl ?? undefined; });
    }
    setItems(rows);
  };
  useEffect(() => { void load(); void loadCounts(); }, [storeId, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (file: Blob, name: string) => {
    if (!storeId) return;
    setBusy(true);
    try {
      const ext = name.split(".").pop() || "bin";
      const path = `${storeId}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("media-library").upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;
      const k = file.type.startsWith("image") ? "image" : file.type.startsWith("video") ? "video" : "audio";
      const { data, error } = await supabase.from("media_library").insert({ store_id: storeId, kind: k, title: title || name, code, path, mime: file.type }).select("id").single();
      if (error) throw error;
      if (data && folder) setM(data.id, { folder });
      setTitle(""); setCode("");
      toast.success("انحفظ في المكتبة ✅");
      void loadCounts();
      if (k !== "image" && data) {
        toast.message("جاري تحويل الكلام لنص…");
        try { await transcribe({ data: { id: data.id } }); } catch (e) { toast.error((e as Error).message); }
      }
      if (k !== kind) setKind(k); else await load();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  // رفع جماعي: حتى 100 ملف دفعة وحدة، يدخلون المجلد المفتوح حالياً
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const saveMany = async (files: File[], target?: string) => {
    if (!storeId || !files.length) return;
    const dest = target ?? folder;
    const list = files.slice(0, 100);
    if (files.length > 100) toast.message("بنرفع أول 100 ملف، والباقي ارفعه بعدها");
    setBusy(true); setProg({ done: 0, total: list.length });
    let ok = 0; const kinds = new Set<string>();
    const newMeta: Record<string, MediaMeta> = {};
    for (let i = 0; i < list.length; i++) {
      const f = list[i]!;
      try {
        const ext = f.name.split(".").pop() || "bin";
        const path = `${storeId}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("media-library").upload(path, f, { contentType: f.type });
        if (up.error) throw up.error;
        const k = f.type.startsWith("image") ? "image" : f.type.startsWith("video") ? "video" : "audio";
        const nm = f.name.replace(/\.[^.]+$/, "");
        const { data, error } = await supabase.from("media_library").insert({ store_id: storeId, kind: k, title: title ? `${title} ${i + 1}` : nm, code, path, mime: f.type }).select("id").single();
        if (error) throw error;
        if (data && dest) {
          const mm = { ...emptyMeta(), folder: dest };
          newMeta[data.id] = mm;
          setMeta((x) => ({ ...x, [data.id]: mm }));
          // حفظ مضمون بالسحابة مع محاولة ثانية
          try { await pushMeta(storeId, data.id, mm); } catch { try { await pushMeta(storeId, data.id, mm); } catch { toast.error(`${f.name}: ما انحفظ الألبوم، انقله يدوياً`); } }
        }
        ok++; kinds.add(k);
      } catch (e) { toast.error(`${f.name}: ${(e as Error).message}`); }
      setProg({ done: i + 1, total: list.length });
    }
    setTitle(""); setCode(""); setBusy(false); setProg(null);
    toast.success(`انرفع ${ok} من ${list.length} ✅${dest ? ` داخل «${dest}»` : ""}`);
    void loadCounts();
    if (dest) { setFolder(dest); if (kind !== "all") setKind("all"); else await load(); }
    else if (kinds.size === 1 && !kinds.has(kind) && kind !== "all") setKind([...kinds][0] as typeof kind); else await load();
  };

  // ألبومات جديدة (فاضية) تنحفظ لين ينرفع فيها أول ملف
  const albumKey = `ml_albums:${storeId ?? ""}`;
  const [extraAlbums, setExtraAlbums] = useState<string[]>([]);
  useEffect(() => { try { setExtraAlbums(JSON.parse(localStorage.getItem(albumKey) || "[]")); } catch { /* */ } }, [albumKey]);
  const addAlbum = () => {
    const n = prompt("اسم الألبوم الجديد (مثلاً: صور العطور)")?.trim();
    if (!n) return;
    const next = [...new Set([...extraAlbums, n])];
    setExtraAlbums(next); localStorage.setItem(albumKey, JSON.stringify(next));
    setFolder(n); toast.success(`انفتح ألبوم «${n}» — ارفع فيه الحين`);
  };
  const renameAlbum = (old: string) => {
    const n = prompt("الاسم الجديد للألبوم", old)?.trim();
    if (!n || n === old) return;
    items.filter((i) => m(i.id).folder === old).forEach((i) => setM(i.id, { folder: n }));
    const next = extraAlbums.map((a) => (a === old ? n : a));
    setExtraAlbums(next); localStorage.setItem(albumKey, JSON.stringify(next));
    if (folder === old) setFolder(n);
  };

  const toggleRec = async () => {
    if (rec) { rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true } });
      const r = new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => chunks.current.push(e.data);
      r.onstop = () => { stream.getTracks().forEach((t) => t.stop()); setRec(null); void save(new Blob(chunks.current, { type: "audio/webm" }), "تسجيل.webm"); };
      r.start(); setRec(r);
    } catch { toast.error("اسمح للموقع باستخدام الميكروفون"); }
  };

  const del = async (it: Item) => {
    await supabase.storage.from("media-library").remove([it.path]);
    await supabase.from("media_library").delete().eq("id", it.id);
    if (storeId) void removeMeta(storeId, it.id).catch(() => {});
    void loadCounts();
    await load();
  };

  // داخل الألبوم نعرض كل الأنواع مع بعض
  useEffect(() => { if (folder) setKind("all"); }, [folder]);
  const [selMode, setSelMode] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const moveTo = async () => {
    const names = [...new Set([...items.map((i) => m(i.id).folder).filter(Boolean), ...extraAlbums])];
    const n = prompt(`اكتب اسم الألبوم اللي تبي تنقل له (أو اسم جديد):\n${names.join(" · ")}\n(اتركه فاضي = إخراج من الألبوم)`, folder)?.trim();
    if (n === undefined) return;
    const next = { ...meta };
    picked.forEach((id) => { next[id] = { ...m(id), folder: n }; });
    setMeta(next);
    if (storeId) {
      const r = await Promise.allSettled(picked.map((id) => pushMeta(storeId, id, next[id]!)));
      const bad = r.filter((x) => x.status === "rejected").length;
      if (bad) toast.error(`${bad} ملف ما انحفظ نقله بالسحابة، جرّب مرة ثانية`);
    }
    if (n && !extraAlbums.includes(n)) { const ea = [...extraAlbums, n]; setExtraAlbums(ea); localStorage.setItem(albumKey, JSON.stringify(ea)); }
    toast.success(`انتقل ${picked.length} ملف ${n ? `إلى «${n}»` : "خارج الألبوم"} ✅`);
    setPicked([]); setSelMode(false);
  };

  const folders = [...new Set(items.map((i) => m(i.id).folder).filter(Boolean))];
  const shown = items.filter((i) => {
    const mm = m(i.id);
    if (folder && mm.folder !== folder) return false;
    if (!q) return true;
    return `${i.title} ${i.code} ${i.transcript}`.includes(q) || normalizeArabic(`${i.title} ${i.code} ${i.transcript} ${mm.folder} ${mm.ocr} ${mm.summary} ${mm.tags.join(" ")} ${mm.triggers.join(" ")} ${mm.questions.join(" ")}`).includes(normalizeArabic(q));
  });
  const simHit = sim.trim() ? bestMedia(sim, items.map((i) => ({ ...i, ...m(i.id) })), 40) : null;
  const top = [...items].sort((a, b) => m(b.id).sends - m(a.id).sends).filter((i) => m(i.id).sends > 0).slice(0, 3);

  return (
    <LibraryLock storeId={storeId}>
    <div className="space-y-4 rounded-2xl border bg-card p-4">
      <h2 className="text-lg font-bold">📚 مكتبة الأصوات والفيديو والتصاميم</h2>
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="rounded-xl bg-secondary p-2"><b className="block text-lg">{(counts["audio"] ?? 0) + (counts["video"] ?? 0) + (counts["image"] ?? 0)}</b><span className="text-xs">📦 الكل</span></div>
        <div className="rounded-xl bg-secondary p-2"><b className="block text-lg">{counts["audio"] ?? 0}</b><span className="text-xs">🎙️ مقاطع</span></div>
        <div className="rounded-xl bg-secondary p-2"><b className="block text-lg">{counts["video"] ?? 0}</b><span className="text-xs">🎬 فيديو</span></div>
        <div className="rounded-xl bg-secondary p-2"><b className="block text-lg">{counts["image"] ?? 0}</b><span className="text-xs">🖼️ صور</span></div>
      </div>
      <LibraryGuide />
      <div className="flex gap-2 overflow-x-auto">
        <button onClick={() => setKind("all")} className={`shrink-0 rounded-full px-4 py-1.5 text-sm ${kind === "all" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>📦 الكل ({(counts["audio"] ?? 0) + (counts["video"] ?? 0) + (counts["image"] ?? 0)})</button>
        {KINDS.map(([k, l]) => (
          <button key={k} onClick={() => setKind(k)} className={`shrink-0 rounded-full px-4 py-1.5 text-sm ${kind === k ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{l} ({counts[k] ?? 0})</button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input placeholder="اسم الملف (اختياري)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input placeholder="كود للملف (اختياري)" value={code} onChange={(e) => setCode(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
          ⬆️ رفع ملف
          <input type="file" hidden accept="audio/*,video/*,image/*" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void save(f, f.name); e.target.value = ""; }} />
        </label>
        <label className="cursor-pointer rounded-md bg-accent px-4 py-2 text-sm text-accent-foreground">
          📚 رفع جماعي (حتى 100)
          <input type="file" hidden multiple accept="audio/*,video/*,image/*" disabled={busy}
            onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; void saveMany(fs); }} />
        </label>
        <Button variant={rec ? "destructive" : "secondary"} onClick={toggleRec} disabled={busy}>{rec ? "⏹️ أوقف التسجيل" : "🔴 سجّل مباشر"}</Button>
        {busy && !prog && <span className="self-center text-sm text-muted-foreground">جاري الحفظ…</span>}
      </div>
      {prog && (
        <div className="space-y-1">
          <p className="text-xs">جاري رفع {prog.done} من {prog.total}…{folder && ` داخل «${folder}»`}</p>
          <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${(prog.done / prog.total) * 100}%` }} /></div>
        </div>
      )}
      <div className="space-y-2 rounded-xl border p-3">
        <div className="flex items-center justify-between gap-2">
          {folder
            ? <><button className="text-sm" onClick={() => setFolder("")}>🔙 كل الألبومات</button><b className="truncate text-sm">📂 {folder}</b><button className="text-xs" onClick={() => renameAlbum(folder)}>✏️ تسمية</button></>
            : <><b className="text-sm">🖼️ الألبومات</b><Button size="sm" variant="secondary" onClick={addAlbum}>➕ ألبوم جديد</Button></>}
        </div>
        {!folder && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[...new Set([...folders, ...extraAlbums])].map((f) => {
              const inside = items.filter((i) => m(i.id).folder === f);
              const cover = inside.find((i) => i.kind === "image" && i.url);
              return (
                <button key={f} onClick={() => setFolder(f)} className="overflow-hidden rounded-lg border text-start">
                  <div className="flex h-20 items-center justify-center bg-secondary text-2xl">
                    {cover ? <img src={cover.url} alt={f} className="h-full w-full object-cover" /> : "📁"}
                  </div>
                  <div className="p-2"><b className="block truncate text-xs">{f}</b><span className="text-xs text-muted-foreground">{inside.length} ملف</span></div>
                </button>
              );
            })}
          </div>
        )}
        {folder && (
          <div className="space-y-2">
            <label className="block cursor-pointer rounded-md bg-primary px-4 py-2 text-center text-sm text-primary-foreground">
              ⬆️ رفع صور/فيديو/أصوات داخل «{folder}» (حتى 100)
              <input type="file" hidden multiple accept="audio/*,video/*,image/*" disabled={busy}
                onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; void saveMany(fs, folder); }} />
            </label>
            <p className="text-xs text-muted-foreground">أي ملف ترفعه الحين يدخل هذا الألبوم تلقائياً — ويطلع هنا كل الأنواع مع بعض.</p>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Input placeholder="🔍 ابحث بالاسم أو الكود أو الكلام" value={q} onChange={(e) => setQ(e.target.value)} />
        <MicButton onText={setQ} />
      </div>
      <div className="space-y-2 rounded-xl border border-dashed p-3">
        <b className="text-sm">📲 الإرسال للواتساب</b>
        <div className="grid gap-2 sm:grid-cols-2">
          <select className="rounded-md border bg-background px-2 py-2 text-sm" value={session} onChange={(e) => setSession(e.target.value)}>
            {!sessions.length && <option value="">⚠️ ما فيه رقم مربوط</option>}
            {sessions.map((n) => <option key={n} value={n}>🟢 {n}</option>)}
          </select>
          <Input placeholder="رقم الزبون 9665xxxxxxxx" value={sendTo} onChange={(e) => setSendTo(e.target.value)} inputMode="tel" />
        </div>
        <p className="text-xs text-muted-foreground">الأصوات تنرسل كرسالة صوتية أصلية (المايك الأخضر)، والصور والفيديو كوسائط.</p>
      </div>
      <div className="space-y-2 rounded-xl border border-dashed p-3">
        <b className="text-sm">🧪 جرّب كلام الزبون (فهم بالمعنى)</b>
        <Input placeholder="مثلاً: ودي أشوف درجات اللون" value={sim} onChange={(e) => setSim(e.target.value)} />
        {sim.trim() && (simHit ? <p className="text-sm">✅ بيرد بـ: <b>{simHit.item.title}</b> ({simHit.score}%)</p> : <p className="text-sm text-muted-foreground">ما فيه ملف مناسب — علّمها: أضف كلمات تشغيل أو اضغط «✨ افهم بالذكاء».</p>)}
      </div>
      {(folders.length > 0 || top.length > 0) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {folders.length > 0 && <button onClick={() => setFolder("")} className={`rounded-full px-3 py-1 ${!folder ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>📁 الكل</button>}
          {folders.map((f) => <button key={f} onClick={() => setFolder(f)} className={`rounded-full px-3 py-1 ${folder === f ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>📁 {f}</button>)}
          {top.length > 0 && <span className="self-center text-muted-foreground">🏆 الأكثر إرسالاً: {top.map((t) => `${t.title} (${m(t.id).sends})`).join(" · ")}</span>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-2 text-xs">
        <Button size="sm" variant={selMode ? "default" : "secondary"} onClick={() => { setSelMode(!selMode); setPicked([]); }}>{selMode ? "✖️ إلغاء التحديد" : "☑️ تحديد متعدد"}</Button>
        {selMode && <>
          <Button size="sm" variant="secondary" onClick={() => setPicked(shown.map((i) => i.id))}>تحديد الكل ({shown.length})</Button>
          <span>محدد: {picked.length}</span>
          <Button size="sm" disabled={!picked.length} onClick={moveTo}>📂 نقل إلى ألبوم…</Button>
        </>}
      </div>
      {!shown.length && <p className="text-sm text-muted-foreground">ما فيه ملفات هنا للحين.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {shown.map((it) => (
          <div key={it.id} className={`space-y-2 rounded-xl border p-3 ${picked.includes(it.id) ? "ring-2 ring-primary" : ""}`}>
            {selMode && (
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={picked.includes(it.id)} onChange={() => togglePick(it.id)} /> حدد للنقل</label>
            )}
            <div className="flex items-center justify-between gap-2">
              {renaming === it.id
                ? <Input autoFocus defaultValue={it.title} className="h-8 text-sm" onBlur={(e) => void rename(it, e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
                : <b className="truncate text-sm">{it.title} <button className="text-xs" title="غيّر الاسم" onClick={() => setRenaming(it.id)}>✏️</button></b>}
              {it.code && <span className="rounded bg-secondary px-2 text-xs">#{it.code}</span>}
            </div>
            {it.url && it.kind === "image" && <img src={it.url} alt={it.title} className="max-h-48 w-full rounded-lg object-cover" />}
            {it.url && it.kind === "video" && <video src={it.url} controls className="max-h-48 w-full rounded-lg" />}
            {it.url && it.kind === "audio" && <audio src={it.url} controls className="w-full" />}
            {it.kind !== "image" && (
              it.transcript
                ? <p className="rounded-md border border-border bg-muted px-2 py-1.5 text-sm font-semibold text-foreground">💬 {it.transcript}</p>
                : <p className="text-xs text-muted-foreground">بدون تفريغ نصي</p>
            )}
            <div className="flex gap-2">
              {it.kind !== "image" && (
                <Button size="sm" variant="secondary" disabled={busyT === it.id} onClick={async () => { setBusyT(it.id); try { await transcribe({ data: { id: it.id } }); await load(); toast.success("تم تفريغ الصوت ✅"); } catch (e) { toast.error((e as Error).message); } finally { setBusyT(""); } }}>{busyT === it.id ? "⏳ جاري التحويل..." : "📝 حوّل لنص"}</Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => { if (confirm("أكيد تحذف الملف؟")) void del(it); }}>🗑️</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => sendItem(it)}>📲 إرسال</Button>
              <Button size="sm" variant="secondary" disabled={aiBusy === it.id} onClick={() => runAnalyze(it)}>{aiBusy === it.id ? "يفهم…" : "✨ افهم بالذكاء"}</Button>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={m(it.id).active} onChange={(e) => setM(it.id, { active: e.target.checked })} /> مفعّل للرد</label>
              <span className="text-xs text-muted-foreground">📤 {m(it.id).sends}</span>
              <Button size="sm" variant="ghost" onClick={() => setOpen(open === it.id ? null : it.id)}>⚙️ تخصيص</Button>
            </div>
            {m(it.id).summary && <p className="text-xs">🧠 {m(it.id).summary}</p>}
            {m(it.id).tags.length > 0 && <div className="flex flex-wrap gap-1">{m(it.id).tags.map((t) => <span key={t} className="rounded bg-secondary px-2 text-xs">{t}</span>)}</div>}
            {open === it.id && (
              <div className="space-y-2 rounded-lg bg-secondary/50 p-2">
                <Input placeholder="📁 اسم المجلد" defaultValue={m(it.id).folder} onBlur={(e) => setM(it.id, { folder: e.target.value.trim() })} />
                <Input placeholder="⚡ كلمات التشغيل (افصل بفاصلة)" defaultValue={m(it.id).triggers.join("، ")} onBlur={(e) => setM(it.id, { triggers: e.target.value.split(/[,،\n]/).map((x) => x.trim()).filter(Boolean) })} />
                <textarea className="w-full rounded-md border bg-background p-2 text-xs" rows={3} placeholder="💬 أسئلة الزبون المتوقعة (سطر لكل سؤال)" defaultValue={m(it.id).questions.join("\n")} onBlur={(e) => setM(it.id, { questions: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />
                {m(it.id).ocr && <p className="text-xs text-muted-foreground">🔤 النص داخل الملف: {m(it.id).ocr}</p>}
              </div>
            )}
            <ShareBar it={it} />
            <Button size="sm" variant="outline" onClick={() => setEditing(editing === it.id ? null : it.id)}>✂️ قص وتعديل</Button>
            {editing === it.id && <MediaEditor it={it} onSave={save} onClose={() => setEditing(null)} />}
          </div>
        ))}
      </div>
    </div>
    </LibraryLock>
  );
}
