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

// Model fallback: if Google is busy (503/429/404) on one model, try the next — all free keys.
// Fastest stable model first (~0.8s, also handles audio); 3.5-flash / flash-latest removed — constantly 429.
// gemini-3.5-transcribe removed: always 429 on free keys and wrongly rested good keys for 60s.
const GEMINI_MODELS = ["gemini-flash-lite-latest", "gemini-3.5-flash-lite"];

// Keys that got 429 on every model rest for 60s so other keys answer instantly instead of waiting.
const resting = new Map<string, number>();

async function gemFetch(key: string, init: RequestInit): Promise<Response> {
  let last: Response | null = null;
  let all429 = true;
  for (const m of GEMINI_MODELS) {
    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(key)}`, { ...init, signal: AbortSignal.timeout(8000) });
    } catch { all429 = false; continue; } // slow model → next model, never hang
    if (res.ok) return res;
    last = res;
    if (res.status !== 429) all429 = false;
    if (res.status === 401 || res.status === 403) break; // bad key → next key
  }
  if (all429) resting.set(key, Date.now() + 60_000);
  return last ?? new Response("timeout", { status: 504 });
}

function geminiKeys(): string[] {
  const keys = (process.env["GEMINI_KEYS"] ?? "").split(/[,،;\s]+/).map((k) => k.trim()).filter(Boolean);
  if (!keys.length) console.error("[ai-keys] GEMINI_KEYS is empty or missing in server secrets — 0 free keys loaded");
  const now = Date.now();
  const fresh = keys.filter((k) => (resting.get(k) ?? 0) < now);
  return fresh.length ? fresh : keys;
}

async function callGemini(key: string, system: string, prompt: string): Promise<{ ok: true; text: string } | { ok: false; quota: boolean }> {
  const res = await gemFetch(key, {
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
export async function getAIResponse(system: string, prompt: string, fast = false): Promise<string | null> {
  const keys = geminiKeys();
  // Fast mode (live calls): race 3 Gemini keys + Groq together, first answer wins.
  if (fast && keys.length) {
    const batch = Array.from({ length: Math.min(3, keys.length) }, () => keys[cursor++ % keys.length]!);
    try {
      return await Promise.any([
        ...batch.map(async (k) => { const r = await callGemini(k, system, prompt); if (r.ok) return r.text; throw new Error("fail"); }),
        callGroqChat(system, prompt).then((g) => { if (g) return g; throw new Error("fail"); }),
      ]);
    } catch { /* fall through to normal rotation */ }
  }
  // Race 3 keys at a time: first good answer wins, so one slow/busy key never blocks the call.
  for (let tried = 0; tried < keys.length; tried += 3) {
    const batch = Array.from({ length: Math.min(3, keys.length - tried) }, () => keys[cursor++ % keys.length]!);
    try {
      return await Promise.any(batch.map(async (k) => {
        const r = await callGemini(k, system, prompt);
        if (r.ok) return r.text;
        throw new Error("fail");
      }));
    } catch { /* whole batch failed → next batch */ }
  }
  const g = await callGroqChat(system, prompt).catch(() => null);
  if (g) return g;
  try { return await callOpenRouter(system, prompt); } catch { return null; }
}

/** Groq chat fallback (Allam Saudi / Qwen) using the same Groq keys. */
async function callGroqChat(system: string, prompt: string): Promise<string | null> {
  const keys = [...new Set([process.env["GROQ_API_KEY"] ?? "", ...(process.env["GROQ_KEYS"] ?? "").split(/[,،;\s]+/)].map((k) => k.trim()).filter(Boolean))];
  for (const k of keys) for (const model of ["allam-2-7b", "qwen/qwen3.8-27b"]) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 400, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) continue;
      const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
      const t = j.choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      if (t) return t;
    } catch { /* next */ }
  }
  return null;
}

type GPart = { text: string } | { inlineData: { mimeType: string; data: string } };
type GContent = { role: "user" | "model"; parts: GPart[] };

/** JSON-mode Gemini call with key rotation (supports images). Returns null when no key works. */
export async function geminiJson(system: string, contents: GContent[]): Promise<string | null> {
  const keys = geminiKeys();
  for (let i = 0; i < keys.length; i++) {
    const key = keys[cursor++ % keys.length]!;
    try {
      const res = await gemFetch(key, {
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
export async function geminiMedia(instruction: string, mimeType: string, base64: string, gen?: Record<string, unknown>): Promise<string> {
  const keys = geminiKeys();
  for (let i = 0; i < keys.length; i++) {
    const key = keys[cursor++ % keys.length]!;
    try {
      const res = await gemFetch(key, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: instruction }, { inlineData: { mimeType, data: base64 } }] }], ...(gen ? { generationConfig: gen } : {}) }),
      });
      if (!res.ok) { console.error(`[ai-keys] Gemini key #${i + 1} rejected: ${res.status} ${(await res.text().catch(() => "")).slice(0, 300)}`); continue; }
      const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
      if (text) return text;
    } catch { /* next key */ }
  }
  return "";
}

// Groq Whisper rotation: GROQ_API_KEY plus GROQ_KEYS (comma/Arabic-comma separated).
const groqCool = new Map<string, number>();
let groqIdx = 0;
export async function groqTranscribe(fd: FormData, timeoutMs = 8000): Promise<Response | null> {
  const keys = [...new Set([process.env["GROQ_API_KEY"] ?? "", ...(process.env["GROQ_KEYS"] ?? "").split(/[,،;\s]+/)].map((k) => k.trim()).filter(Boolean))];
  if (!keys.length) return null;
  const now = Date.now();
  const start = groqIdx++ % keys.length;
  const order = keys.map((_, i) => keys[(start + i) % keys.length]!).sort((a, b) => (groqCool.get(a) ?? 0) > now ? 1 : (groqCool.get(b) ?? 0) > now ? -1 : 0);
  let last: Response | null = null;
  for (const k of order) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${k}` }, body: fd, signal: AbortSignal.timeout(timeoutMs) });
      if (r.ok) return r;
      if (r.status === 429 || r.status === 401 || r.status === 403) { groqCool.set(k, Date.now() + 30_000); last = r; continue; }
      return r;
    } catch (e) { console.error("groq key error", e); }
  }
  return last;
}
