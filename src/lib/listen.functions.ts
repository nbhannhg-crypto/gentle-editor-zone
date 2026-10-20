import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Live-call speech-to-text via free Gemini keys (no platform credits). */
export const transcribeLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ audio: z.string().min(10).max(12_000_000), mime: z.string().max(60) }).parse(d))
  .handler(async ({ data }) => {
    const { geminiMedia } = await import("./ai-keys.server");
    const out = await geminiMedia(
      "فرّغ كلام المتحدث في هذا التسجيل حرفياً بالعربية كما قيل (أي لهجة: سعودية، يمنية، خليجية). اكتب النص فقط بدون أي تعليق. إذا لم يوجد كلام واضح أو كان صمتاً/ضجيجاً فقط اكتب: -",
      data.mime || "audio/webm",
      data.audio,
    );
    const text = out.trim();
    if (!text || text === "-" || text.length < 2) return { text: "", busy: !out };
    return { text: text.slice(0, 2000), busy: false };
  });
