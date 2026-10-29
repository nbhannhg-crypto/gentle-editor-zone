import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const API = "https://api.simli.ai";
function key() {
  const k = process.env.SIMLI_API_KEY;
  if (!k) throw new Error("مفتاح Simli غير مضاف");
  return k;
}
async function fail(r: Response) {
  const t = await r.text().catch(() => "");
  throw new Error(`Simli ${r.status}: ${t.slice(0, 300)}`);
}

/** يرفع الصورة ويبدأ صنع الوجه الحي */
export const simliCreateFace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ image: z.string().min(100).max(15_000_000), name: z.string().max(60).default("staff") }).parse(d))
  .handler(async ({ data }) => {
    const m = data.image.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) throw new Error("صيغة الصورة غير صحيحة");
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    const fd = new FormData();
    fd.append("image", new Blob([bytes], { type: m[1] }), `face.${m[1].split("/")[1]}`);
    const r = await fetch(`${API}/faces/trinity?face_name=${encodeURIComponent(data.name)}`, { method: "POST", headers: { "x-simli-api-key": key() }, body: fd });
    if (!r.ok) await fail(r);
    const j = (await r.json()) as { face_id: string; message?: string; dispatch_after?: number };
    return { faceId: j.face_id, message: j.message ?? "", dispatchAfter: j.dispatch_after ?? null };
  });

export const simliFaceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ faceId: z.string().min(5).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const r = await fetch(`${API}/faces/trinity/generation_status?face_id=${encodeURIComponent(data.faceId)}`, { headers: { "x-simli-api-key": key() } });
    if (!r.ok) await fail(r);
    const j = (await r.json()) as { status?: string; queue_position?: number };
    return { status: String(j.status ?? "unknown"), queue: j.queue_position ?? -1 };
  });

/** تذكرة جلسة مؤقتة — المفتاح ما يطلع للمتصفح */
export const simliToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ faceId: z.string().min(5).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const r = await fetch(`${API}/compose/token`, {
      method: "POST",
      headers: { "x-simli-api-key": key(), "content-type": "application/json" },
      body: JSON.stringify({ faceId: data.faceId, handleSilence: true, maxSessionLength: 1200, maxIdleTime: 180 }),
    });
    if (!r.ok) await fail(r);
    const j = (await r.json()) as { session_token: string };
    return { token: j.session_token };
  });
