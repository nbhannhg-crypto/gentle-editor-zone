import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { backupDownload, backupToMyDb } from "@/lib/backup.functions";

const SETUP_SQL = `create table if not exists public.kingdom_backup (
  table_name text not null,
  row_id text not null,
  data jsonb not null,
  backed_up_at timestamptz not null default now(),
  primary key (table_name, row_id)
);
alter table public.kingdom_backup add column if not exists store_id text;
alter table public.kingdom_backup add column if not exists user_id text;
alter table public.kingdom_backup add column if not exists hash text;
create index if not exists kingdom_backup_store on public.kingdom_backup(store_id);
alter table public.kingdom_backup enable row level security;
grant all on public.kingdom_backup to service_role;`;

export function BackupPanel() {
  const push = useServerFn(backupToMyDb);
  const dl = useServerFn(backupDownload);
  const [busy, setBusy] = useState<"" | "push" | "dl">("");
  const [last, setLast] = useState<{ at: string; total: number } | null>(null);
  const [showSql, setShowSql] = useState(false);

  const doPush = async () => {
    setBusy("push");
    try {
      const r = await push();
      const total = Object.values(r.counts).reduce((a, b) => a + b, 0);
      if (r.ok) {
        setLast({ at: new Date().toLocaleString("ar-SA"), total });
        toast.success(`✅ جديد/معدّل: ${r.sent} — موجود من قبل: ${r.skipped} — ملفات: ${r.files}${r.filesLeft > 0 ? ` (باقي ${r.filesLeft} ملف، اضغط مرة ثانية)` : ""}`, { duration: 9000 });
      }
      else toast.error(r.error);
    } catch (e: any) { toast.error(e?.message ?? "تعذر النسخ"); }
    setBusy("");
  };

  const doDl = async () => {
    setBusy("dl");
    try {
      const r = await dl();
      const blob = new Blob([JSON.stringify(r)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `kingdom-backup-${r.at.slice(0, 10)}.json`;
      a.click();
      toast.success("نزلت النسخة لجهازك ✅");
    } catch (e: any) { toast.error(e?.message ?? "تعذر التحميل"); }
    setBusy("");
  };

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-soft space-y-3">
      <h2 className="font-display text-lg text-primary">🛡️ النسخ الاحتياطي لبياناتك</h2>
      <p className="text-sm text-muted-foreground">انسخ القواعد والأصوات والمحادثات والإعدادات لقاعدتك الخاصة، أو نزّلها ملف لجوالك.</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={doPush} disabled={!!busy}>{busy === "push" ? "ينسخ…" : "☁️ نسخ فوري لقاعدتي الخاصة"}</Button>
        <Button variant="outline" onClick={doDl} disabled={!!busy}>{busy === "dl" ? "يجهز…" : "📥 تحميل نسخة لجهازي"}</Button>
        <Button variant="ghost" onClick={() => setShowSql(!showSql)}>{showSql ? "إخفاء كود الإعداد" : "🧩 كود إعداد قاعدتي"}</Button>
      </div>
      {last && <p className="text-xs text-muted-foreground">آخر نسخة: {last.at} — {last.total} سجل</p>}
      {showSql && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">انسخه والصقه مرة وحدة في SQL Editor بقاعدتك واضغط Run.</p>
          <pre dir="ltr" className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">{SETUP_SQL}</pre>
          <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(SETUP_SQL); toast.success("انسخ ✅"); }}>نسخ الكود</Button>
        </div>
      )}
    </section>
  );
}
