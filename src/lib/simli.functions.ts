import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const API = "https://api.simli.ai";
function key() {
  const k = process.env["SIMLI_API_KEY"];
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
    const mime = m[1] ?? "image/jpeg";
    const bytes = Uint8Array.from(atob(m[2] ?? ""), (c) => c.charCodeAt(0));
    const fd = new FormData();
    fd.append("image", new Blob([bytes], { type: mime }), `face.${mime.split("/")[1] ?? "jpg"}`);
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

/* ================= غرف مكالمة الفيديو للزبون (رابط يُرسل) ================= */
type RoomMsg = { who: "c" | "a"; t: string; at: number };
type Room = {
  owner: string; faceId: string; storeId: string | null; preview: string;
  voice: { voiceId?: string | undefined; speed?: number | undefined; emotion?: string | undefined }; rules: { trigger: string; response: string }[]; product?: string; identity?: string;
  log: RoomMsg[]; push: { id: number; t: string } | null; ended: boolean; at: number; snap?: string;
};
const ROOM_TTL = 24 * 3600 * 1000;
const rk = (id: string) => `video_room:${id}`;
async function adminDb() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin; }
async function readRoom(id: string): Promise<{ rowId: string; room: Room }> {
  const db = await adminDb();
  const { data } = await db.from("training_rules").select("id, response_text").eq("trigger_text", rk(id)).limit(1).maybeSingle();
  if (!data) throw new Error("الرابط غير صحيح أو انتهى");
  const room = JSON.parse(data.response_text) as Room;
  if (Date.now() - room.at > ROOM_TTL) throw new Error("انتهت صلاحية الرابط");
  return { rowId: data.id, room };
}
async function writeRoom(rowId: string, room: Room) {
  const db = await adminDb();
  await db.from("training_rules").update({ response_text: JSON.stringify(room) }).eq("id", rowId);
}
const roomId = z.string().regex(/^[a-zA-Z0-9]{12,40}$/);

/** الملكة/التاجر: ينشئ غرفة ويرجع رقمها */
export const roomCreate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    faceId: z.string().min(5).max(100), storeId: z.string().max(100).nullable(), preview: z.string().max(4000).default(""),
    voice: z.object({ voiceId: z.string().max(100).optional(), speed: z.number().optional(), emotion: z.string().max(40).optional() }).default({}), rules: z.array(z.object({ trigger: z.string().max(500), response: z.string().max(2000) })).max(200).default([]),
    product: z.string().max(2000).default(""), identity: z.string().max(3000).default(""),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join("") + Date.now().toString(36);
    const room: Room = { owner: context.userId, faceId: data.faceId, storeId: data.storeId, preview: data.preview, voice: data.voice, rules: data.rules, product: data.product, identity: data.identity, log: [], push: null, ended: false, at: Date.now() };
    const db = await adminDb();
    const { error } = await db.from("training_rules").insert({ trigger_text: rk(id), response_text: JSON.stringify(room), category: "video_room", store_id: data.storeId });
    if (error) throw new Error("تعذر إنشاء الرابط");
    return { id };
  });

/** الملكة: تتابع المحادثة */
export const roomWatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: roomId }).parse(d))
  .handler(async ({ data, context }) => {
    const { room } = await readRoom(data.id);
    if (room.owner !== context.userId) throw new Error("مو غرفتك");
    return { log: room.log, ended: room.ended, snap: room.snap ?? "" };
  });

/** الملكة: تخليها تنطق جملة فوراً عند الزبون */
export const roomPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: roomId, text: z.string().min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { rowId, room } = await readRoom(data.id);
    if (room.owner !== context.userId) throw new Error("مو غرفتك");
    room.push = { id: Date.now(), t: data.text };
    await writeRoom(rowId, room);
    return { ok: true };
  });

/** صفحة الزبون (عامة): معلومات الغرفة بدون السجل */
export const roomGet = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: roomId }).parse(d))
  .handler(async ({ data }) => {
    const { room } = await readRoom(data.id);
    return { preview: room.preview, voice: room.voice, rules: room.rules, product: room.product ?? "", identity: room.identity ?? "", push: room.push, ended: room.ended };
  });

/** صفحة الزبون: تذكرة الفيديو — المفتاح يبقى بالسيرفر */
export const roomToken = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: roomId }).parse(d))
  .handler(async ({ data }) => {
    const { room } = await readRoom(data.id);
    if (room.ended) throw new Error("المكالمة منتهية");
    const r = await fetch(`${API}/compose/token`, {
      method: "POST", headers: { "x-simli-api-key": key(), "content-type": "application/json" },
      body: JSON.stringify({ faceId: room.faceId, handleSilence: true, maxSessionLength: 1200, maxIdleTime: 180 }),
    });
    if (!r.ok) await fail(r);
    return { token: ((await r.json()) as { session_token: string }).session_token };
  });

/** صفحة الزبون: يسجل الكلام + لقطة كاميرا صغيرة للملكة */
export const roomAppend = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    id: roomId, msgs: z.array(z.object({ who: z.enum(["c", "a"]), t: z.string().min(1).max(600) })).max(5).default([]),
    snap: z.string().max(60_000).optional(), end: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { rowId, room } = await readRoom(data.id);
    room.log = [...room.log, ...data.msgs.map((m) => ({ ...m, at: Date.now() }))].slice(-80);
    if (data.snap && data.snap.startsWith("data:image/")) room.snap = data.snap;
    if (data.end) room.ended = true;
    await writeRoom(rowId, room);
    return { ok: true };
  });
