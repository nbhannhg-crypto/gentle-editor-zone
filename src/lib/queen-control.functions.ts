import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Queen (admin) only: verify role through the user's own client, then use the admin client. */
async function queen(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId).eq("role", "admin").limit(1);
  if (!data?.length) throw new Error("هذي الصلاحية للملكة فقط");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export const queenListBrains = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await queen(context);
    const [{ data: brains }, { data: stores }] = await Promise.all([
      db.from("brains").select("id, name, emoji, specialty, instructions, library_tag, in_mother, is_kingdom, store_id, created_at").order("created_at", { ascending: false }).limit(2000),
      db.from("stores").select("id, name"),
    ]);
    const counts: Record<string, number> = {};
    for (let from = 0; ; from += 1000) {
      const { data } = await db.from("reply_library").select("store_id, tag").range(from, from + 999);
      for (const r of data ?? []) counts[`${r.store_id}|${r.tag}`] = (counts[`${r.store_id}|${r.tag}`] ?? 0) + 1;
      if (!data || data.length < 1000) break;
    }
    const names = Object.fromEntries((stores ?? []).map((s: any) => [s.id, s.name]));
    return {
      brains: (brains ?? []).map((b: any) => ({ ...b, store_name: names[b.store_id] ?? "تاجر", replies: counts[`${b.store_id}|${b.library_tag || b.name}`] ?? 0 })),
      sections: Object.entries(counts).map(([k, n]) => { const [store_id, tag] = k.split("|"); return { store_id: store_id!, tag: tag!, store_name: names[store_id!] ?? "تاجر", count: n }; }),
    };
  });

export const queenUpdateBrain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(60), instructions: z.string().max(5000), library_tag: z.string().max(40), renameSection: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await queen(context);
    const { data: old } = await db.from("brains").select("store_id, library_tag, name").eq("id", data.id).single();
    if (!old) throw new Error("العقل غير موجود");
    const tag = data.library_tag.trim() || data.name.slice(0, 40);
    const oldTag = old.library_tag || old.name;
    if (data.renameSection && oldTag !== tag) await db.from("reply_library").update({ tag }).eq("store_id", old.store_id).eq("tag", oldTag);
    const { error } = await db.from("brains").update({ name: data.name, instructions: data.instructions, library_tag: tag }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const queenDeleteBrain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await queen(context);
    const { error } = await db.from("brains").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const queenReplies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ storeId: z.string().uuid(), tag: z.string().max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await queen(context);
    const out: { id: string; trigger_text: string; reply_text: string }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: rows } = await db.from("reply_library").select("id, trigger_text, reply_text").eq("store_id", data.storeId).eq("tag", data.tag).order("created_at").range(from, from + 999);
      out.push(...(rows ?? []));
      if (!rows || rows.length < 1000) break;
    }
    return out;
  });

export const queenSaveReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid().optional(), storeId: z.string().uuid(), tag: z.string().max(60), trigger_text: z.string().trim().min(1).max(500), reply_text: z.string().trim().min(1).max(2000), remove: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await queen(context);
    const res = data.remove && data.id
      ? await db.from("reply_library").delete().eq("id", data.id)
      : data.id
        ? await db.from("reply_library").update({ trigger_text: data.trigger_text, reply_text: data.reply_text }).eq("id", data.id)
        : await db.from("reply_library").insert({ store_id: data.storeId, tag: data.tag, trigger_text: data.trigger_text, reply_text: data.reply_text });
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });

/** Copy a merchant section into the queen's own store library (to publish it later). */
export const queenCopySection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ fromStore: z.string().uuid(), tag: z.string().max(60), toStore: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await queen(context);
    let n = 0;
    for (let from = 0; ; from += 1000) {
      const { data: rows } = await db.from("reply_library").select("trigger_text, reply_text").eq("store_id", data.fromStore).eq("tag", data.tag).range(from, from + 999);
      if (rows?.length) { await db.from("reply_library").insert(rows.map((r: any) => ({ ...r, store_id: data.toStore, tag: data.tag }))); n += rows.length; }
      if (!rows || rows.length < 1000) break;
    }
    return { copied: n };
  });
