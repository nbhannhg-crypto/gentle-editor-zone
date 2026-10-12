import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const toChat = (to: string) => (/@(lid|c\.us)$/.test(to) ? to : to.replace(/\D/g, ""));

/** Send a manual / approved reply (text or voice note) from the panel. */
export const waCtrlSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ instance: z.string().min(1).max(80), to: z.string().min(5).max(60), text: z.string().min(1).max(3000), voice: z.boolean().default(false) }).parse(d))
  .handler(async ({ data }) => {
    const { evoSend, fishTts } = await import("@/lib/autoreply.server");
    const number = toChat(data.to);
    if (data.voice) await evoSend(`/message/sendWhatsAppAudio/${encodeURIComponent(data.instance)}`, { number, audio: await fishTts(data.text), encoding: true, ptt: true });
    else await evoSend(`/message/sendText/${encodeURIComponent(data.instance)}`, { number, text: data.text });
    return { ok: true };
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
