import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Transcribes a stored audio/video item (Saudi Arabic) and saves the text on it. */
export const transcribeMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: row } = await sb.from("media_library").select("id, path, mime").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("الملف غير موجود");
    const { data: file, error } = await sb.storage.from("media-library").download(row.path);
    if (error || !file) throw new Error("تعذر قراءة الملف");
    const { geminiMedia } = await import("./ai-keys.server");
    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const out = await geminiMedia("فرّغ هذا المقطع الصوتي حرفياً بالعربية (لهجة سعودية). اكتب النص فقط.", row.mime || "audio/webm", b64);
    if (!out) throw new Error("المفاتيح المجانية مشغولة الحين، انتظر دقيقة وجرّب مرة ثانية");
    const j = { text: out };
    const text = String(j.text ?? "").slice(0, 10000);
    await sb.from("media_library").update({ transcript: text }).eq("id", row.id);
    return { text };
  });
