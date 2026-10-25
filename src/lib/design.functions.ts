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
  if (t.includes("content_policy_violation")) return "فلتر الأمان في المحرك رفض الصورة أو الوصف — جرّب صورة أو وصف ثاني";
  return `تعذّر التوليد (${r.status})`;
}

const SIZES: Record<string, { image_size: string; aspect: string }> = {
  square: { image_size: "square_hd", aspect: "1:1" },
  story: { image_size: "portrait_16_9", aspect: "9:16" },
  portrait: { image_size: "portrait_4_3", aspect: "3:4" },
  landscape: { image_size: "landscape_16_9", aspect: "16:9" },
  wide: { image_size: "landscape_4_3", aspect: "4:3" },
};
// مقاسات 2K لسيدريم
const SEED_DIMS: Record<string, { width: number; height: number }> = {
  square: { width: 2048, height: 2048 },
  story: { width: 1536, height: 2730 },
  portrait: { width: 1920, height: 2560 },
  landscape: { width: 2730, height: 1536 },
  wide: { width: 2560, height: 1920 },
};
const SEEDREAM: Record<string, string> = { "seedream-4": "v4", "seedream-4.5": "v4.5" };

export const designImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    prompt: z.string().min(2).max(3000),
    negative: z.string().max(1000).optional(),
    model: z.enum(["seedream-4", "seedream-4.5", "flux-pro", "flux-dev", "flux-schnell", "ideogram", "recraft"]),
    size: z.enum(["square", "story", "portrait", "landscape", "wide"]),
    count: z.number().int().min(1).max(4),
    steps: z.number().int().min(4).max(50).optional(),
    guidance: z.number().min(1).max(20).optional(),
    seed: z.number().int().optional(),
    style: z.string().max(60).optional(),
    refs: z.array(z.string().url()).max(2).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const s = SIZES[data.size] ?? SIZES["square"]!;
    // سيدريم (بايت دانس): توليد من النص أو تعديل الصور المرجعية
    const sv = SEEDREAM[data.model];
    if (sv) {
      const edit = !!data.refs?.length;
      const b: Record<string, unknown> = { prompt: data.prompt, num_images: data.count, image_size: SEED_DIMS[data.size] ?? SEED_DIMS["square"], enable_safety_checker: true };
      if (data.seed !== undefined) b["seed"] = data.seed;
      if (edit) b["image_urls"] = data.refs;
      const r = await fetch(`https://fal.run/fal-ai/bytedance/seedream/${sv}/${edit ? "edit" : "text-to-image"}`, {
        method: "POST", headers: { Authorization: `Key ${key()}`, "Content-Type": "application/json" }, body: JSON.stringify(b),
      });
      if (!r.ok) return { images: [] as string[], seed: null, error: await falErr(r) as string | null };
      const j = (await r.json()) as { images?: { url: string }[]; seed?: number };
      return { images: (j.images ?? []).map((i) => i.url), seed: j.seed ?? null, error: null as string | null };
    }
    // صورة مرجعية: تعديل/دمج عبر FLUX Kontext (إضافة)
    if (data.refs?.length) {
      const multi = data.refs.length > 1;
      const kb: Record<string, unknown> = { prompt: data.prompt, num_images: data.count, aspect_ratio: s.aspect, safety_tolerance: "2", output_format: "jpeg" };
      if (data.guidance) kb["guidance_scale"] = data.guidance;
      if (data.seed !== undefined) kb["seed"] = data.seed;
      if (multi) kb["image_urls"] = data.refs; else kb["image_url"] = data.refs[0];
      const r = await fetch(`https://fal.run/fal-ai/flux-pro/kontext${multi ? "/multi" : ""}`, {
        method: "POST", headers: { Authorization: `Key ${key()}`, "Content-Type": "application/json" }, body: JSON.stringify(kb),
      });
      if (!r.ok) return { images: [] as string[], seed: null, error: await falErr(r) as string | null };
      const j = (await r.json()) as { images?: { url: string }[]; seed?: number };
      return { images: (j.images ?? []).map((i) => i.url), seed: j.seed ?? null, error: null as string | null };
    }
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
  .inputValidator((d) => z.object({ idea: z.string().min(2).max(1500), kind: z.enum(["image", "video", "quote"]), lang: z.enum(["en", "ar"]).optional() }).parse(d))
  .handler(async ({ data }) => {
    const { getAIResponse } = await import("./ai-keys.server");
    let sys = data.kind === "quote"
      ? "اكتب 5 خواطر غزل سعودية قصيرة وراقية (سطر أو سطرين لكل خاطرة) عن الفكرة. كل خاطرة في سطر مستقل بدون ترقيم أو شرح."
      : data.kind === "video"
        ? "You are a cinematic video prompt engineer. Turn the user's (possibly Arabic) idea into ONE rich English prompt for an AI video model: subject, action, camera movement, lighting, mood, lens, atmosphere. Tasteful and romantic, no explicit content. Output only the prompt."
        : "You are an expert image prompt engineer. Turn the user's (possibly Arabic) idea into ONE detailed English prompt for a photorealistic AI image: subject, composition, lighting, color palette, lens, mood, ultra detailed, 8k. Tasteful and romantic, no explicit content. Output only the prompt.";
    if (data.kind !== "quote" && data.lang === "ar") sys += " IMPORTANT: write the final prompt in fluent Arabic (not English).";
    const out = await getAIResponse(sys, data.idea);
    if (!out) return { text: null as string | null, error: "المفاتيح المجانية مشغولة، جرّب بعد شوي" };
    return { text: out.trim(), error: null as string | null };
  });

