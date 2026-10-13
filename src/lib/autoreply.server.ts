import Fuse from "fuse.js";
import { composePrompt } from "./wa-learn";

const norm = (s: string) =>
  s.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

type Rule = { id: string; trigger_text: string; response_text: string; use_count: number };

export function bestRule(text: string, rules: Rule[]): { rule: Rule; score: number } | null {
  const q = norm(text);
  if (!q || !rules.length) return null;
  const items = rules.map((r) => ({ r, n: norm(r.trigger_text) }));
  const fs = new Map<string, number>();
  new Fuse(items, { keys: ["n"], includeScore: true, threshold: 0.6, ignoreLocation: true })
    .search(q).forEach((h) => fs.set(h.item.r.id, 1 - (h.score ?? 1)));
  // أولوية: تطابق مباشر (كامل ثم جزئي) يُعتمد فوراً قبل الفحص التقريبي
  const exact = items.find(({ n }) => n && n === q);
  if (exact) return { rule: exact.r, score: 1 };
  // تدقيق: الجزء المشترك لازم يكون كلمات كاملة ويغطي جزء كبير من الجملة (مو كلمة صغيرة عابرة)
  const STOP = new Set(["في", "من", "على", "الى", "عن", "ما", "لا", "يا", "و", "او", "هل", "انا", "انت", "هو", "هي", "ابي", "ابغى", "بس", "مع", "كم", "اي", "شي", "ذا", "هذا", "هذي", "الله"]);
  const words = (s: string) => s.split(" ").filter((w) => w.length > 1 && !STOP.has(w));
  const qw = words(q);
  const wholeIn = (a: string, b: string) => (" " + b + " ").includes(" " + a + " ");
  let sub: { r: Rule; n: string; s: number } | null = null;
  for (const it of items) {
    if (!it.n) continue;
    const [shortS, longS] = it.n.length <= q.length ? [it.n, q] : [q, it.n];
    if (!wholeIn(shortS, longS) || !words(shortS).length) continue;
    const ratio = shortS.length / longS.length;
    const s = ratio >= 0.6 ? 0.95 : ratio >= 0.35 ? 0.75 : 0.4;
    if (!sub || s > sub.s || (s === sub.s && it.n.length > sub.n.length)) sub = { r: it.r, n: it.n, s };
  }
  if (sub && sub.s >= 0.75) return { rule: sub.r, score: sub.s };
  let best: { rule: Rule; score: number } | null = sub ? { rule: sub.r, score: sub.s } : null;
  for (const { r, n } of items) {
    if (!n) continue;
    const tw = words(n);
    if (!tw.length || !qw.length) continue;
    // تطابق الكلمات الجوهرية بالاتجاهين (كلمة كاملة أو قريبة جداً)
    const near = (a: string, b: string) => a === b || (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a)));
    const hitT = tw.filter((w) => qw.some((x) => near(w, x))).length / tw.length;
    const hitQ = qw.filter((x) => tw.some((w) => near(w, x))).length / qw.length;
    const overlap = Math.min(hitT, hitQ) * 0.9;
    const score = Math.max(overlap, (fs.get(r.id) ?? 0) * 0.85);
    if (!best || score > best.score) best = { rule: r, score };
  }
  return best;
}

/** Streams a short Saudi sales reply from the AI gateway (Responses API). */
export async function aiReply(customer: string, context: string): Promise<string> {
  const { quickGreeting } = await import("./ai-keys.server");
  const greet = quickGreeting(customer);
  if (greet) return greet;
  return aiText("أنتِ موظفة مبيعات سعودية ذكية ترد على واتساب. ردي باللهجة السعودية البيضاء، بجملة أو جملتين فقط، بلطف وإقناع، وبدون إيموجي كثير. استخدمي معلومات المتجر إذا تفيد، ولا تخترعي أسعار غير موجودة.\n\n" + context, customer, 1000);
}

/** Optional per-number settings (all may be missing → old behaviour). */
export type AiOpts = { system_prompt?: string | null; ai_model?: string | null; ai_temperature?: number | null };

const OR_MODELS: Record<string, string> = {
  "gpt-4o-mini": "openai/gpt-4o-mini",
  "gpt-4o": "openai/gpt-4o",
  "claude-3.5-sonnet": "anthropic/claude-3.5-sonnet",
};

