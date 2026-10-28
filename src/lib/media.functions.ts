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
    let out = "";
    const { groqTranscribe } = await import("./ai-keys.server");
    {
      try {
        const mime = row.mime || "audio/webm";
        const ext = (mime.split("/")[1] || "webm").split(";")[0];
        const fd = new FormData();
        fd.append("file", new Blob([await file.arrayBuffer()], { type: mime }), `audio.${ext}`);
        fd.append("model", "whisper-large-v3");
        fd.append("language", "ar");
        fd.append("temperature", "0");
        fd.append("response_format", "json");
        const r = await groqTranscribe(fd, 30000);
        if (!r) throw new Error("no groq keys");
        if (r.ok) out = String(((await r.json()) as { text?: string }).text ?? "").trim();
        else console.error("groq media stt", r.status, (await r.text()).slice(0, 200));
      } catch (e) { console.error("groq media stt error", e); }
    }
    if (!out) {
      const { geminiMedia } = await import("./ai-keys.server");
      const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      out = (await geminiMedia("فرّغ هذا المقطع الصوتي حرفياً بالعربية (لهجة سعودية). اكتب النص فقط.", row.mime || "audio/webm", b64)) || "";
    }
    if (!out) throw new Error("ما قدرت أحوّل الصوت الحين، جرّب مرة ثانية بعد دقيقة");
    const j = { text: out };
    const text = String(j.text ?? "").slice(0, 10000);
    await sb.from("media_library").update({ transcript: text }).eq("id", row.id);
    return { text };
  });

/** Transcribes a clone sample (data URL) to Saudi Arabic text via Groq Whisper. Additive. */
export const transcribeSample = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ audio: z.string().max(40_000_000) }).parse(d))
  .handler(async ({ data }) => {
    const { groqTranscribe } = await import("./ai-keys.server");
    const m = data.audio.match(/^data:([^;,]+)[^,]*,(.*)$/);
    if (!m) return { text: "" };
    const mime = m[1] ?? "audio/wav";
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array(Buffer.from(m[2] ?? "", "base64"))], { type: mime }), `a.${(mime.split("/")[1] || "wav").split(";")[0]}`);
    fd.append("model", "whisper-large-v3"); fd.append("language", "ar"); fd.append("temperature", "0");
    const r = await groqTranscribe(fd, 30000);
    if (!r || !r.ok) return { text: "" };
    return { text: String(((await r.json()) as { text?: string }).text ?? "").trim() };
  });
