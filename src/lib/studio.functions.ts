import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function myStore(ctx: Ctx): Promise<string> {
  const { data } = await ctx.supabase.from("stores").select("id").eq("owner_id", ctx.userId).limit(1).maybeSingle();
  if (!data) throw new Error("ما لقينا متجرك");
  return data.id as string;
}

async function isQueen(ctx: Ctx): Promise<boolean> {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  return !!data;
}

/** Merchant may touch only their own numbers; the queen (admin) may manage every merchant. */
async function canManage(ctx: Ctx, name: string, storeId?: string): Promise<boolean> {
  if (await isQueen(ctx)) return true;
  const sid = storeId ?? (await myStore(ctx).catch(() => ""));
  return !!sid && name.startsWith(prefix(sid));
}

let wahaCache: boolean | null = null;
async function isWaha(url: string, key: string): Promise<boolean> {
  if (wahaCache !== null) return wahaCache;
  try {
    const r = await fetch(`${url}/api/sessions`, { headers: { "X-Api-Key": key } });
    wahaCache = r.ok;
  } catch { wahaCache = false; }
  return wahaCache;
}

const WAHA_SESSION = "default"; // WAHA Core supports one session
const wahaState = (s: string) => (s === "WORKING" ? "open" : s === "SCAN_QR_CODE" || s === "STARTING" ? "connecting" : "close");