/** Same as aiReply, but honours custom personality/model when set; falls back to aiReply. */
export async function aiReplyWith(customer: string, context: string, o: AiOpts = {}): Promise<string> {
  const prompt = composePrompt(o.system_prompt).trim();
  if (!prompt && !o.ai_model) return aiReply(customer, context);
  const { quickGreeting } = await import("./ai-keys.server");
  const greet = quickGreeting(customer);
  if (greet) return greet;
  const system = (prompt || "أنتِ موظفة مبيعات سعودية ذكية ترد على واتساب. ردي باللهجة السعودية البيضاء، بجملة أو جملتين فقط.") +
    "\nاستخدمي معلومات المتجر إذا تفيد، ولا تخترعي أسعار غير موجودة.\n\n" + context;
  const key = process.env["OPENROUTER_KEY"];
  const model = OR_MODELS[o.ai_model ?? ""] ?? OR_MODELS["gpt-4o-mini"];
  if (key) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, temperature: o.ai_temperature ?? 0.7, max_tokens: 600, messages: [{ role: "system", content: system }, { role: "user", content: customer }] }),
      });
      if (res.ok) {
        const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const t = j.choices?.[0]?.message?.content?.trim();
        if (t) return t.slice(0, 1000);
      }
    } catch (e) { console.error("custom model failed", e); }
  }
  return aiText(system, customer, 1000);
}

/** Keep digits only. */
export const cleanNum = (s: string) => s.replace(/\D/g, "");

/** Empty list → everyone allowed. Otherwise exact or suffix match (country code). */
export function numberAllowed(list: string | null | undefined, sender: string): boolean {
  const nums = (list ?? "").split(/[,\n،;]+/).map(cleanNum).filter((n) => n.length >= 5);
  if (!nums.length) return true;
  const s = cleanNum(sender);
  return nums.some((n) => s === n || s.endsWith(n) || n.endsWith(s));
}

export async function aiText(instructions: string, userText: string, maxLen = 4000): Promise<string> {
  const { getAIResponse } = await import("./ai-keys.server");
  const ext = await getAIResponse(instructions, userText);
  if (ext) return ext.slice(0, maxLen);
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI key missing");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Lovable-API-Key": key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      instructions,
      input: [{ role: "user", content: userText }],
    }),
  });
  if (!res.ok || !res.body) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const l of lines) {
      if (!l.startsWith("data:")) continue;
      const p = l.slice(5).trim();
      if (!p || p === "[DONE]") continue;
      try { const j = JSON.parse(p); if (j.type === "response.output_text.delta") out += j.delta ?? ""; } catch { /* skip */ }
    }
  }
  return out.trim().slice(0, maxLen);
}

export async function fishTts(text: string): Promise<string> {
  const key = process.env["FISH_AUDIO_API_KEY"];
  if (!key) throw new Error("voice key missing");
  const r = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", model: "s1" },
    body: JSON.stringify({ text: `(friendly) ${text}`, reference_id: "ca005277ffeb4282961e5253b18c6280", format: "mp3", latency: "normal" }),
  });
  if (!r.ok) throw new Error(`voice ${r.status}`);
  return Buffer.from(await r.arrayBuffer()).toString("base64");
}

/** Waits the merchant-chosen delay while showing "typing…" (best effort, never blocks the reply). */
export async function typingDelay(number: string, seconds: number, instance = "", presence: "composing" | "recording" = "composing") {
  const sec = Math.min(Math.max(Math.round(seconds || 0), 0), 25);
  if (!sec) return;
  const url = (((process.env["EVO_LIVE_URL"] || process.env["EVO2_API_URL"] || process.env["EVOLUTION_API_URL"])) || "").replace(/\/$/, "");
  const key = process.env["EVO_LIVE_KEY"] || process.env["EVO2_API_KEY"] || process.env["EVOLUTION_API_KEY"] || "";
  const raw = String(number);
  // Evolution v2: real "typing…" / "recording…" shown on the customer's phone
  if (url && instance) {
    const num = raw.replace(/@.*$/, "").replace(/\D/g, "") || raw;
    await fetch(`${url}/chat/sendPresence/${encodeURIComponent(instance)}`, { method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: JSON.stringify({ number: num, presence, delay: sec * 1000 }) }).catch(() => null);
    return;
  }
  const chatId = /@(lid|c\.us)$/.test(raw) ? raw : `${raw.replace(/@.*$/, "").replace(/\D/g, "")}@c.us`;
  const call = (p: string) => fetch(`${url}/api/${p}`, { method: "POST", headers: { "X-Api-Key": key, "Content-Type": "application/json" }, body: JSON.stringify({ session: "default", chatId }) }).catch(() => null);
  if (url) await call("startTyping");
  await new Promise((r) => setTimeout(r, sec * 1000));
  if (url) await call("stopTyping");
}

