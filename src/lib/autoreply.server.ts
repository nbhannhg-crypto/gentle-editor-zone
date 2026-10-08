import Fuse from "fuse.js";

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
  const qw = q.split(" ");
  let best: { rule: Rule; score: number } | null = null;
  for (const { r, n } of items) {
    if (!n) continue;
    const tw = n.split(" ");
    const contains = q.includes(n) || n.includes(q) ? 0.95 : 0;
    const overlap = (tw.filter((w) => qw.some((x) => x.includes(w) || w.includes(x))).length / tw.length) * 0.85;
    const score = Math.max(contains, overlap, fs.get(r.id) ?? 0);
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

export async function evoSend(path: string, body: unknown) {
  const url = process.env["EVOLUTION_API_URL"]!.replace(/\/$/, "");
  const r = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { apikey: process.env["EVOLUTION_API_KEY"]!, "Content-Type": "application/json" },
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
