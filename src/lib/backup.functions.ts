import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Owner's independent backup database (public address; secret key lives in EXT_DB_SECRET). */
const EXT_URL = "https://uoeqwbmeikbbamfkoryd.supabase.co";
const EXT_BUCKET = "kingdom-files";

/** Every app table — add new tables here so they are included in backups. */
const TABLES = [
  "stores", "profiles", "user_roles", "wallets", "wallet_transactions", "pending_payments", "topup_requests", "profits_log",
  "training_rules", "reply_library", "brains", "brain_services", "merchant_brain_overrides", "merchant_brain_usage",
  "studio_voices", "studio_audio", "media_library", "factory_golden", "factory_notes", "factory_retrain", "factory_logs",
  "customers", "customer_messages", "channel_messages", "channels", "wa_autoreply", "wa_inbox",
  "products", "appointments", "complaints", "kingdom_pricing", "app_settings",
] as const;
const BUCKETS = ["media-library", "receipts", "studio-audio", "factory-audio"];

async function requireQueen(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId).eq("role", "admin").limit(1);
  if (!data?.length) throw new Error("هذي الصلاحية للملكة فقط");
}

async function readAll(db: any, table: string) {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select("*").range(from, from + 999);
    if (error) break;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function readUsers(admin: any) {
  const out: any[] = [];
  for (let page = 1; page < 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    out.push(...data.users.map((u: any) => ({ id: u.id, email: u.email, phone: u.phone, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at, user_metadata: u.user_metadata })));
    if (data.users.length < 1000) break;
  }
  return out;
}

const rowKey = (r: any) => String(r.id ?? r.msg_id ?? r.instance ?? r.key ?? r.store_id ?? JSON.stringify(r).slice(0, 200));
const hashOf = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + s.length.toString(36); };

async function loadAll(context: any) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const out: Record<string, any[]> = {};
  for (const t of TABLES) out[t] = await readAll(db, t);
  out["auth_users"] = await readUsers(db);
  return { db, out };
}

export const backupDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireQueen(context);
    const { out } = await loadAll(context);
    return { at: new Date().toISOString(), tables: out };
  });

export const backupToMyDb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireQueen(context);
    return runBackup();
  });

/** Core incremental backup — shared by the Queen's button and the scheduled job. */
export async function runBackup() {
    const context = {};
    const secret = process.env["EXT_DB_SECRET"];
    const empty = { counts: {} as Record<string, number>, sent: 0, skipped: 0, files: 0, filesLeft: 0 };
    if (!secret) return { ok: false, error: "مفتاح قاعدتك الخاصة غير محفوظ بعد", ...empty };
    const H = { apikey: secret, Authorization: `Bearer ${secret}` };
    const { db, out } = await loadAll(context);

    // Existing hashes in the owner's DB → send only new/changed rows.
    const known = new Map<string, string>();
    for (let from = 0; ; from += 1000) {
      const r = await fetch(`${EXT_URL}/rest/v1/kingdom_backup?select=table_name,row_id,hash`, { headers: { ...H, Range: `${from}-${from + 999}` } });
      if (!r.ok) {
        const txt = await r.text();
        console.error("backup read failed", r.status, txt);
        return { ok: false, error: r.status === 404 || /hash|store_id/.test(txt) ? "شغّل كود الإعداد الجديد في قاعدتك أولاً" : "تعذر الوصول لقاعدتك", ...empty };
      }
      const rows = (await r.json()) as any[];
      for (const x of rows) known.set(`${x.table_name}|${x.row_id}`, x.hash ?? "");
      if (rows.length < 1000) break;
    }

    const at = new Date().toISOString();
    const counts: Record<string, number> = {};
    let sent = 0, skipped = 0;
    for (const [t, rows] of Object.entries(out)) {
      counts[t] = rows.length;
      const changed = rows.map((r) => {
        const id = rowKey(r); const json = JSON.stringify(r); const hash = hashOf(json);
        if (known.get(`${t}|${id}`) === hash) { skipped++; return null; }
        return { table_name: t, row_id: id, store_id: r.store_id ?? (t === "stores" ? r.id : null), user_id: r.user_id ?? r.owner_id ?? (t === "profiles" || t === "auth_users" ? r.id : null), hash, data: r, backed_up_at: at };
      }).filter(Boolean) as any[];
      for (let i = 0; i < changed.length; i += 500) {
        const res = await fetch(`${EXT_URL}/rest/v1/kingdom_backup?on_conflict=table_name,row_id`, {
          method: "POST",
          headers: { ...H, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(changed.slice(i, i + 500)),
        });
        if (!res.ok) { console.error("backup failed", t, res.status, await res.text()); return { ok: false, error: `فشل النسخ عند ${t}`, counts, sent, skipped, files: 0, filesLeft: 0 }; }
        sent += Math.min(500, changed.length - i);
      }
    }

    // Files: copy storage objects not yet present in the owner's bucket (batched per click).
    await fetch(`${EXT_URL}/storage/v1/bucket`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ id: EXT_BUCKET, name: EXT_BUCKET, public: false }) }).catch(() => {});
    const doneFiles = new Set(Array.from(known.keys()).filter((k) => k.startsWith("file|")).map((k) => k.slice(5)));
    const pending: { bucket: string; path: string }[] = [];
    const walk = async (bucket: string, prefix: string, depth: number) => {
      for (let off = 0; ; off += 1000) {
        const { data } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset: off });
        if (!data?.length) break;
        for (const f of data) {
          const p = prefix ? `${prefix}/${f.name}` : f.name;
          if (!f.id) { if (depth < 5) await walk(bucket, p, depth + 1); }
          else if (!doneFiles.has(`${bucket}/${p}`)) pending.push({ bucket, path: p });
        }
        if (data.length < 1000) break;
      }
    };
    for (const b of BUCKETS) await walk(b, "", 0);
    let files = 0;
    const started = Date.now();
    for (const f of pending) {
      if (files >= 40 || Date.now() - started > 20000) break;
      const { data: blob } = await db.storage.from(f.bucket).download(f.path);
      if (!blob) continue;
      const key = `${f.bucket}/${f.path}`;
      const up = await fetch(`${EXT_URL}/storage/v1/object/${EXT_BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`, {
        method: "POST", headers: { ...H, "Content-Type": blob.type || "application/octet-stream", "x-upsert": "true" }, body: blob,
      });
      if (!up.ok) { console.error("file backup failed", key, up.status, await up.text()); continue; }
      await fetch(`${EXT_URL}/rest/v1/kingdom_backup?on_conflict=table_name,row_id`, {
        method: "POST", headers: { ...H, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify([{ table_name: "file", row_id: key, store_id: null, user_id: null, hash: "1", data: { bucket: f.bucket, path: f.path }, backed_up_at: at }]),
      });
      files++;
    }
    return { ok: true, error: "", counts, sent, skipped, files, filesLeft: pending.length - files };
}
