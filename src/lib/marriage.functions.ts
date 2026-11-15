import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { M_ALL, M_SOURCE } from "@/lib/marriage";

/** Turns a messy pasted chat message into marriage-form fields (external AI keys only). */
export const parseMarriageText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ text: z.string().trim().min(5).max(8000) }).parse(d))
  .handler(async ({ data }) => {
    const { aiText } = await import("@/lib/autoreply.server");
    const keys = [...M_ALL, ...M_SOURCE].filter((f) => f.k !== "phone2").map((f) => `"${f.k}": ${f.l}`).join("\n");
    const sys = `استخرج بيانات استمارة زواج من نص محادثة عشوائي. أرجع JSON فقط بدون شرح وبدون علامات كود، بالشكل:
{"gender":"male" أو "female","fields":{...}}
المفاتيح المسموحة داخل fields:\n${keys}
قواعد: لا تخترع أي معلومة غير موجودة في النص؛ اترك المفتاح غير مذكور. الجوال أرقام فقط مع مفتاح الدولة إن وجد. استنتج gender من سياق النص (عريس/عروس، صيغة المتكلم). إذا ذُكر اسم خطابة/وسيطة أو حساب أو منصة جاء منها العميل ضعها في broker/brokerHandle/brokerPlatform/brokerPhone/via.`;
    const out = await aiText(sys, data.text).catch(() => "");
    if (!out) return { error: "المفاتيح المجانية مشغولة الحين، جرّب بعد شوي", gender: "male", fields: {} as Record<string, string> };
    try {
      const j = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) as { gender?: string; fields?: Record<string, unknown> };
      const allowed = new Set([...M_ALL, ...M_SOURCE].map((f) => f.k));
      const fields: Record<string, string> = {};
      for (const [k, v] of Object.entries(j.fields ?? {})) if (allowed.has(k) && v != null && String(v).trim()) fields[k] = String(v).trim().slice(0, 1000);
      return { error: "", gender: j.gender === "female" ? "female" : "male", fields };
    } catch {
      return { error: "ما قدرت أفهم النص، جرّب تلصقه كامل", gender: "male", fields: {} as Record<string, string> };
    }
  });

/** 🧪 Simulator: owner chats with the WhatsApp registration bot without a real number. */
export const simulateMarriageWa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ storeId: z.string().uuid(), text: z.string().trim().min(1).max(2000), reset: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: st } = await context.supabase.from("stores").select("id").eq("id", data.storeId).maybeSingle();
    if (!st) throw new Error("غير مسموح");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const phone = "sim" + context.userId.replace(/\D/g, "").slice(0, 12);
    if (data.reset) await supabaseAdmin.from("marriage_wa_sessions").delete().eq("instance", "__sim__").eq("phone", phone);
    const { handleMarriageWa } = await import("@/lib/marriage-wa.server");
    const reply = await handleMarriageWa(supabaseAdmin, "__sim__", phone, data.text, { storeId: data.storeId });
    return { reply: reply ?? "(النظام ما يرد إلا إذا بدأ العميل بكلمة «تسجيل» أو «خطابة» أو «استمارة»)" };
  });

/** Question list for the settings panel (default texts + choices). */
export const marriageWaSteps = createServerFn({ method: "GET" }).handler(async () => {
  const { WA_STEPS } = await import("@/lib/marriage-wa.server");
  return WA_STEPS.map((s) => ({ k: s.k, q: s.q, opts: s.opts ?? [] }));
});

/** 🚀 Owner presses «ابدأ التسجيل معه» → first question is sent to that number on WhatsApp. */
export const startMarriageWaManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ storeId: z.string().uuid(), instance: z.string().trim().min(1).max(200), phone: z.string().trim().min(6).max(30) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: st } = await context.supabase.from("stores").select("id").eq("id", data.storeId).maybeSingle();
    if (!st) throw new Error("غير مسموح");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { findStore, startMarriageWa } = await import("@/lib/marriage-wa.server");
    if ((await findStore(supabaseAdmin, data.instance)) !== data.storeId) throw new Error("هذا الرقم مو تابع لمتجرك");
    let phone = data.phone.replace(/\D/g, "");
    if (phone.startsWith("00")) phone = phone.slice(2);
    if (phone.startsWith("05")) phone = "966" + phone.slice(1);
    else if (phone.startsWith("5") && phone.length === 9) phone = "966" + phone;
    const text = await startMarriageWa(supabaseAdmin, data.instance, phone, data.storeId);
    const { evoSend } = await import("@/lib/autoreply.server");
    await evoSend(`/message/sendText/${encodeURIComponent(data.instance)}`, { number: phone, text });
    return { ok: true, phone };
  });
