import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// محركات fal.ai — المفتاح FAL_KEY يُقرأ داخل المعالج فقط
export const IMAGE_MODELS = {
  "flux-pro": "fal-ai/flux-pro/v1.1-ultra",
  "flux-dev": "fal-ai/flux/dev",
  "flux-schnell": "fal-ai/flux/schnell",
  ideogram: "fal-ai/ideogram/v3",
  recraft: "fal-ai/recraft-v3",
} as const;
export const VIDEO_MODELS = {
  kling: { t2v: "fal-ai/kling-video/v2.1/master/text-to-video", i2v: "fal-ai/kling-video/v2.1/master/image-to-video" },
  "kling-std": { t2v: "fal-ai/kling-video/v2.1/standard/text-to-video", i2v: "fal-ai/kling-video/v2.1/standard/image-to-video" },
  hailuo: { t2v: "fal-ai/minimax/hailuo-02/standard/text-to-video", i2v: "fal-ai/minimax/hailuo-02/standard/image-to-video" },
} as const;

function key() {
  const k = process.env["FAL_KEY"];
  if (!k) throw new Error("مفتاح fal.ai غير مضاف بعد");
  return k;
}
async function falErr(r: Response) {
  const t = await r.text().catch(() => "");
  if (r.status === 401 || r.status === 403) return "مفتاح fal.ai غير صالح أو بدون رصيد";
  if (r.status === 429) return "المحرك مشغول، جرّب بعد شوي";
  console.error("fal", r.status, t.slice(0, 300));
  return `تعذّر التوليد (${r.status})`;
}

const SIZES: Record<string, { image_size: string; aspect: string }> = {
  square: { image_size: "square_hd", aspect: "1:1" },
  story: { image_size: "portrait_16_9", aspect: "9:16" },
  portrait: { image_size: "portrait_4_3", aspect: "3:4" },
  landscape: { image_size: "landscape_16_9", aspect: "16:9" },
  wide: { image_size: "landscape_4_3", aspect: "4:3" },
};

export const designImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    prompt: z.string().min(2).max(3000),
    negative: z.string().max(1000).optional(),
    model: z.enum(["flux-pro", "flux-dev", "flux-schnell", "ideogram", "recraft"]),
    size: z.enum(["square", "story", "portrait", "landscape", "wide"]),
    count: z.number().int().min(1).max(4),
    steps: z.number().int().min(4).max(50).optional(),
    guidance: z.number().min(1).max(20).optional(),
    seed: z.number().int().optional(),
    style: z.string().max(60).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const s = SIZES[data.size] ?? SIZES["square"]!;
    const body: Record<string, unknown> = { prompt: data.prompt, num_images: data.count, enable_safety_checker: true };
    if (data.seed !== undefined) body["seed"] = data.seed;
    if (data.model === "flux-pro") { body["aspect_ratio"] = s.aspect; body["raw"] = false; }
    else if (data.model === "ideogram") { body["image_size"] = s.image_size; if (data.negative) body["negative_prompt"] = data.negative; }
    else if (data.model === "recraft") { body["image_size"] = s.image_size; body["style"] = data.style || "realistic_image"; delete body["num_images"]; }
    else {
      body["image_size"] = s.image_size;
      if (data.steps) body["num_inference_steps"] = data.model === "flux-schnell" ? Math.min(12, data.steps) : data.steps;
      if (data.guidance) body["guidance_scale"] = data.guidance;
    }
    const r = await fetch(`https://fal.run/${IMAGE_MODELS[data.model]}`, {
      method: "POST", headers: { Authorization: `Key ${key()}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!r.ok) return { images: [] as string[], error: await falErr(r) };
    const j = (await r.json()) as { images?: { url: string }[]; seed?: number };
    return { images: (j.images ?? []).map((i) => i.url), seed: j.seed ?? null, error: null as string | null };
  });

export const designVideoStart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    prompt: z.string().min(2).max(2500),
    model: z.enum(["kling", "kling-std", "hailuo"]),
    image: z.string().url().optional(),
    duration: z.enum(["5", "10"]),
    aspect: z.enum(["16:9", "9:16", "1:1"]),
    negative: z.string().max(500).optional(),
    cfg: z.number().min(0).max(1).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const m = VIDEO_MODELS[data.model];
    const ep = data.image ? m.i2v : m.t2v;
    const body: Record<string, unknown> = { prompt: data.prompt };
    if (data.model === "hailuo") { body["duration"] = data.duration === "10" ? "10" : "6"; body["prompt_optimizer"] = true; }
    else { body["duration"] = data.duration; body["aspect_ratio"] = data.aspect; if (data.negative) body["negative_prompt"] = data.negative; if (data.cfg !== undefined) body["cfg_scale"] = data.cfg; }
    if (data.image) body["image_url"] = data.image;
    const r = await fetch(`https://queue.fal.run/${ep}`, {
      method: "POST", headers: { Authorization: `Key ${key()}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!r.ok) return { error: await falErr(r), status_url: "", response_url: "" };
    const j = (await r.json()) as { status_url: string; response_url: string };
    return { error: null as string | null, status_url: j.status_url, response_url: j.response_url };
  });

export const designVideoCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ status_url: z.string().url(), response_url: z.string().url() }).parse(d))
  .handler(async ({ data }) => {
    for (const u of [data.status_url, data.response_url]) if (!u.startsWith("https://queue.fal.run/")) throw new Error("رابط غير صالح");
    const h = { Authorization: `Key ${key()}` };
    const s = await fetch(data.status_url, { headers: h });
    if (!s.ok) return { status: "ERROR", url: null as string | null, error: await falErr(s) };
    const sj = (await s.json()) as { status: string; queue_position?: number };
    if (sj.status !== "COMPLETED") return { status: sj.status, position: sj.queue_position ?? null, url: null, error: null };
    const r = await fetch(data.response_url, { headers: h });
    if (!r.ok) return { status: "ERROR", url: null, error: await falErr(r) };
    const rj = (await r.json()) as { video?: { url: string } };
    return { status: "COMPLETED", url: rj.video?.url ?? null, error: rj.video ? null : "ما رجع فيديو" };
  });

// تحسين الأمر بالذكاء — مفاتيح خارجية فقط (بدون رصيد المنصة)
export const designEnhance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ idea: z.string().min(2).max(1500), kind: z.enum(["image", "video", "quote"]) }).parse(d))
  .handler(async ({ data }) => {
    const { getAIResponse } = await import("./ai-keys.server");
    const sys = data.kind === "quote"
      ? "اكتب 5 خواطر غزل سعودية قصيرة وراقية (سطر أو سطرين لكل خاطرة) عن الفكرة. كل خاطرة في سطر مستقل بدون ترقيم أو شرح."
      : data.kind === "video"
        ? "You are a cinematic video prompt engineer. Turn the user's (possibly Arabic) idea into ONE rich English prompt for an AI video model: subject, action, camera movement, lighting, mood, lens, atmosphere. Tasteful and romantic, no explicit content. Output only the prompt."
        : "You are an expert image prompt engineer. Turn the user's (possibly Arabic) idea into ONE detailed English prompt for a photorealistic AI image: subject, composition, lighting, color palette, lens, mood, ultra detailed, 8k. Tasteful and romantic, no explicit content. Output only the prompt.";
    const out = await getAIResponse(sys, data.idea);
    if (!out) return { text: null as string | null, error: "المفاتيح المجانية مشغولة، جرّب بعد شوي" };
    return { text: out.trim(), error: null as string | null };
  });
