// Server-only AI key rotation: Gemini keys (round-robin) → OpenRouter → null (caller falls back to built-in AI).
// Keys live in server secrets GEMINI_KEYS (comma-separated) and OPENROUTER_KEY — never in code or the browser.

const GREETINGS: [RegExp, string][] = [
  [/^(السلام|سلام)/, "وعليكم السلام ورحمة الله، حياك الله 🌷 كيف أقدر أخدمك؟"],
  [/^(مرحبا|مرحبه|هلا|اهلا|أهلا|هاي)/, "هلا والله وغلا 🌷 كيف أقدر أخدمك؟"],
  [/^(شكرا|شكراً|مشكور|يعطيك العافيه|يعطيك العافية)/, "العفو، تحت أمرك دايم 🌷"],
  [/^مساء/, "مساء النور والسرور 🌷 كيف أقدر أخدمك؟"],
  [/^صباح/, "صباح النور 🌷 كيف أقدر أخدمك؟"],
];

/** Fixed reply for short greetings (no AI cost), or null. */
export function quickGreeting(text: string): string | null {
  const t = text.trim().replace(/[!.,؟?،\s]+$/g, "");
  if (t.length > 25) return null;
  for (const [re, reply] of GREETINGS) if (re.test(t)) return reply;
  return null;
}

let cursor = 0;

function geminiKeys(): string[] {
  const keys = (process.env["GEMINI_KEYS"] ?? "").split(/[,،;\s]+/).map((k) => k.trim()).filter(Boolean);
  if (!keys.length) console.error("[ai-keys] GEMINI_KEYS is empty or missing in server secrets — 0 free keys loaded");
  return keys;
}

async function callGemini(key: string, system: string, prompt: string): Promise<{ ok: true; text: string } | { ok: false; quota: boolean }> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[ai-keys] Gemini rejected: ${res.status} ${body.slice(0, 300)}`);
    const quota = res.status === 429 || /quota|exhausted|rate/i.test(body) || res.status === 403 || res.status === 400;
    return { ok: false, quota };
  }
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  return text ? { ok: true, text } : { ok: false, quota: false };
}

async function callOpenRouter(system: string, prompt: string): Promise<string | null> {
  const key = process.env["OPENROUTER_KEY"];
  if (!key) return null;
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4.5",
      max_tokens: 1500,
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
    }),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return j.choices?.[0]?.message?.content?.trim() || null;
}

/**
 * Tries each Gemini key in rotation, then OpenRouter.
 * Returns null when no external key works, so the caller keeps its original AI path (nothing breaks).
 */
export async function getAIResponse(system: string, prompt: string): Promise<string | null> {
  const keys = geminiKeys();
  for (let i = 0; i < keys.length; i++) {
    const idx = cursor++ % keys.length;
    try {
      const r = await callGemini(keys[idx]!, system, prompt);
      if (r.ok) return r.text;
    } catch { /* network error → next key */ }
  }
  try { return await callOpenRouter(system, prompt); } catch { return null; }
}

type GPart = { text: string } | { inlineData: { mimeType: string; data: string } };
type GContent = { role: "user" | "model"; parts: GPart[] };

/** JSON-mode Gemini call with key rotation (supports images). Returns null when no key works. */
export async function geminiJson(system: string, contents: GContent[]): Promise<string | null> {
  const keys = geminiKeys();
  for (let i = 0; i < keys.length; i++) {
    const key = keys[cursor++ % keys.length]!;
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { responseMimeType: "application/json" } }),
      });
      if (!res.ok) { console.error(`[ai-keys] Gemini key #${i + 1} rejected: ${res.status} ${(await res.text().catch(() => "")).slice(0, 300)}`); continue; }
      const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
      if (text) { try { JSON.parse(text); return text; } catch { /* next key */ } }
    } catch { /* next key */ }
  }
  return null;
}

/** Free Gemini (key rotation) for image/audio -> Arabic text. Returns "" when no key works. */
export async function geminiMedia(instruction: string, mimeType: string, base64: string): Promise<string> {
  const keys = geminiKeys();
  for (let i = 0; i < keys.length; i++) {
    const key = keys[cursor++ % keys.length]!;
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: instruction }, { inlineData: { mimeType, data: base64 } }] }] }),
      });
      if (!res.ok) { console.error(`[ai-keys] Gemini key #${i + 1} rejected: ${res.status} ${(await res.text().catch(() => "")).slice(0, 300)}`); continue; }
      const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
      if (text) return text;
    } catch { /* next key */ }
  }
  return "";
}
