import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { transcribeMedia } from "@/lib/media.functions";
import { MicButton } from "@/components/MicButton";

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
  useEffect(() => { void load(); }, [storeId, kind]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
    await load();
  };

  const shown = items.filter((i) => !q || `${i.title} ${i.code} ${i.transcript}`.includes(q));

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
              <Button size="sm" variant="ghost" onClick={() => del(it)}>🗑️</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