function evo() {
  // New multi-session Evolution v2 server first; old server stays as fallback
  const rawUrl = ("http://wa.nbhansmm.com:8085");
  const key = process.env["EVO_LIVE_KEY"] || process.env["EVO2_API_KEY"] || process.env["EVOLUTION_API_KEY"];
  if (!rawUrl || !key) throw new Error("خدمة واتساب غير مربوطة");
  const url = rawUrl.replace(/\/$/, "");
  const raw = async (path: string, method = "GET", body?: unknown, waha = false) => {
    const r = await fetch(`${url}${path}`, {
      method,
      headers: { ...(waha ? { "X-Api-Key": key } : { apikey: key }), "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (waha && (r.headers.get("content-type") || "").startsWith("image/")) {
      return { base64: `data:image/png;base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}` };
    }
    const t = await r.text();
    let j: any = null;
    try { j = JSON.parse(t); } catch { j = t; }
    if (!r.ok) throw new Error(`واتساب رفض الطلب (${r.status}): ${typeof j === "string" ? j.slice(0, 200) : JSON.stringify(j).slice(0, 200)}`);
    return j;
  };
  // Translate Evolution-style calls to WAHA when the server is WAHA
  const wahaCall = async (path: string, method: string, body?: any): Promise<any> => {
    const s = WAHA_SESSION;
    const session = async () => { try { return await raw(`/api/sessions/${s}`, "GET", undefined, true); } catch { return null; } };
    const qr = async () => {
      for (let i = 0; i < 6; i++) {
        const st = await session();
        if (st?.status === "WORKING") return { base64: "" };
        if (!st || st.status === "STOPPED" || st.status === "FAILED") {
          try { await raw(`/api/sessions/${s}/start`, "POST", undefined, true); } catch { /* ignore */ }
        }
        if (st?.status === "SCAN_QR_CODE") {
          try { return await raw(`/api/${s}/auth/qr?format=image`, "GET", undefined, true); } catch { /* retry */ }
        }
        await new Promise((x) => setTimeout(x, 2000));
      }
      return { base64: "" };
    };
    if (path.startsWith("/instance/fetchInstances")) {
      const st = await session();
      return st ? [{ name: s, connectionStatus: wahaState(st.status), ownerJid: st.me?.id || "" }] : [];
    }
    if (path.startsWith("/instance/connectionState")) {
      const st = await session();
      return { instance: { state: wahaState(st?.status || "") } };
    }
    if (path.startsWith("/instance/create")) {
      const webhookUrl = body?.webhook?.url ? `${body.webhook.url}${body.webhook.url.includes("?") ? "&" : "?"}i=${encodeURIComponent(body.instanceName ?? "")}` : "";
      if (webhookUrl) {
        try { await raw(`/api/sessions/${s}`, "PUT", { config: { webhooks: [{ url: webhookUrl, events: ["message", "session.status"] }] } }, true); } catch { /* ignore */ }
      }
      return { qrcode: await qr() };
    }
    if (path.startsWith("/instance/connect")) return qr();
    if (path.startsWith("/instance/logout")) { try { await raw(`/api/sessions/${s}/logout`, "POST", undefined, true); } catch { /* ignore */ } return { ok: true }; }
    if (path.startsWith("/instance/delete")) {
      try { await raw(`/api/sessions/${s}/logout`, "POST", undefined, true); } catch { /* ignore */ }
      try { await raw(`/api/sessions/${s}/stop`, "POST", undefined, true); } catch { /* ignore */ }
      return { ok: true };
    }
    if (path.startsWith("/message/sendText")) {
      return raw(`/api/sendText`, "POST", { session: s, chatId: `${String(body.number).replace(/\D/g, "")}@c.us`, text: body.text }, true);
    }
    if (path.startsWith("/message/sendWhatsAppAudio")) {
      return raw(`/api/sendVoice`, "POST", { session: s, chatId: `${String(body.number).replace(/\D/g, "")}@c.us`, file: { mimetype: "audio/ogg; codecs=opus", data: String(body.audio).replace(/^data:[^,]+,/, "") }, convert: true }, true);
    }
    if (path.startsWith("/webhook/set")) {
      const u0 = body?.webhook?.url || body?.url;
      const u = u0 ? `${u0}${u0.includes("?") ? "&" : "?"}i=${encodeURIComponent(decodeURIComponent(path.split("/").pop() || ""))}` : "";
      if (u) await raw(`/api/sessions/${s}`, "PUT", { config: { webhooks: [{ url: u, events: ["message", "session.status"] }] } }, true);
      return { ok: true };
    }
    return raw(path, method, body, true);
  };
  // Custom multi-session server (whatsapp-multi): only /instances, /instance/connect, /instance/delete, /message/*
  const multiCall = async (path: string, method: string, body?: any): Promise<any> => {
    const list = async () => { try { const a = await raw("/instances"); return Array.isArray(a) ? a : []; } catch { return []; } };
    if (path.startsWith("/instance/fetchInstances")) return list();
    if (path.startsWith("/instance/connectionState/")) {
      const n = decodeURIComponent(path.split("/").pop() || "");
      const i = (await list()).find((x: any) => x?.name === n);
      return { instance: { state: i?.connectionStatus === "open" ? "open" : i?.connectionStatus === "qr_ready" ? "connecting" : "close" } };
    }
    if (path.startsWith("/instance/create")) {
      const r = await raw(`/instance/connect/${encodeURIComponent(body?.instanceName ?? "")}`);
      return { qrcode: { base64: r?.base64 || "" } };
    }
    if (path.startsWith("/instance/logout/")) { try { return await raw(path.replace("/instance/logout/", "/instance/delete/"), "DELETE"); } catch { return { ok: true }; } }
    if (path.startsWith("/webhook/set")) return { ok: true };
    return raw(path, method, body);
  };
  return {
    async call(path: string, method = "GET", body?: unknown) {
      if (await isWaha(url, key)) return wahaCall(path, method, body);
      try { return await raw(path, method, body); }
      catch (e) {
        if (/\((404)\)/.test((e as Error).message)) return multiCall(path, method, body);
        throw e;
      }
    },
  };
}

const prefix = (storeId: string) => `k${storeId.replace(/-/g, "").slice(0, 10)}_`;

async function tts(text: string, voiceId: string, speed = 1, model = "s2.1-pro"): Promise<Buffer> {
  const key = process.env["FISH_AUDIO_API_KEY"];
  if (!key) throw new Error("خدمة الصوت غير مربوطة");
  const res = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", model },
    body: JSON.stringify({ text, reference_id: voiceId, format: "mp3", latency: "balanced", prosody: { speed, volume: 0 } }),
  });
  if (!res.ok) throw new Error(res.status === 402 ? "رصيد الأصوات خلص" : `تعذر توليد الصوت (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

// Generate voice, charge points, save into the merchant's library
export const studioGenerate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    text: z.string().trim().min(1).max(2000),
    voiceId: z.string().regex(/^[a-zA-Z0-9]{6,40}$/),
    voiceName: z.string().max(80).default(""),
    emotion: z.enum(["", "happy", "excited", "friendly", "confident", "calm", "empathetic"]).default(""),
    speed: z.number().min(0.6).max(1.6).default(1),
    model: z.enum(["s2.1-pro", "s2-pro", "fast", "s1"]).default("s2.1-pro"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const storeId = await myStore(context as Ctx);
    const cost = Math.min(100, Math.max(1, Math.ceil(data.text.length / 100)));
    const { error: spendErr } = await context.supabase.rpc("spend_points", { _store: storeId, _amount: cost, _reason: "استوديو الأصوات" });
    if (spendErr) throw new Error(spendErr.message.includes("insufficient") ? "رصيدك ما يكفي — اشحن من المحفظة" : spendErr.message);
    const spoken = data.emotion ? `(${data.emotion}) ${data.text}` : data.text;
    const buf = await tts(spoken, data.voiceId, data.speed, data.model);
    const path = `${storeId}/${Date.now()}.mp3`;
    const up = await context.supabase.storage.from("studio-audio").upload(path, buf, { contentType: "audio/mpeg" });
    if (up.error) throw new Error(up.error.message);
    const { data: row, error } = await context.supabase.from("studio_audio").insert({
      store_id: storeId, text: data.text, voice_id: data.voiceId, voice_name: data.voiceName, path, chars: data.text.length,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id as string, audio: `data:audio/mpeg;base64,${buf.toString("base64")}`, cost };
  });

// AI script writer: turns an idea into a short Saudi-dialect voice script
export const studioWrite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    idea: z.string().trim().min(2).max(400),
    style: z.enum(["offer", "welcome", "followup", "thanks", "ad"]).default("offer"),
  }).parse(d))
  .handler(async ({ data }) => {
    const styles = { offer: "عرض بيع مغري", welcome: "ترحيب بزبون جديد", followup: "متابعة زبون ما رد", thanks: "شكر بعد الشراء", ad: "إعلان قصير حماسي" };
    {
      const { getAIResponse } = await import("./ai-keys.server");
      const ext = await getAIResponse("أنت كاتبة نصوص صوتية سعودية محترفة. اكتبي نصاً واحداً باللهجة السعودية البيضاء، قصيراً (2-4 جمل)، دافئاً ومقنعاً، جاهزاً للقراءة بصوت. بدون إيموجي وبدون عناوين أو شرح.", `النوع: ${styles[data.style]}\nالفكرة: ${data.idea}`);
      if (ext) return { text: ext.slice(0, 2000) };
    }
    throw new Error("المفاتيح المجانية مشغولة الحين، انتظر دقيقة وجرّب مرة ثانية");
  });


// ---------- WhatsApp (QR linking + blue voice notes) ----------
export const waList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const queen = await isQueen(context as Ctx);
    const sid = await myStore(context as Ctx).catch((err) => { if (queen) return ""; throw err; });
    const p = sid ? prefix(sid) : "";
    const e = evo();
    const all = (await e.call("/instance/fetchInstances")) as any[];
    const mine = (Array.isArray(all) ? all : [])
      .map((i) => (i?.name === WAHA_SESSION && p ? { ...i, name: p + "واتساب" } : i))
      .filter((i) => typeof i.name === "string" && (queen || (p && i.name.startsWith(p))));
    return Promise.all(mine.map(async (i) => {
      let status = (i.connectionStatus as string) || "close";
      try {
        const s = await e.call(`/instance/connectionState/${encodeURIComponent(i.name)}`);
        status = (s?.instance?.state as string) || status;
      } catch { /* keep */ }
      return {
        name: i.name as string,
        label: p && (i.name as string).startsWith(p) ? (i.name as string).slice(p.length) : `👑 ${i.name as string}`,
        status,
        number: status === "open" ? (((i.ownerJid as string) || "").split("@")[0] ?? "") : "",
      };
    }));
  });

export const waCreate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ label: z.string().trim().min(1).max(30).regex(/^[\p{L}\p{N}_-]+$/u) }).parse(d))
  .handler(async ({ data, context }) => {
    const name = prefix(await myStore(context as Ctx)) + data.label;
    const secret = process.env["EVO_WEBHOOK_SECRET"];
    const url = `https://gentle-editor-zone.lovable.app/api/public/evolution${secret ? `?t=${secret}` : ""}`;
    try {
      const r = await evo().call("/instance/create", "POST", {
        instanceName: name, qrcode: true, integration: "WHATSAPP-BAILEYS",
        webhook: { enabled: true, url, byEvents: false, base64: false, events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"] },
      });
      return { name, qr: (r?.qrcode?.base64 as string) || "" };
    } catch (e) {
      // Name already exists on the server: reuse that session and return its QR instead of failing
      if (!/already in use|\(403\)/i.test((e as Error).message)) throw e;
      const r = await evo().call(`/instance/connect/${encodeURIComponent(name)}`);
      return { name, qr: (r?.base64 as string) || "" };
    }
  });

export const waQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ name: z.string().max(80), number: z.string().regex(/^\d{8,15}$/).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await canManage(context as Ctx, data.name))) throw new Error("غير مسموح");
    const path = `/instance/connect/${encodeURIComponent(data.name)}${data.number ? `?number=${data.number}` : ""}`;
    let r = await evo().call(path);
    const done = () => (data.number ? r?.pairingCode : r?.base64);
    for (let i = 0; i < 3 && !done(); i++) {
      await new Promise((x) => setTimeout(x, 2000));
      try { r = await evo().call(path); } catch { /* ignore */ }
    }
    return { qr: (r?.base64 as string) || "", code: (r?.pairingCode as string) || "" };
  });

