import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BOTS, BUSINESS_TYPES } from "@/lib/bots";

export const botRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    bot: z.enum(["auto", ...BOTS.map((b) => b.id)] as [string, ...string[]]),
    order: z.string().trim().min(2).max(1500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: st } = await context.supabase.from("stores").select("id, name, business_type, bio").eq("owner_id", context.userId).limit(1).maybeSingle();
    if (!st) throw new Error("ما لقينا متجرك");
    const { error } = await context.supabase.rpc("spend_points", { _store: st.id, _amount: 2, _reason: "فريق البوتات" });
    if (error) throw new Error(error.message.includes("insufficient") ? "رصيدك ما يكفي — اشحن من المحفظة" : error.message);
    const { data: products } = await context.supabase.from("products").select("name, price").eq("store_id", st.id).limit(30);
    const bot = BOTS.find((b) => b.id === data.bot) ?? { name: "الملكة، قائدة فريق البوتات", job: "تفهمين أي طلب وتنفذينه بنفسك باختيار الخبرة المناسبة: بيع، متابعة، تسويق، منشورات، دعم، تصميم، تسعير، تدريب" };
    const type = BUSINESS_TYPES.find((t) => t[0] === st.business_type)?.[1] ?? "";
    const { aiText } = await import("@/lib/autoreply.server");
    const text = await aiText(
      `أنتِ ${bot.name}، ضمن فريق بوتات منصة "مملكة المبيعات". مهمتك: ${bot.job}. تخدمين بائعة سعودية. نفّذي الأمر مباشرة وبشكل عملي وجاهز للنسخ، باللهجة السعودية البيضاء، مع تنسيق واضح بنقاط قصيرة. لا تقولي إنك ذكاء اصطناعي.\nالمتجر: ${st.name} — ${type}. ${st.bio}\nالمنتجات: ${(products ?? []).map((p) => `${p.name} (${p.price} ريال)`).join("، ") || "غير مضافة"}`,
      data.order,
    );
    if (!text) throw new Error("ما وصل رد، جرّب مرة ثانية");
    return { text };
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    name: z.string().trim().min(1).max(80),
    business_type: z.enum(BUSINESS_TYPES.map((t) => t[0]) as [string, ...string[]]),
    bio: z.string().max(500),
    whatsapp: z.string().regex(/^\d{0,15}$/),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("stores").update(data).eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Public storefront: only safe columns of active stores
export const publicStore = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { personaKey, parsePersona } = await import("@/lib/persona");
    const { data: st } = await supabaseAdmin.from("stores").select("id, name, business_type, bio, whatsapp, active").eq("id", data.id).maybeSingle();
    if (!st || !st.active) return null;
    const { data: products } = await supabaseAdmin.from("products").select("id, name, price, description").eq("store_id", st.id).order("created_at").limit(100);
    const { data: pr } = await supabaseAdmin.from("training_rules").select("response_text").eq("trigger_text", personaKey(st.id)).limit(1).maybeSingle();
    const p = parsePersona(pr?.response_text);
    const sign = async (path: string) => {
      if (!path || !path.startsWith(`${st.id}/`)) return "";
      const { data: u } = await supabaseAdmin.storage.from("media-library").createSignedUrl(path, 60 * 60 * 24);
      return u?.signedUrl ?? "";
    };
    const [avatar, cover, welcome] = await Promise.all([sign(p.avatar), sign(p.cover), sign(p.welcome)]);
    return {
      id: st.id, name: st.name, business_type: st.business_type, bio: st.bio, whatsapp: st.whatsapp, products: products ?? [],
      persona: { companion: p.companion, tone: p.tone, theme: p.theme, status: p.status, avatar, cover, welcome },
    };
  });

// Public visit/click counter (no private data returned)
export const trackStore = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid(), kind: z.enum(["visit", "wa", "call", "voice"]) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { statsKey } = await import("@/lib/persona");
    const key = statsKey(data.id);
    const { data: row } = await supabaseAdmin.from("training_rules").select("id, response_text").eq("trigger_text", key).limit(1).maybeSingle();
    let s: Record<string, number> = {};
    try { s = JSON.parse(row?.response_text || "{}"); } catch { /* reset */ }
    s[data.kind] = (s[data.kind] ?? 0) + 1;
    if (row) await supabaseAdmin.from("training_rules").update({ response_text: JSON.stringify(s) }).eq("id", row.id);
    else await supabaseAdmin.from("training_rules").insert({ trigger_text: key, response_text: JSON.stringify(s), category: "settings", store_id: null });
    return { ok: true };
  });

// AI bio writer — free external keys only
export const personaBio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ name: z.string().max(80), companion: z.string().max(40), tone: z.string().max(20), words: z.string().max(400), banned: z.string().max(400), bio: z.string().max(500) }).parse(d))
  .handler(async ({ data }) => {
    const tone = { dala: "دلع ولطافة ورقة", salfa: "سوالف ووناسة وخفة دم", care: "اهتمام ودعم وفضفضة ودفء" }[data.tone] ?? "دلع ولطافة";
    const { aiText } = await import("@/lib/autoreply.server");
    try {
      const text = await aiText(
        `اكتبي نبذة بايو قصيرة جذابة (2-3 جمل، أقل من 300 حرف) باللهجة السعودية العامية بأسلوب ${tone}، مع إيموجي ناعمة. ${data.companion ? `اسم الرفيقة: ${data.companion}.` : ""} استخدمي بعض هذه الكلمات إن ناسبت: ${data.words}. ${data.banned ? `ممنوع هذه الكلمات: ${data.banned}.` : ""} أرجعي النبذة فقط بدون شرح.`,
        `اسم الصفحة: ${data.name}\nالنبذة الحالية: ${data.bio || "لا يوجد"}`, 500,
      );
      return { text: text.replace(/^["«]|["»]$/g, "").trim() };
    } catch { return { text: "", busy: true }; }
  });
