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
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("خدمة التفريغ غير مهيأة");
    const form = new FormData();
    form.append("model", "openai/gpt-transcribe");
    form.append("file", file, row.path.split("/").pop() || "clip.webm");
    form.append("response_format", "json");
    form.append("language", "ar");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
    if (!res.ok) throw new Error(`تعذر التفريغ (${res.status})`);
    const j = (await res.json().catch(() => ({}))) as { text?: string };
    const text = String(j.text ?? "").slice(0, 10000);
    await sb.from("media_library").update({ transcript: text }).eq("id", row.id);
    return { text };
  });
