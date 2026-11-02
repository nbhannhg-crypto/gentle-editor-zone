import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

/** Merchant's store, or any store when the caller is the queen (admin). */
async function storeFor(ctx: Ctx, storeId?: string): Promise<string> {
  const { data: mine } = await ctx.supabase.from("stores").select("id").eq("owner_id", ctx.userId).limit(1).maybeSingle();
  if (storeId && storeId !== mine?.id) {
    const { data: q } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
    if (!q) throw new Error("ما تقدر تدير هذا المتجر");
    return storeId;
  }
  if (!mine) throw new Error("ما لقينا متجرك");
  return mine.id as string;
}

const sid = z.string().uuid().optional();

export const ttList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ storeId: sid }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { loadAccounts, publicView } = await import("./tiktok.server");
    const store = await storeFor(context as Ctx, data.storeId);
    return { accounts: (await loadAccounts(store)).map(publicView), ready: !!process.env["TIKTOK_CLIENT_KEY"] && !!process.env["TIKTOK_CLIENT_SECRET"] };
  });

export const ttLoginUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ storeId: sid, origin: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    const key = process.env["TIKTOK_CLIENT_KEY"];
    if (!key) throw new Error("ربط تيك توك غير مفعّل بعد — لازم مفاتيح تطبيق تيك توك");
    const store = await storeFor(context as Ctx, data.storeId);
    const { admin, ttStateKey } = await import("./tiktok.server");
    const state = crypto.randomUUID().replace(/-/g, "");
    const db = await admin();
    await db.from("training_rules").insert({ trigger_text: ttStateKey(state), response_text: JSON.stringify({ store, origin: data.origin, at: Date.now() }), category: "settings", store_id: store });
    const redirect = "https://gentle-editor-zone.lovable.app/api/public/tiktok/callback";
    const q = new URLSearchParams({ client_key: key, scope: "user.info.basic", response_type: "code", redirect_uri: redirect, state });
    return { url: `https://www.tiktok.com/v2/auth/authorize/?${q}` };
  });

export const ttSaveCtrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    storeId: sid, openId: z.string().min(1).max(200),
    ctrl: z.object({ enabled: z.boolean(), source: z.enum(["ai", "smart", "rules"]), delay: z.number().int().min(0).max(25) }).optional(),
    deleteAt: z.number().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { loadAccounts, saveAccounts } = await import("./tiktok.server");
    const store = await storeFor(context as Ctx, data.storeId);
    const list = await loadAccounts(store);
    const a = list.find((x) => x.open_id === data.openId);
    if (!a) throw new Error("الحساب غير موجود");
    if (data.ctrl) a.ctrl = data.ctrl;
    if (data.deleteAt !== undefined) a.log = (a.log ?? []).filter((m) => m.at !== data.deleteAt);
    await saveAccounts(store, list);
    return { ok: true };
  });

export const ttRemove = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ storeId: sid, openId: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { loadAccounts, saveAccounts } = await import("./tiktok.server");
    const store = await storeFor(context as Ctx, data.storeId);
    await saveAccounts(store, (await loadAccounts(store)).filter((x) => x.open_id !== data.openId));
    return { ok: true };
  });

/** Manual reply typed by the merchant — logged in the account inbox. */
export const ttManualReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ storeId: sid, openId: z.string().min(1).max(200), to: z.string().min(1).max(200), text: z.string().trim().min(1).max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { loadAccounts, saveAccounts, pushLog } = await import("./tiktok.server");
    const store = await storeFor(context as Ctx, data.storeId);
    const list = await loadAccounts(store);
    const a = list.find((x) => x.open_id === data.openId);
    if (!a) throw new Error("الحساب غير موجود");
    pushLog(a, { n: data.to, t: "", r: data.text, at: Date.now(), me: true });
    await saveAccounts(store, list);
    return { ok: true };
  });

/** Add an account by username directly (no TikTok OAuth needed). */
export const ttAddManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ storeId: sid, username: z.string().trim().min(2).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const { loadAccounts, saveAccounts } = await import("./tiktok.server");
    const { defaultTtCtrl } = await import("./tiktok-types");
    const store = await storeFor(context as Ctx, data.storeId);
    const u = data.username.replace(/^@/, "").replace(/[^\w.]/g, "");
    if (!u) throw new Error("اكتب يوزر صحيح");
    const id = `manual_${u.toLowerCase()}`;
    const list = await loadAccounts(store);
    if (list.some((a) => a.open_id === id)) throw new Error("الحساب مضاف من قبل");
    list.push({ open_id: id, name: `@${u}`, avatar: "", token: "", refresh: "", expires: 0, ctrl: defaultTtCtrl(), log: [], linked_at: Date.now() } as never);
    await saveAccounts(store, list);
    return { ok: true };
  });

/** Simulate a customer DM: the assigned staff replies with the same logic as real TikTok messages. */
export const ttTestMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ storeId: sid, openId: z.string().min(1).max(200), from: z.string().trim().min(1).max(60), text: z.string().trim().min(1).max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { loadAccounts, saveAccounts, pushLog, admin } = await import("./tiktok.server");
    const { staffContext, aiReplyWith, tidyReply, fixCut, bestRule } = await import("./autoreply.server");
    const store = await storeFor(context as Ctx, data.storeId);
    const list = await loadAccounts(store);
    const acc = list.find((x) => x.open_id === data.openId);
    if (!acc) throw new Error("الحساب غير موجود");
    const from = data.from.replace(/^@/, "");
    pushLog(acc, { n: from, t: data.text, at: Date.now() });
    const db = await admin();
    let reply = "";
    if (acc.ctrl?.source !== "ai") {
      const { data: rules } = await db.from("training_rules").select("id, trigger_text, response_text, use_count").eq("store_id", store).not("trigger_text", "like", "\\_\\_%").limit(1000);
      const hit = bestRule(data.text, (rules ?? []) as never);
      if (hit) reply = hit.rule.response_text;
    }
    if (!reply && acc.ctrl?.source !== "rules") {
      const ctx = await staffContext(db, store, `tt_${acc.open_id}`);
      const hist = (acc.log ?? []).filter((m) => m.n === from).slice(-6).map((m) => (m.me ? `أنتِ: ${m.r}` : `هو: ${m.t}`)).join("\n");
      reply = await aiReplyWith(data.text, `${ctx}\n\nآخر السالفة:\n${hist}`).catch(() => "");
    }
    reply = reply ? fixCut(tidyReply(reply, data.text)) : "";
    if (reply) pushLog(acc, { n: from, t: "", r: reply, at: Date.now() + 1, me: true });
    await saveAccounts(store, list);
    return { reply, log: acc.log ?? [] };
  });
