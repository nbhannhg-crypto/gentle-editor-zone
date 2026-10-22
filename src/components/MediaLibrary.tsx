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
    const { data } = await supabase.from("media_library").select("*").eq("store_id", storeId).eq("kind", kind).order("created_at", { ascending: false }).limit(300);
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
      setTitle(""); setCode("");
      toast.success("انحفظ في المكتبة ✅");
      if (k !== "image" && data) {
        toast.message("جاري تحويل الكلام لنص…");
        try { await transcribe({ data: { id: data.id } }); } catch (e) { toast.error((e as Error).message); }
      }
      if (k !== kind) setKind(k); else await load();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
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
    await load();
  };

  const folders = [...new Set(items.map((i) => m(i.id).folder).filter(Boolean))];
  const shown = items.filter((i) => {
    const mm = m(i.id);
    if (folder && mm.folder !== folder) return false;
    if (!q) return true;
    return `${i.title} ${i.code} ${i.transcript}`.includes(q) || normalizeArabic(`${i.title} ${i.code} ${i.transcript} ${mm.ocr} ${mm.summary} ${mm.tags.join(" ")} ${mm.triggers.join(" ")} ${mm.questions.join(" ")}`).includes(normalizeArabic(q));
  });
  const simHit = sim.trim() ? bestMedia(sim, items.map((i) => ({ ...i, ...m(i.id) })), 40) : null;
  const top = [...items].sort((a, b) => m(b.id).sends - m(a.id).sends).filter((i) => m(i.id).sends > 0).slice(0, 3);

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-4">
      <h2 className="text-lg font-bold">📚 مكتبة الأصوات والفيديو والتصاميم</h2>
      <div className="flex gap-2 overflow-x-auto">
        {KINDS.map(([k, l]) => (
          <button key={k} onClick={() => setKind(k)} className={`shrink-0 rounded-full px-4 py-1.5 text-sm ${kind === k ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{l}</button>
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
        <Button variant={rec ? "destructive" : "secondary"} onClick={toggleRec} disabled={busy}>{rec ? "⏹️ أوقف التسجيل" : "🔴 سجّل مباشر"}</Button>
        {busy && <span className="self-center text-sm text-muted-foreground">جاري الحفظ…</span>}
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
      {!shown.length && <p className="text-sm text-muted-foreground">ما فيه ملفات هنا للحين.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {shown.map((it) => (
          <div key={it.id} className="space-y-2 rounded-xl border p-3">
            <div className="flex items-center justify-between gap-2">
              <b className="truncate text-sm">{it.title}</b>
              {it.code && <span className="rounded bg-secondary px-2 text-xs">#{it.code}</span>}
            </div>
            {it.url && it.kind === "image" && <img src={it.url} alt={it.title} className="max-h-48 w-full rounded-lg object-cover" />}
            {it.url && it.kind === "video" && <video src={it.url} controls className="max-h-48 w-full rounded-lg" />}
            {it.url && it.kind === "audio" && <audio src={it.url} controls className="w-full" />}
            {it.kind !== "image" && (
              <p className="text-xs text-muted-foreground">{it.transcript || "بدون تفريغ نصي"}</p>
            )}
            <div className="flex gap-2">
              {it.kind !== "image" && (
                <Button size="sm" variant="secondary" onClick={async () => { try { await transcribe({ data: { id: it.id } }); await load(); } catch (e) { toast.error((e as Error).message); } }}>📝 حوّل لنص</Button>
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
          </div>
        ))}
      </div>
    </div>
  );
}
