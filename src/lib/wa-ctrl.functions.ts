import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const toChat = (to: string) => (/@(lid|c\.us)$/.test(to) ? to : to.replace(/\D/g, ""));

/** Send a manual / approved reply (text or voice note) from the panel. */
export const waCtrlSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ instance: z.string().min(1).max(80), to: z.string().min(5).max(60), text: z.string().min(1).max(3000), voice: z.boolean().default(false), audio: z.string().max(8_000_000).optional() }).parse(d))
  .handler(async ({ data }) => {
    const { evoSend, fishTts, typingDelay } = await import("@/lib/autoreply.server");
    const number = toChat(data.to);
    // Same saved clip the merchant heard (no re-generation) when provided
    const saved = data.audio ? data.audio.replace(/^data:[^,]*,/, "") : "";
    // Real "recording…" / "typing…" on the customer's phone before sending
    await typingDelay(number, data.voice ? 3 : 2, data.instance, data.voice ? "recording" : "composing").catch(() => {});
    if (data.voice) await evoSend(`/message/sendWhatsAppAudio/${encodeURIComponent(data.instance)}`, { number, audio: saved || await fishTts(data.text), encoding: true, ptt: true });
    else await evoSend(`/message/sendText/${encodeURIComponent(data.instance)}`, { number, text: data.text });
    return { ok: true };
  });

/** Generate the voice note for preview only (same audio is then sent as-is). */
export const waVoicePreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ text: z.string().min(1).max(3000) }).parse(d))
  .handler(async ({ data }) => {
    const { fishTts } = await import("@/lib/autoreply.server");
    return { audio: `data:audio/mpeg;base64,${await fishTts(data.text)}` };
  });

const STYLES = {
  welcome: "ترحيب دافئ ولطيف بالعميل واهتمام بطلبه",
  story: "قصة قصيرة مشوقة عن تجربة عميل مع منتجاتنا",
  sales: "إقناع مهني بالمزايا والعرض مع دعوة واضحة للطلب",
} as const;

/** Draft an opening business message for a customer (optionally send it right away). */
export const waOutreach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ instance: z.string().max(80), to: z.string().max(60), goal: z.string().max(500), style: z.enum(["welcome", "story", "sales"]), prompt: z.string().max(4000).default(""), send: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const { aiReplyWith, evoSend } = await import("@/lib/autoreply.server");
    const ask = `اكتبي أول رسالة واتساب لعميل المتجر. الهدف: ${data.goal || "التعريف بالمتجر"}. الأسلوب: ${STYLES[data.style]}. رسالة قصيرة (2-3 جمل) باللهجة السعودية، بدون ذكر أنك ذكاء اصطناعي.`;
    const text = (await aiReplyWith(ask, "", { system_prompt: data.prompt || "أنتِ موظفة خدمة عملاء ومبيعات سعودية لبقة." })).trim();
    if (!text) throw new Error("ما قدرت أصيغ الرسالة، جرّب مرة ثانية");
    if (data.send) await evoSend(`/message/sendText/${encodeURIComponent(data.instance)}`, { number: toChat(data.to), text });
    return { text };
  });
