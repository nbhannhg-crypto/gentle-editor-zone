import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Live-call speech-to-text via free Gemini keys (no platform credits). */
export const transcribeLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ audio: z.string().min(10).max(12_000_000), mime: z.string().max(60), vocab: z.array(z.string().max(80)).max(150).optional() }).parse(d))
  .handler(async ({ data }) => {
    const vocab = (data.vocab ?? []).filter(Boolean).join("، ");
    // Primary: Groq Whisper Large-v3 (fast, literal). Fallback: Gemini.
    const groqKey = process.env['GROQ_API_KEY'];
    if (groqKey) {
      try {
        const bin = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
        const mime = data.mime || "audio/webm";
        const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : mime.includes("wav") ? "wav" : "webm";
        const fd = new FormData();
        fd.append("file", new Blob([bin], { type: mime }), `a.${ext}`);
        fd.append("model", "whisper-large-v3");
        fd.append("language", "ar");
        fd.append("temperature", "0");
        fd.append("response_format", "json");
        const base = "سوالف حب ودلع ورومانسية باللهجة السعودية العامية، الكلمات المتوقعة: مساء الخير، صباح الخير، مساء الورد، مساء النور، ما سمعتك، وحشتني، أحبك، يا قلبي، بين أقول، هلا والله، وش مسوي، فديتك، يا بعد قلبي، كيف حالك، وش فيك، لبى، يا روحي، عيوني، منور، يا زينك، سولف، تكفى، أبشر، يالغالي، تسلم لي، وش علومك، من عيوني، تمام.";
        fd.append("prompt", (base + (vocab ? " " + vocab : "")).slice(0, 800));
        const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${groqKey}` },
          body: fd,
          signal: AbortSignal.timeout(8000),
        });
        if (r.ok) {
          const j = (await r.json()) as { text?: string };
          const t = (j.text ?? "").trim();
          return { text: t.length < 2 ? "" : t.slice(0, 2000), busy: false };
        }
        console.error("groq stt", r.status, (await r.text()).slice(0, 200));
      } catch (e) {
        console.error("groq stt error", e);
      }
    }
    const { geminiMedia } = await import("./ai-keys.server");
    const out = await geminiMedia(
      "فرّغ كلام المتحدث حرفياً بالعربية كما نطقه بالضبط، كلمة بكلمة. المتحدث يسولف باللهجة السعودية العامية (حب، دلع، رومانسية، سوالف). قواعد صارمة: لا تحوّل للفصحى، لا تصحّح ولا تعيد صياغة، لا تضيف ولا تحذف أي كلمة أو حرف، لا تكمل جملة ناقصة، ولا تخمّن كلمة لم تُنطق بوضوح." +
        (vocab ? `\nكلمات متوقعة — استخدم هذا الشكل فقط إذا نُطقت فعلاً: ${vocab}` : "") +
        "\nكلمات شائعة: هلا والله، يا قلبي، فديتك، يا روحي، يا بعد عمري، لبى قلبك، وحشتني، أحبك، وش تسوي، وش علومك، كيفك، تكفى، طيب، تمام، إي، لا." +
        "\nاكتب النص فقط بدون تعليق. إذا كان الصوت مقطوعاً أو غير واضح أو صمتاً/ضجيجاً فقط اكتب: -",
      data.mime || "audio/webm",
      data.audio,
      { temperature: 0 },
    );
    const text = out.trim();
    if (!text || text === "-" || text.length < 2) return { text: "", busy: !out };
    return { text: text.slice(0, 2000), busy: false };
  });
