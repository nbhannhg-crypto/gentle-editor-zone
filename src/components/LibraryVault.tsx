import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const T = "training_rules";
const fmt = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(2)} جيجا` : b > 1e6 ? `${(b / 1e6).toFixed(1)} ميجا` : `${Math.round(b / 1e3)} كيلو`);

/** لوحة المساحة الحية */
export function StorageDashboard({ storeId, counts, trash, refreshKey }: { storeId?: string | undefined; counts: Record<string, number>; trash: number; refreshKey: number }) {
  const [bytes, setBytes] = useState<number | null>(null);
  const [rules, setRules] = useState(0);
  useEffect(() => {
    if (!storeId) return;
    void (async () => {
      let total = 0;
      for (let off = 0; off < 20000; off += 1000) {
        const { data } = await supabase.storage.from("media-library").list(storeId, { limit: 1000, offset: off });
        (data ?? []).forEach((f) => { total += Number((f.metadata as { size?: number } | null)?.size ?? 0); });
        if (!data || data.length < 1000) break;
      }
      setBytes(total);
      const { count } = await supabase.from(T).select("id", { count: "exact", head: true }).eq("store_id", storeId);
      setRules(count ?? 0);
    })().catch(() => {});
  }, [storeId, refreshKey]);
  const cap = 5e9;
  const pct = bytes == null ? 0 : Math.min(100, (bytes / cap) * 100);
  return (
    <div className="space-y-2 rounded-xl border bg-secondary/40 p-3">
      <div className="flex items-center justify-between text-sm"><b>💽 المساحة المستهلكة</b><span>{bytes == null ? "…" : `${fmt(bytes)} / 5 جيجا`}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
      <div className="grid grid-cols-5 gap-1 text-center text-xs">
        <span>🖼️ {counts["image"] ?? 0}</span><span>🎙️ {counts["audio"] ?? 0}</span><span>🎬 {counts["video"] ?? 0}</span><span>🧠 {rules}</span><span>🗑️ {trash}</span>
      </div>
    </div>
  );
}

type Backup = { manifest: { app: string; version: number; store_id: string; store_name: string; created_at: string }; stores: unknown[]; training_rules: Record<string, unknown>[]; customers: Record<string, unknown>[]; media_library: Record<string, unknown>[]; media_meta: Record<string, unknown>[]; wallets: unknown[] };

async function collect(storeId: string): Promise<Backup> {
  const [st, tr, mm, cu, ml, wa] = await Promise.all([
    supabase.from("stores").select("*").eq("id", storeId),
    supabase.from(T).select("*").eq("store_id", storeId).limit(100000),
    supabase.from(T).select("*").like("trigger_text", `ml_meta:${storeId}:%`).limit(20000),
    supabase.from("customers").select("*").eq("store_id", storeId).limit(50000),
    supabase.from("media_library").select("*").eq("store_id", storeId).limit(20000),
    supabase.from("wallets").select("*").eq("store_id", storeId),
  ]);
  const store = (st.data?.[0] ?? {}) as { name?: string };
  return {
    manifest: { app: "kingdom-library-backup", version: 1, store_id: storeId, store_name: store.name ?? "", created_at: new Date().toISOString() },
    stores: st.data ?? [], training_rules: tr.data ?? [], media_meta: mm.data ?? [], customers: cu.data ?? [], media_library: ml.data ?? [], wallets: wa.data ?? [],
  };
}

/** النسخ الاحتياطي ZIP + الاستعادة + رمز المزامنة مع الكمبيوتر */
export function BackupPanel({ storeId, onRestored }: { storeId?: string | undefined; onRestored: () => void }) {
  const [busy, setBusy] = useState("");
  const [pct, setPct] = useState<number | null>(null);
  const [withFiles, setWithFiles] = useState(false);
  const [pending, setPending] = useState<Backup | null>(null);
  const [token, setToken] = useState("");
  const tokKey = `sync_token:${storeId ?? ""}`;
  useEffect(() => {
    if (!storeId) return;
    void supabase.from(T).select("response_text").eq("trigger_text", tokKey).maybeSingle().then(({ data }) => setToken((data as { response_text?: string } | null)?.response_text ?? ""));
  }, [storeId, tokKey]);

  const exportZip = async () => {
    if (!storeId) return;
    setBusy("export"); setPct(0);
    try {
      const { default: JSZip } = await import("jszip");
      const b = await collect(storeId);
      const zip = new JSZip();
      zip.file("manifest.json", JSON.stringify(b.manifest, null, 2));
      zip.file("backup.json", JSON.stringify(b, null, 2));
      const paths = b.media_library.map((r) => String(r["path"]));
      const { data: urls } = paths.length ? await supabase.storage.from("media-library").createSignedUrls(paths, 7 * 24 * 3600) : { data: [] };
      zip.file("media/links.json", JSON.stringify(b.media_library.map((r, i) => ({ id: r["id"], title: r["title"], kind: r["kind"], path: r["path"], url: urls?.[i]?.signedUrl ?? null })), null, 2));
      if (withFiles) {
        for (let i = 0; i < paths.length; i++) {
          const { data } = await supabase.storage.from("media-library").download(paths[i]!);
          if (data) zip.file(`media/files/${paths[i]!.split("/").pop()}`, data);
          setPct(Math.round(((i + 1) / paths.length) * 90));
        }
      }
      const blob = await zip.generateAsync({ type: "blob" }, (m) => setPct(withFiles ? 90 + Math.round(m.percent / 10) : Math.round(m.percent)));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `backup-${b.manifest.store_name || "store"}-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast.success(`انحفظت النسخة ✅ (${b.training_rules.length} قاعدة، ${b.media_library.length} ملف، ${b.customers.length} عميل)`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(""); setPct(null); }
  };

  const readZip = async (f: File) => {
    try {
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(f);
      const raw = await zip.file("backup.json")?.async("string");
      if (!raw) throw new Error("الملف مو نسخة احتياطية من المكتبة");
      const b = JSON.parse(raw) as Backup;
      if (b.manifest?.app !== "kingdom-library-backup") throw new Error("الملف مو نسخة احتياطية صحيحة");
      if (b.manifest.store_id !== storeId && !confirm("هذي النسخة من متجر ثاني. تبي تستوردها لمتجرك الحالي؟")) return;
      setPending(b);
    } catch (e) { toast.error((e as Error).message || "الملف تالف"); }
  };

  const restore = async (mode: "merge" | "overwrite") => {
    if (!storeId || !pending) return;
    const b = pending; setBusy("restore"); setPct(0);
    let added = 0, updated = 0, skipped = 0;
    try {
      const total = b.training_rules.length + b.media_meta.length + b.customers.length + b.media_library.length || 1;
      let done = 0; const tick = () => setPct(Math.round((++done / total) * 100));
      // القواعد
      const { data: curR } = await supabase.from(T).select("id, trigger_text, response_text").eq("store_id", storeId).limit(100000);
      const rk = new Map((curR ?? []).map((r) => [r.trigger_text, r]));
      for (const r of b.training_rules) {
        const tt = String(r["trigger_text"] ?? ""), rt = String(r["response_text"] ?? "");
        const ex = rk.get(tt);
        if (ex) {
          if (mode === "overwrite" && ex.response_text !== rt) { await supabase.from(T).update({ response_text: rt, category: String(r["category"] ?? "general") }).eq("id", ex.id); updated++; } else skipped++;
        } else { const { error } = await supabase.from(T).insert({ store_id: storeId, trigger_text: tt, response_text: rt, category: String(r["category"] ?? "general") }); if (!error) added++; }
        tick();
      }
      // بيانات الوسائط الإضافية (الألبومات والوسوم)
      for (const r of b.media_meta) {
        const tt = String(r["trigger_text"] ?? "").replace(/^ml_meta:[^:]+:/, `ml_meta:${storeId}:`);
        const { data: ex } = await supabase.from(T).select("id").eq("trigger_text", tt).maybeSingle();
        if (ex && mode === "overwrite") { await supabase.from(T).update({ response_text: String(r["response_text"]) }).eq("id", (ex as { id: string }).id); updated++; }
        else if (!ex) { await supabase.from(T).insert({ trigger_text: tt, response_text: String(r["response_text"]), category: "settings", store_id: null } as never); added++; } else skipped++;
        tick();
      }
      // العملاء
      const { data: curC } = await supabase.from("customers").select("id, phone").eq("store_id", storeId).limit(50000);
      const ck = new Map((curC ?? []).map((c) => [c.phone, c.id]));
      for (const c of b.customers) {
        const phone = String(c["phone"] ?? "");
        const row = { name: String(c["name"] ?? ""), notes: String(c["notes"] ?? ""), channel: String(c["channel"] ?? ""), purchases: String(c["purchases"] ?? ""), rating: Number(c["rating"] ?? 0) };
        const id = ck.get(phone);
        if (id) { if (mode === "overwrite") { await supabase.from("customers").update(row).eq("id", id); updated++; } else skipped++; }
        else { const { error } = await supabase.from("customers").insert({ ...row, phone, store_id: storeId } as never); if (!error) added++; }
        tick();
      }
      // سجلات المكتبة (الملفات نفسها باقية بالسحابة)
      const { data: curM } = await supabase.from("media_library").select("id, path").eq("store_id", storeId).limit(20000);
      const mk = new Map((curM ?? []).map((m) => [m.path, m.id]));
      for (const m of b.media_library) {
        const path = String(m["path"] ?? "");
        const row = { title: String(m["title"] ?? ""), code: String(m["code"] ?? ""), transcript: String(m["transcript"] ?? "") };
        const id = mk.get(path);
        if (id) { if (mode === "overwrite") { await supabase.from("media_library").update(row).eq("id", id); updated++; } else skipped++; }
        else if (path.startsWith(`${storeId}/`)) {
          const { error } = await supabase.from("media_library").insert({ ...row, id: String(m["id"]), path, store_id: storeId, kind: String(m["kind"] ?? "audio"), mime: String(m["mime"] ?? "") });
          if (!error) added++; else skipped++;
        } else skipped++;
        tick();
      }
      toast.success(`تمت الاستعادة ✅ جديد ${added} · محدّث ${updated} · مكرر تجاهلناه ${skipped}`);
      setPending(null); onRestored();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(""); setPct(null); }
  };

  const newToken = async () => {
    if (!storeId) return;
    if (token && !confirm("بيتوقف الرمز القديم وأي برنامج يستخدمه. نكمل؟")) return;
    const t = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
    const { data } = await supabase.from(T).select("id").eq("trigger_text", tokKey).maybeSingle();
    const { error } = data
      ? await supabase.from(T).update({ response_text: t }).eq("id", (data as { id: string }).id)
      : await supabase.from(T).insert({ trigger_text: tokKey, response_text: t, category: "settings", store_id: null } as never);
    if (error) toast.error(error.message); else { setToken(t); toast.success("انصنع رمز مزامنة جديد 🔐"); }
  };
  const syncUrl = typeof window === "undefined" ? "" : `${window.location.origin}/api/public/sync`;
  const script = `# احفظه باسم sync.py وشغّله يومياً (Task Scheduler / cron)
import json, os, datetime, urllib.request
URL = "${syncUrl}"
TOKEN = "${token || "ضع_الرمز_هنا"}"
OUT = os.path.expanduser("~/store-backups")
os.makedirs(OUT, exist_ok=True)
req = urllib.request.Request(URL, headers={"Authorization": "Bearer " + TOKEN})
data = json.load(urllib.request.urlopen(req))
day = datetime.date.today().isoformat()
with open(os.path.join(OUT, f"backup-{day}.json"), "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
media = os.path.join(OUT, "media"); os.makedirs(media, exist_ok=True)
for m in data.get("media", []):
    p = os.path.join(media, m["path"].split("/")[-1])
    if m.get("url") and not os.path.exists(p):
        urllib.request.urlretrieve(m["url"], p)
print("تم ✅", len(data.get("media", [])), "ملف")
`;

  return (
    <div className="space-y-3 rounded-xl border border-dashed p-3">
      <b className="text-sm">🛡️ النسخ الاحتياطي والاستعادة</b>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!!busy} onClick={exportZip}>💾 تصدير نسخة كاملة (ZIP)</Button>
        <label className={`cursor-pointer rounded-md bg-secondary px-3 py-1.5 text-sm ${busy ? "pointer-events-none opacity-50" : ""}`}>
          📥 استعادة من ZIP
          <input type="file" hidden accept=".zip,application/zip" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void readZip(f); }} />
        </label>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={withFiles} onChange={(e) => setWithFiles(e.target.checked)} /> ضمّن الملفات نفسها (أبطأ وأكبر)</label>
      </div>
      {pct != null && (
        <div className="space-y-1">
          <p className="text-xs">{busy === "export" ? "جاري التصدير" : "جاري الاستعادة"}… {pct}%</p>
          <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
        </div>
      )}
      {pending && !busy && (
        <div className="space-y-2 rounded-lg bg-secondary/50 p-2 text-xs">
          <p>✅ النسخة سليمة — {pending.manifest.store_name} · {new Date(pending.manifest.created_at).toLocaleString("ar-SA")}</p>
          <p>🧠 {pending.training_rules.length} قاعدة · 📚 {pending.media_library.length} ملف · 👥 {pending.customers.length} عميل</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void restore("merge")}>🔀 دمج ذكي (يضيف الناقص بس)</Button>
            <Button size="sm" variant="secondary" onClick={() => { if (confirm("بنحدّث الموجود بقيم النسخة. ما بنحذف شي. نكمل؟")) void restore("overwrite"); }}>♻️ تحديث الكل</Button>
            <Button size="sm" variant="ghost" onClick={() => setPending(null)}>إلغاء</Button>
          </div>
          <p className="text-muted-foreground">ما نحذف أي شي، والرصيد ما يتغير من النسخة.</p>
        </div>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer font-semibold">🖥️ مزامنة تلقائية مع الكمبيوتر</summary>
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={newToken}>{token ? "🔄 جدّد الرمز السري" : "🔐 أنشئ رمز سري"}</Button>
            {token && <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard.writeText(token); toast.success("انسخ الرمز"); }}>📋 انسخ الرمز</Button>}
            <Button size="sm" variant="secondary" disabled={!token} onClick={() => { void navigator.clipboard.writeText(script); toast.success("انسخ الكود ✅"); }}>📋 انسخ كود المزامنة</Button>
          </div>
          <p className="text-muted-foreground">شغّل الكود على كمبيوترك (يحتاج Python) وحطه بالجدولة اليومية، ويسحب نسخة كل يوم لمجلد store-backups. لا تعطي الرمز لأحد.</p>
        </div>
      </details>
    </div>
  );
}
