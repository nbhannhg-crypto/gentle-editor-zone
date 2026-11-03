import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Owner's independent backup database (public address; secret key lives in EXT_DB_SECRET). */
const EXT_URL = "https://uoeqwbmeikbbamfkoryd.supabase.co";

const TABLES = [
  "stores", "training_rules", "reply_library", "brains", "studio_voices", "studio_audio", "media_library",
  "customers", "channel_messages", "channels", "products", "appointments", "wa_autoreply", "app_settings",
  "brain_services", "kingdom_pricing", "factory_golden", "factory_notes", "factory_retrain", "complaints",
  "wallets", "wallet_transactions", "profiles", "user_roles",
] as const;

async function queenDb(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId).eq("role", "admin").limit(1);
  if (!data?.length) throw new Error("هذي الصلاحية للملكة فقط");
  return ctx.supabase as any;
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

const rowKey = (table: string, r: any) => String(r.id ?? r.key ?? r.store_id ?? r.instance ?? r.msg_id ?? JSON.stringify(r).slice(0, 200)) + (table === "wa_autoreply" ? "" : "");

export const backupDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await queenDb(context);
    const out: Record<string, any[]> = {};
    for (const t of TABLES) out[t] = await readAll(db, t);
    return { at: new Date().toISOString(), tables: out };
  });

export const backupToMyDb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await queenDb(context);
    const secret = process.env["EXT_DB_SECRET"];
    if (!secret) return { ok: false, error: "مفتاح قاعدتك الخاصة غير محفوظ بعد", counts: {} as Record<string, number> };
    const counts: Record<string, number> = {};
    const at = new Date().toISOString();
    for (const t of TABLES) {
      const rows = await readAll(db, t);
      counts[t] = rows.length;
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500).map((r) => ({ table_name: t, row_id: rowKey(t, r), data: r, backed_up_at: at }));
        const res = await fetch(`${EXT_URL}/rest/v1/kingdom_backup?on_conflict=table_name,row_id`, {
          method: "POST",
          headers: { apikey: secret, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(batch),
        });
        if (!res.ok) {
          const txt = await res.text();
          console.error("backup failed", t, res.status, txt);
          return { ok: false, error: res.status === 404 ? "جدول النسخ غير موجود في قاعدتك — شغّل كود الإعداد أولاً" : `فشل النسخ عند ${t}`, counts };
        }
      }
    }
    return { ok: true, error: "", counts };
  });