// ⚡ أدوات سريعة — تفريغ الخلفية، رفع الدقة، تبديل الوجوه، مزامنة الشفاه (إضافة، لا تغيّر القائم)
const media = z.string().max(15_000_000).refine((u) => u.startsWith("https://") || u.startsWith("data:"), "رابط غير صالح");
export const designTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    tool: z.enum(["bg", "upscale", "faceswap", "lipsync"]),
    image: media.optional(),
    face: media.optional(),
    video: media.optional(),
    audio: media.optional(),
    scale: z.number().int().min(2).max(4).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const h = { Authorization: `Key ${key()}`, "Content-Type": "application/json" };
    const need = (v: string | undefined, m: string) => { if (!v) throw new Error(m); return v; };
    if (data.tool === "lipsync") {
      const body = { video_url: need(data.video, "ارفع فيديو"), audio_url: need(data.audio, "ارفع صوت"), sync_mode: "cut_off" };
      const r = await fetch("https://queue.fal.run/fal-ai/sync-lipsync", { method: "POST", headers: h, body: JSON.stringify(body) });
      if (!r.ok) return { url: null as string | null, status_url: "", response_url: "", error: await falErr(r) };
      const j = (await r.json()) as { status_url: string; response_url: string };
      return { url: null, status_url: j.status_url, response_url: j.response_url, error: null as string | null };
    }
    let ep = ""; let body: Record<string, unknown> = {};
    if (data.tool === "bg") { ep = "fal-ai/birefnet"; body = { image_url: need(data.image, "ارفع صورة"), output_format: "png" }; }
    else if (data.tool === "upscale") { ep = "fal-ai/esrgan"; body = { image_url: need(data.image, "ارفع صورة"), scale: data.scale ?? 2, face: true }; }
    else { ep = "fal-ai/face-swap"; body = { base_image_url: need(data.image, "ارفع الصورة الأساسية"), swap_image_url: need(data.face, "ارفع صورة الوجه") }; }
    const r = await fetch(`https://fal.run/${ep}`, { method: "POST", headers: h, body: JSON.stringify(body) });
    if (!r.ok) return { url: null as string | null, status_url: "", response_url: "", error: await falErr(r) };
    const j = (await r.json()) as { image?: { url: string }; images?: { url: string }[] };
    const url = j.image?.url ?? j.images?.[0]?.url ?? null;
    return { url, status_url: "", response_url: "", error: url ? null as string | null : "ما رجعت نتيجة" };
  });