export const waDelete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ name: z.string().max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await canManage(context as Ctx, data.name))) throw new Error("غير مسموح");
    await evo().call(`/instance/delete/${encodeURIComponent(data.name)}`, "DELETE");
    return { ok: true };
  });

// Hard reset: logout + delete + recreate fresh session with QR and webhook
export const waHardReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ name: z.string().max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await canManage(context as Ctx, data.name))) throw new Error("غير مسموح");
    const e = evo(), n = encodeURIComponent(data.name);
    try { await e.call(`/instance/logout/${n}`, "DELETE"); } catch { /* ignore */ }
    try { await e.call(`/instance/delete/${n}`, "DELETE"); } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 1500));
    const secret = process.env["EVO_WEBHOOK_SECRET"];
    const url = `https://gentle-editor-zone.lovable.app/api/public/evolution${secret ? `?t=${secret}` : ""}`;
    const r = await e.call("/instance/create", "POST", {
      instanceName: data.name, qrcode: true, integration: "WHATSAPP-BAILEYS",
      webhook: { enabled: true, url, byEvents: false, base64: false, events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"] },
    });
    let qr = (r?.qrcode?.base64 as string) || "";
    for (let i = 0; i < 6 && !qr; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try { const c = await e.call(`/instance/connect/${n}`); qr = (c?.base64 as string) || ""; } catch { /* ignore */ }
    }
    return { name: data.name, qr };
  });

