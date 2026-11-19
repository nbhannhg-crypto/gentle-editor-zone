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

/** 📩 Public: after the web form is submitted, send the order number to the client's WhatsApp. */
export const sendMarriageConfirm = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ storeId: z.string().uuid(), code: z.string().trim().min(1).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: f } = await supabaseAdmin.from("marriage_forms").select("data, created_at").eq("store_id", data.storeId).eq("code", data.code).maybeSingle();
    if (!f || Date.now() - new Date(f.created_at as string).getTime() > 10 * 60 * 1000) return { ok: false };
    let phone = String((f.data as Record<string, string>)?.["phone"] ?? "").replace(/\D/g, "");
    if (phone.startsWith("00")) phone = phone.slice(2);
    if (phone.startsWith("05")) phone = "966" + phone.slice(1); else if (phone.startsWith("5") && phone.length === 9) phone = "966" + phone;
    if (phone.length < 8) return { ok: false };
    const { data: ws } = await supabaseAdmin.from("marriage_wa_settings").select("instance").eq("store_id", data.storeId).maybeSingle();
    let instance = (ws as { instance?: string } | null)?.instance || "";
    if (!instance) { const { data: a } = await supabaseAdmin.from("wa_autoreply").select("instance").eq("store_id", data.storeId).limit(1).maybeSingle(); instance = (a as { instance?: string } | null)?.instance || ""; }
    if (!instance) return { ok: false };
    const text = `يا هلا ومسهلا فيك مع خطابة أم ندى 🤍\nتم استلام وقبول طلبك بنجاح 💍\nرقم طلبك للمتابعة: *${data.code}*\nاحتفظ فيه، وبنتواصل معك بسرية تامة أول ما يتوفر التوافق المناسب بإذن الله 🌷`;
    try { const { evoSend } = await import("@/lib/autoreply.server"); await evoSend(`/message/sendText/${encodeURIComponent(instance)}`, { number: phone, text }); return { ok: true }; } catch { return { ok: false }; }
  });

/** 💌 Owner presses «💬 واتساب» on an order → polished approval message is sent to the client + any half-finished WA session is closed. */
export const sendMarriageApproved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: f } = await context.supabase.from("marriage_forms").select("store_id, code, data").eq("id", data.id).maybeSingle();
    if (!f) throw new Error("غير مسموح");
    const d = (f.data ?? {}) as Record<string, string>;
    let phone = String(d["phone"] ?? "").replace(/\D/g, "");
    if (phone.startsWith("00")) phone = phone.slice(2);
    if (phone.startsWith("05")) phone = "966" + phone.slice(1); else if (phone.startsWith("5") && phone.length === 9) phone = "966" + phone;
    const name = String(d["name"] ?? "").trim().split(/\s+/)[0] ?? "";
    const text = `يا هلا ومسهلا فيك${name ? ` يا ${name}` : ""} مع خطابة أم ندى 🤍\n\nيسعدني أبلغك إنه تم اعتماد وتسجيل طلبك بنجاح 💍\nرقم طلبك للمتابعة: *${f.code}*\n\n🔒 بياناتك أمانة في سرية تامة ولا تُنشر.\nأنا أتابع طلبك بنفسي، وبنتواصل معك أول ما يتوفر التوافق المناسب بالحلال إن شاء الله 🌷\n\nالله يكتب لك الخير والستر والتوفيق 🤲`;
    if (phone.length < 8) return { ok: false, phone: "", text };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // close any half-finished WA registration for this number so the bot never re-asks
    await supabaseAdmin.from("marriage_wa_sessions").update({ done: true, updated_at: new Date().toISOString() }).eq("store_id", f.store_id).eq("phone", phone);
    const { data: ws } = await supabaseAdmin.from("marriage_wa_settings").select("instance").eq("store_id", f.store_id).maybeSingle();
    let instance = (ws as { instance?: string } | null)?.instance || "";
    if (!instance) { const { data: a } = await supabaseAdmin.from("wa_autoreply").select("instance").eq("store_id", f.store_id).limit(1).maybeSingle(); instance = (a as { instance?: string } | null)?.instance || ""; }
    if (!instance) return { ok: false, phone, text };
    try { const { evoSend } = await import("@/lib/autoreply.server"); await evoSend(`/message/sendText/${encodeURIComponent(instance)}`, { number: phone, text }); return { ok: true, phone, text }; } catch { return { ok: false, phone, text }; }
  });

