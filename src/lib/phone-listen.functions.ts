import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const transcribePhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(input => z.object({ audio: z.string().min(10).max(4_000_000), mime: z.enum(["audio/webm", "audio/mp4", "audio/ogg"]) }).parse(input))
  .handler(async ({ data }) => {
    const { geminiMedia } = await import("./ai-keys.server");
    const text = (await geminiMedia("فرّغ كلام المتحدث حرفياً باللهجة العربية التي نطقها. حافظ على النفي والأسماء والأرقام. لا تضف ولا تخمّن ولا ترد على الكلام. إذا كان صمتاً أو ضجيجاً فقط اكتب - . أخرج النص وحده.", data.mime, data.audio, { temperature: 0 })).trim();
    if (!text) throw new Error("خدمة فهم الكلام مشغولة، جرّب بعد شوي");
    return { text: text === "-" ? "" : text.slice(0, 600) };
  });