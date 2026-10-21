import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Live-call speech-to-text via free Gemini keys (no platform credits). */
export const transcribeLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ audio: z.string().min(10).max(12_000_000), mime: z.string().max(60), vocab: z.array(z.string().max(80)).max(150).optional() }).parse(d))
  .handler(async ({ data }) => {
    const { geminiMedia } = await import("./ai-keys.server");
    const vocab = (data.vocab ?? []).filter(Boolean).join("، ");
    const out = await geminiMedia(
      "فرّغ كلام المتحدث في هذا التسجيل حرفياً بالعربية كما قيل. المتحدث زبون متجر سعودي يتكلم باللهجة السعودية/الخليجية العامية (مثل: وش، ابغى، كم سعره، فيه توصيل، الحين، زين، طيب). لا تحوّل الكلام للفصحى ولا تخمّن كلمات غير منطوقة." +
        (vocab ? `\nمصطلحات المتجر المتوقعة — إذا سمعت كلمة قريبة منها نطقاً فاكتبها بهذا الشكل بالضبط: ${vocab}` : "") +
        "\nسياق المحادثة: محادثة صوتية ودية وسوالف وسواليف حب وتعارف باللهجة السعودية والخليجية العامية، نبرة عفوية ومشاعر واهتمام، الكلمات والعبارات الشائعة: هلا والله، أرحب، يا بعد قلبي، فديتك، فديت روحك، لبى، وش مسوي، وش علومك، كيفك، وش فيك، يا عيوني، يا روحي، اشتقت لك، يسعد مساك، صباح الورد، مساء الخير، منور، يا زينك، سولف معي، لا خلا ولا عدم، تكفى، أبشر، تسلم، يالغالي، تسلم لي، يا قلبي، على راسي، من عيوني، طيب، تمام، أكلمك. اكتب الكلمات القصيرة جداً (هلا، تم، لبى، إي) ولا تضيّع أي حرف." +
        "\nاكتب النص فقط بدون أي تعليق. إذا لم يوجد كلام واضح أو كان صمتاً/ضجيجاً فقط اكتب: -",
      data.mime || "audio/webm",
      data.audio,
      { temperature: 0.2 },
    );
    const text = out.trim();
    if (!text || text === "-" || text.length < 2) return { text: "", busy: !out };
    return { text: text.slice(0, 2000), busy: false };
  });