/** ✏️ Owner controls one WhatsApp registration session: edit answers, skip, resend question, custom message, finish. */
export const manageMarriageSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    storeId: z.string().uuid(),
    sessionId: z.string().uuid(),
    action: z.enum(["save", "skip", "send_question", "send_text", "finish"]),
    data: z.record(z.string(), z.string().max(1000)).optional(),
    step: z.number().int().min(0).max(100).optional(),
    gender: z.enum(["male", "female"]).optional(),
    text: z.string().trim().max(2000).optional(),
  }).parse(d))
  .handler(async ({ data: d, context }) => {
    const { data: st } = await context.supabase.from("stores").select("id").eq("id", d.storeId).maybeSingle();
    if (!st) throw new Error("غير مسموح");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: s } = await supabaseAdmin.from("marriage_wa_sessions").select("*").eq("id", d.sessionId).eq("store_id", d.storeId).maybeSingle();
    if (!s) throw new Error("الجلسة غير موجودة");
    const { WA_STEPS, askText } = await import("@/lib/marriage-wa.server");
    const { data: cfg } = await supabaseAdmin.from("marriage_wa_settings").select("*").eq("store_id", d.storeId).maybeSingle();
    const sess = s as { instance: string; phone: string; step: number; gender: string; data: Record<string, string> };
    const merged: Record<string, string> = { ...(sess.data ?? {}), ...(d.data ?? {}) };
    let step = d.step ?? sess.step;
    if (d.gender) sess.gender = d.gender;
    const send = async (text: string) => {
      const { evoSend } = await import("@/lib/autoreply.server");
      await evoSend(`/message/sendText/${encodeURIComponent(sess.instance)}`, { number: sess.phone, text });
    };
    const answered = () => WA_STEPS.filter((x) => (x.k === "gender" ? !!sess.gender : !!merged[x.k])).length;
    const upd = async (extra: Record<string, unknown> = {}) => supabaseAdmin.from("marriage_wa_sessions").update({ data: merged, step, updated_at: new Date().toISOString(), ...(d.gender ? { gender: d.gender } : {}), ...extra } as never).eq("id", d.sessionId);

    if (d.action === "skip") {
      const k = WA_STEPS[step]?.k; if (k && k !== "gender" && !(k in merged)) merged[k] = "";
      step = Math.min(step + 1, WA_STEPS.length - 1);
      await upd();
      const q = askText(WA_STEPS[step]!, cfg as never, false, answered());
      await send(q).catch(() => { throw new Error("انحفظ، لكن تعذر الإرسال بالواتساب"); });
      return { ok: true, step, sent: q };
    }
    if (d.action === "send_question") {
      await upd();
      const q = askText(WA_STEPS[Math.min(step, WA_STEPS.length - 1)]!, cfg as never, false, answered());
      await send(q).catch(() => { throw new Error("تعذر الإرسال بالواتساب"); });
      return { ok: true, step, sent: q };
    }
    if (d.action === "send_text") {
      if (!d.text) throw new Error("اكتب الرسالة");
      await upd();
      await send(d.text).catch(() => { throw new Error("تعذر الإرسال بالواتساب"); });
      return { ok: true, step, sent: d.text };
    }
    if (d.action === "finish") {
      const out: Record<string, string> = { ...merged };
      if (!out["platform"]) out["platform"] = "واتساب";
      if (!out["phone"] || out["phone"].replace(/\D/g, "").length < 8) out["phone"] = sess.phone;
      out["waPhone"] = sess.phone; out["source"] = "تسجيل واتساب تفاعلي";
      for (const k of Object.keys(out)) if (out[k] === "" || k.startsWith("_x_")) delete out[k];
      const { data: code } = await supabaseAdmin.rpc("submit_marriage_form", { _store: d.storeId, _gender: sess.gender || "male", _data: out } as never);
      step = WA_STEPS.length;
      await upd({ done: true });
      const msg = `تم تسجيل طلبك بنجاح 💍\nرقم طلبك: *${code ?? "—"}*\nاحتفظ فيه، وبنتواصل معك أول ما يتوفر توافق مناسب بإذن الله 🤍`;
      let sent = true; await send(msg).catch(() => { sent = false; });
      return { ok: true, step, code: String(code ?? ""), sent: sent ? msg : "" };
    }
    await upd();
    return { ok: true, step };
  });

/** ✨ AI-generated sample marriage form with realistic Saudi specs (external AI keys only). */
export const generateMarriageForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ gender: z.enum(["male", "female"]), hint: z.string().trim().max(500).optional() }).parse(d))
  .handler(async ({ data }) => {
    const { aiText } = await import("@/lib/autoreply.server");
    const skip = new Set(["phone", "phone2", "handle", "name", "district", "tribe"]);
    const keys = M_ALL.filter((f) => !skip.has(f.k)).map((f) => `"${f.k}": ${f.l}${f.opts ? ` (اختر من: ${f.opts.join("، ")})` : ""}`).join("\n");
    const who = data.gender === "female" ? "عروس سعودية" : "عريس سعودي";
    const sys = `أنت تعبئ استمارة زواج نموذجية لـ${who} بمواصفات سعودية واقعية ومتناسقة (مدن المملكة، وظائف ومؤهلات شائعة، طول ووزن منطقيين، نبذة راقية محترمة بلهجة سعودية خفيفة، مواصفات شريك وشروط مناسبة). نوّع في كل مرة ولا تكرر. لا تكتب أسماء أشخاص ولا أرقام جوال ولا يوزرات. الجنسية سعودي/سعودية.
أرجع JSON فقط بدون شرح وبدون علامات كود: {"fields":{...}} بالمفاتيح:\n${keys}`;
    const seed = `${data.hint ? `مواصفات مطلوبة: ${data.hint}\n` : ""}رقم عشوائي للتنويع: ${Math.floor(Math.random() * 1e6)}`;
    const out = await aiText(sys, seed).catch(() => "");
    if (!out) return { error: "المفاتيح المجانية مشغولة الحين، جرّب بعد شوي", fields: {} as Record<string, string> };
    try {
      const j = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) as { fields?: Record<string, unknown> };
      const allowed = new Set(M_ALL.map((f) => f.k).filter((k) => !skip.has(k)));
      const fields: Record<string, string> = {};
      for (const [k, v] of Object.entries(j.fields ?? {})) if (allowed.has(k) && v != null && String(v).trim()) fields[k] = String(v).trim().slice(0, 1000);
      return { error: "", fields };
    } catch {
      return { error: "ما ضبط التوليد، جرّب مرة ثانية", fields: {} as Record<string, string> };
    }
  });