async function audioBase64(ctx: Ctx, audioId: string) {
  const { data: row } = await ctx.supabase.from("studio_audio").select("path").eq("id", audioId).maybeSingle();
  if (!row) throw new Error("الملف الصوتي غير موجود");
  const dl = await ctx.supabase.storage.from("studio-audio").download(row.path);
  if (dl.error) throw new Error(dl.error.message);
  return { b64: Buffer.from(await dl.data.arrayBuffer()).toString("base64"), path: row.path as string };
}

export const waSendVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    name: z.string().max(80),
    number: z.string().regex(/^\+?\d{8,15}$/),
    audioId: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await canManage(context as Ctx, data.name))) throw new Error("غير مسموح");
    const { b64 } = await audioBase64(context as Ctx, data.audioId);
    // Real "recording…" on the customer's phone before the voice note arrives
    try { const { typingDelay } = await import("@/lib/autoreply.server"); await typingDelay(data.number.replace(/^\+/, ""), 3, data.name, "recording"); } catch { /* best effort */ }
    await evo().call(`/message/sendWhatsAppAudio/${encodeURIComponent(data.name)}`, "POST", {
      number: data.number.replace(/^\+/, ""), audio: b64, encoding: true, ptt: true,
    });
    return { ok: true };
  });

// ---------- Phone calls (plays the generated Saudi voice) ----------
export const placeCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ to: z.string().regex(/^\+\d{8,15}$/), audioId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const key = process.env["TELNYX_API_KEY"], app = process.env["TELNYX_APP_ID"], from = process.env["TELNYX_FROM"];
    if (!key || !app || !from) throw new Error("خدمة المكالمات غير مربوطة");
    const storeId = await myStore(context as Ctx);
    const { error: spendErr } = await context.supabase.rpc("spend_points", { _store: storeId, _amount: 10, _reason: "مكالمة هاتفية" });
    if (spendErr) throw new Error(spendErr.message.includes("insufficient") ? "رصيدك ما يكفي — اشحن من المحفظة" : spendErr.message);
    const { path } = await audioBase64(context as Ctx, data.audioId);
    const signed = await context.supabase.storage.from("studio-audio").createSignedUrl(path, 3600);
    if (signed.error) throw new Error(signed.error.message);
    const url = signed.data.signedUrl.replace(/&/g, "&amp;");
    const texml = `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${url}</Play></Response>`;
    const r = await fetch(`https://api.telnyx.com/v2/texml/calls/${app}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ From: from, To: data.to, Texml: texml }),
    });
    const t = await r.text();
    if (!r.ok) throw new Error(`تعذر الاتصال (${r.status}): ${t.slice(0, 200)}`);
    return { ok: true };
  });

// ---------- WhatsApp auto-reply (AI employee answers linked numbers) ----------
const DEV_URL = "https://gentle-editor-zone.lovable.app";
function hookBase(origin: string) {
  try {
    const h = new URL(origin).hostname;
    void h;
  } catch { /* ignore */ }
  return DEV_URL;
}

// ---------- Campaigns (bulk WhatsApp broadcast to saved customers) ----------
export const campaignPolish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ text: z.string().trim().min(2).max(1000) }).parse(d))
  .handler(async ({ data }) => {
    {
      const { getAIResponse } = await import("./ai-keys.server");
      const ext = await getAIResponse("أنت كاتبة إعلانات سعودية محترفة. حسّني رسالة الحملة: باللهجة السعودية البيضاء، قصيرة (2-4 جمل)، جذابة ومقنعة مع دعوة واضحة للتواصل. أرجعي النص المحسّن فقط بدون شرح.", data.text);
      if (ext) return { text: ext.slice(0, 1000) };
    }
    throw new Error("المفاتيح المجانية مشغولة الحين، انتظر دقيقة وجرّب مرة ثانية");
  });

export const campaignSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    name: z.string().max(80),
    numbers: z.array(z.string().regex(/^\+?\d{8,15}$/)).min(1).max(200),
    text: z.string().trim().min(1).max(1000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const storeId = await myStore(context as Ctx);
    if (!(await canManage(context as Ctx, data.name, storeId))) throw new Error("غير مسموح");
    const cost = data.numbers.length;
    const { error: spendErr } = await context.supabase.rpc("spend_points", { _store: storeId, _amount: cost, _reason: "حملة واتساب" });
    if (spendErr) throw new Error(spendErr.message.includes("insufficient") ? "رصيدك ما يكفي — اشحن من المحفظة" : spendErr.message);
    let sent = 0, failed = 0;
    for (const n of data.numbers) {
      try {
        await evo().call(`/message/sendText/${encodeURIComponent(data.name)}`, "POST", { number: n.replace(/^\+/, ""), text: data.text });
        sent++;
      } catch { failed++; }
    }
    if (sent === 0) throw new Error("ما وصلت أي رسالة — تأكد أن رقم الواتساب مربوط وشغال");
    await context.supabase.from("channel_messages").insert(
      data.numbers.map((n) => ({ store_id: storeId, channel: "whatsapp", customer_phone: n, direction: "out", text: data.text, replied: true })),
    );
    return { sent, failed, cost };
  });

export const waAutoList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("wa_autoreply").select("instance, enabled, voice, source");
    const { data: inbox } = await context.supabase.from("wa_inbox").select("msg_id, from_number, text, reply, status, error, created_at").order("created_at", { ascending: false }).limit(20);
    return { cfg: (data ?? []) as { instance: string; enabled: boolean; voice: boolean; source: string }[], inbox: (inbox ?? []) as any[] };
  });

export const waAutoSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ name: z.string().max(80), enabled: z.boolean(), voice: z.boolean(), source: z.enum(["smart", "rules", "ai", "library"]).default("smart"), origin: z.string().max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const storeId = await myStore(context as Ctx);
    if (!(await canManage(context as Ctx, data.name, storeId))) throw new Error("غير مسموح");
    const { error } = await context.supabase.from("wa_autoreply").upsert({ instance: data.name, store_id: storeId, enabled: data.enabled, voice: data.voice, source: data.source });
    if (error) throw new Error(error.message);
    const url = `${hookBase(data.origin)}/api/public/evolution${process.env["EVO_WEBHOOK_SECRET"] ? `?t=${process.env["EVO_WEBHOOK_SECRET"]}` : ""}`;
    await evo().call(`/webhook/set/${encodeURIComponent(data.name)}`, "POST", {
      webhook: { enabled: data.enabled, url, byEvents: false, base64: false, events: ["MESSAGES_UPSERT"] },
    });
    return { ok: true };
  });

/** Optional extra settings per number (allowed numbers / personality / model). Additive only. */
export const waExtraList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("wa_autoreply").select("*");
    if (error) return [] as WaExtra[];
    return ((data ?? []) as any[]).map((r) => ({
      instance: r.instance as string,
      allowed_numbers: (r.allowed_numbers ?? "") as string,
      system_prompt: (r.system_prompt ?? "") as string,
      ai_model: (r.ai_model ?? "") as string,
      supported: "allowed_numbers" in r,
    }));
  });
export type WaExtra = { instance: string; allowed_numbers: string; system_prompt: string; ai_model: string; supported: boolean };

export const waExtraSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    name: z.string().max(80),
    allowed_numbers: z.string().max(5000).optional(),
    system_prompt: z.string().max(4000).optional(),
    ai_model: z.enum(["gpt-4o-mini", "gpt-4o", "claude-3.5-sonnet"]).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const storeId = await myStore(context as Ctx);
    if (!(await canManage(context as Ctx, data.name, storeId))) throw new Error("غير مسموح");
    const { name, ...patch } = data;
    const { error } = await context.supabase.from("wa_autoreply").update(patch as any).eq("instance", name);
    if (error) throw new Error("الحفظ ما زبط — الإعداد الجديد يحتاج تحديث قاعدة البيانات أولاً");
    return { ok: true };
  });

export const waAiTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ message: z.string().min(1).max(1000), system_prompt: z.string().max(4000), ai_model: z.string().max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    const storeId = await myStore(context as Ctx);
    const { data: products } = await context.supabase.from("products").select("name, price, description").eq("store_id", storeId).limit(50);
    const ctx = "منتجات المتجر:\n" + ((products ?? []) as any[]).map((p) => `- ${p.name}: ${p.price} ريال ${p.description}`).join("\n");
    const { aiReplyWith } = await import("./autoreply.server");
    return { reply: await aiReplyWith(data.message, ctx, { system_prompt: data.system_prompt, ai_model: data.ai_model }) };
  });

// ---------- Voice studio cloud sync (same voices/clips on every device) ----------
export const voiceStateLoad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const storeId = await myStore(context as Ctx);
    const dl = await context.supabase.storage.from("studio-audio").download(`${storeId}/voice-state.json`);
    if (dl.error || !dl.data) return { state: null as string | null };
    return { state: await dl.data.text() };
  });

export const voiceStateSave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ state: z.string().max(20_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const storeId = await myStore(context as Ctx);
    const up = await context.supabase.storage.from("studio-audio")
      .upload(`${storeId}/voice-state.json`, new Blob([data.state], { type: "application/json" }), { upsert: true, contentType: "application/json" });
    if (up.error) throw new Error(up.error.message);
    return { ok: true };
  });