export async function evoSend(path: string, body: unknown) {
  const url = ((process.env["EVO_LIVE_URL"] || process.env["EVO2_API_URL"] || process.env["EVOLUTION_API_URL"]))!.replace(/\/$/, "");
  const key = (process.env["EVO_LIVE_KEY"] || process.env["EVO2_API_KEY"] || process.env["EVOLUTION_API_KEY"])!;
  // WAHA server support
  const probe = await fetch(`${url}/api/sessions`, { headers: { "X-Api-Key": key } }).catch(() => null);
  if (probe?.ok) {
    const b = body as { number?: string; text?: string; audio?: string };
    const raw = String(b.number ?? "");
    // Keep WAHA chat ids as-is (@lid / @c.us); plain numbers become @c.us
    const chatId = /@(lid|c\.us)$/.test(raw) ? raw : `${raw.replace(/@.*$/, "").replace(/\D/g, "")}@c.us`;
    const isAudio = path.includes("Audio");
    // Show "recording audio…" for ~3s before a voice note (best effort)
    if (isAudio) {
      await fetch(`${url}/api/default/presence`, { method: "POST", headers: { "X-Api-Key": key, "Content-Type": "application/json" }, body: JSON.stringify({ chatId, presence: "recording" }) }).catch(() => null);
      await new Promise((r) => setTimeout(r, 3000));
    }
    const w = await fetch(`${url}/api/${isAudio ? "sendVoice" : "sendText"}`, {
      method: "POST",
      headers: { "X-Api-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify(isAudio
        ? { session: "default", chatId, file: { mimetype: "audio/ogg; codecs=opus", data: String(b.audio ?? "").replace(/^data:[^,]+,/, "") }, convert: true }
        : { session: "default", chatId, text: b.text }),
    });
    if (!w.ok) throw new Error(`waha ${w.status}: ${(await w.text()).slice(0, 200)}`);
    return;
  }
  // Evolution v2: show "recording…" for ~3s before a voice note (best effort)
  if (path.includes("Audio")) {
    const inst = path.split("/").pop() ?? "";
    const num = String((body as { number?: string }).number ?? "");
    await fetch(`${url}/chat/sendPresence/${inst}`, { method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: JSON.stringify({ number: num, presence: "recording", delay: 3000 }) }).catch(() => null);
  }
  const r = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`evo ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

/**
 * Kingdom brains reply for a merchant on a platform, honoring their usage toggles
 * (defaults: auto_reply + whatsapp on) and their overrides (edit, delete, add info, own replies).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function kingdomAutoReply(db: any, ownerId: string, text: string, platform = "whatsapp"): Promise<{ reply: string; textOnly: boolean } | null> {
  const { data: brains } = await db.from("brains").select("id, store_id, library_tag").eq("is_kingdom", true).neq("library_tag", "").limit(20);
  if (!brains?.length) return null;
  const { data: usage } = await db.from("merchant_brain_usage").select("toggle_key, is_active").eq("merchant_id", ownerId);
  const u: Record<string, boolean> = Object.fromEntries((usage ?? []).map((r: { toggle_key: string; is_active: boolean }) => [r.toggle_key, r.is_active]));
  const on = (b: string, k: string, def: boolean) => u[`${b}:${k}`] ?? def;
  let best: { s: number; reply: string; brain: string } | null = null;
  for (const b of brains as { id: string; store_id: string; library_tag: string }[]) {
    if (!on(b.id, "use:auto_reply", true) || !on(b.id, `platform:${platform}`, platform === "whatsapp")) continue;
    const [{ data: lib }, { data: ov }] = await Promise.all([
      db.from("reply_library").select("id, trigger_text, reply_text").eq("store_id", b.store_id).eq("tag", b.library_tag).limit(2000),
      db.from("merchant_brain_overrides").select("type, content").eq("merchant_id", ownerId).eq("mother_brain_id", b.id).eq("type", "add_reply"),
    ]);
    const rows = [
      ...(ov ?? []).map((o: { content: string }, i: number) => { const [t, r] = o.content.split("||"); return { id: `m${i}`, trigger_text: t ?? "", response_text: r ?? "", use_count: 0 }; }),
      ...(lib ?? []).map((r: { id: string; trigger_text: string; reply_text: string }) => ({ id: r.id, trigger_text: r.trigger_text, response_text: r.reply_text, use_count: 0 })),
    ];
    const hit = bestRule(text, rows);
    if (hit && hit.score >= 0.55 && (!best || hit.score > best.s)) best = { s: hit.score, reply: hit.rule.response_text, brain: b.id };
  }
  if (!best) return null;
  const { data: ov } = await db.from("merchant_brain_overrides").select("type, content").eq("merchant_id", ownerId).eq("mother_brain_id", best.brain).order("created_at");
  let reply = best.reply;
  for (const o of ov ?? []) if (o.type === "edit_response") { const [f, t] = o.content.split("||"); if (f) reply = reply.split(f).join(t ?? ""); }
  for (const o of ov ?? []) if (o.type === "delete_keyword") reply = reply.split(o.content).join("");
  reply = reply.replace(/\s{2,}/g, " ").trim();
  const adds = (ov ?? []).filter((o: { type: string }) => o.type === "add_info").map((o: { content: string }) => `• ${o.content}`);
  if (adds.length) reply += "\n" + adds.join("\n");
  return { reply, textOnly: on(best.brain, "voice:text_only", false) };
}

/** Welcome text for a first-time sender if the merchant turned on "welcome" for any kingdom brain. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function kingdomWelcome(db: any, ownerId: string, storeName: string): Promise<string | null> {
  const { data: usage } = await db.from("merchant_brain_usage").select("toggle_key, reply_id, is_active").eq("merchant_id", ownerId).eq("is_active", true);
  const rows = (usage ?? []) as { toggle_key: string; reply_id: string | null }[];
  const pinned = rows.find((r) => r.reply_id && r.toggle_key.endsWith(":welcome"));
  if (pinned) {
    const { data } = await db.from("reply_library").select("reply_text").eq("id", pinned.reply_id).maybeSingle();
    if (data?.reply_text) return data.reply_text;
  }
  if (rows.some((r) => r.toggle_key.endsWith(":use:welcome"))) return `حياك الله في ${storeName} 🌷 كيف أقدر أخدمك؟`;
  return null;
}

/** Customer voice note -> text, or customer photo -> short business-oriented description. Returns "" on any failure. */
export async function mediaToText(url: string, mime: string): Promise<string> {
  try {
    const gw = process.env["LOVABLE_API_KEY"];
    if (!gw) return "";
    const base = (process.env["EVOLUTION_API_URL"] ?? "").replace(/\/$/, "");
    const path = new URL(url, base || "http://x").pathname;
    const res = await fetch(base ? base + path : url, { headers: { "X-Api-Key": process.env["EVOLUTION_API_KEY"] ?? "" } });
    if (!res.ok) return "";
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!buf.length || buf.length > 8 * 1024 * 1024) return "";
    const type = mime || res.headers.get("content-type") || "";
    if (type.startsWith("audio/")) {
      const form = new FormData();
      form.append("model", "openai/gpt-transcribe");
      form.append("file", new File([buf], "voice.ogg", { type: type.split(";")[0] ?? "audio/ogg" }));
      form.append("response_format", "json");
      form.append("language", "ar");
      const r = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${gw}` }, body: form });
      if (!r.ok) return "";
      return String(((await r.json()) as { text?: string }).text ?? "").trim().slice(0, 1000);
    }
    if (type.startsWith("image/")) {
      let bin = ""; for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
      const r = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
        method: "POST",
        headers: { "Lovable-API-Key": gw, Authorization: `Bearer ${gw}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
        body: JSON.stringify({
          model: "openai/gpt-6-astra", stream: true, store: false, reasoning: { effort: "low" },
          instructions: "صف الصورة التي أرسلها زبون المتجر بجملة أو جملتين بالعربية (منتج، مقاس، عيب، إيصال دفع، إلخ) بدون مقدمات.",
          input: [{ role: "user", content: [{ type: "input_text", text: "ماذا في هذه الصورة؟" }, { type: "input_image", image_url: `data:${type.split(";")[0]};base64,${btoa(bin)}` }] }],
        }),
      });
      if (!r.ok || !r.body) return "";
      const reader = r.body.getReader(); const dec = new TextDecoder(); let b = "", out = "";
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        b += dec.decode(value, { stream: true }); const ls = b.split("\n"); b = ls.pop() ?? "";
        for (const l of ls) { if (!l.startsWith("data:")) continue; try { const j = JSON.parse(l.slice(5)); if (j.type === "response.output_text.delta") out += j.delta ?? ""; } catch { /* skip */ } }
      }
      return out.trim().slice(0, 500);
    }
  } catch (e) { console.error("mediaToText", e); }
  return "";
}
