// Saudi Voice Factory — shared generation/scoring/training logic (server only)
import { getBrandNames } from "./branding.server";
const FISH = "https://api.fish.audio";
const GATEWAY = "https://ai.gateway.lovable.dev";
export const BUILTIN_FISH_VOICE_ID = "ca005277ffeb4282961e5253b18c6280";

export const VARIANTS = [
  { mood: "دلع", speed: 1 },
  { mood: "", speed: 1 },
  { mood: "حماسية", speed: 1.05 },
];

export type Db = {
  from: (t: string) => any;
  storage: { from: (b: string) => any };
};

// Generate one voice clip with the built-in Saudi voice
export async function ttsOnce(text: string, speed: number): Promise<Buffer> {
  const key = process.env["FISH_AUDIO_API_KEY"];
  if (!key) throw new Error(`${(await getBrandNames()).voice} غير مربوط بعد`);
  const res = await fetch(`${FISH}/v1/tts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", model: "s1" },
    body: JSON.stringify({ text, reference_id: BUILTIN_FISH_VOICE_ID, format: "mp3", latency: "normal", prosody: { speed, volume: 0 } }),
  });
  if (res.status === 402 || res.status === 403) {
    const err: any = new Error(res.status === 402 ? "رصيد الأصوات خلص" : "تم رفض الوصول للأصوات");
    err.pause = true;
    throw err;
  }
  if (!res.ok) throw new Error(`تعذر توليد الصوت (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

// Transcribe the clip and score it against the target text (Arabic word coverage)
export function normalizeAr(s: string): string[] {
  return s
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[^\u0621-\u064A\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export async function scoreAudio(buf: Buffer, text: string): Promise<{ score: number; heard: string }> {
  const { geminiMedia } = await import("./ai-keys.server");
  const out = await geminiMedia("فرّغ هذا المقطع الصوتي حرفياً بالعربية. اكتب النص فقط.", "audio/mpeg", buf.toString("base64"));
  if (!out) { const err: any = new Error("المفاتيح المجانية مشغولة الحين"); err.pause = true; throw err; }
  const j = { text: out };
  const heard = String(j.text ?? "");
  const want = new Set(normalizeAr(text));
  if (!want.size) return { score: 0, heard };
  const matched = new Set(normalizeAr(heard).filter((w) => want.has(w)));
  return { score: Math.round((100 * matched.size) / want.size), heard };
}

// Apply the owner's pronunciation notes: word -> how to actually say it
export async function applyNotes(db: Db, text: string): Promise<string> {
  const { data: notes } = await db.from("factory_notes").select("word, say").limit(200);
  let out = text;
  for (const n of notes ?? []) out = out.split(String(n.word)).join(String(n.say));
  return out;
}

// One bounded training batch: try every queued text until it passes the check
export async function runTrainingBatch(db: Db, limit = 6): Promise<{ trained: number; summary: string }> {
  const { data: queue } = await db
    .from("factory_retrain")
    .select("id, text, note, attempts, status")
    .eq("status", "pending")
    .order("attempts", { ascending: true })
    .limit(limit);
  if (!queue?.length) {
    await db.from("factory_logs").insert({ summary: "لا يوجد نصوص تحتاج تدريب", trained: 0 });
    return { trained: 0, summary: "لا يوجد نصوص تحتاج تدريب" };
  }
  let trained = 0;
  const lines: string[] = [];
  let paused = false;
  for (const row of queue) {
    const text = await applyNotes(db, row.text);
    let best = { score: 0, buf: null as Buffer | null, mood: "", speed: 1 };
    for (const v of VARIANTS) {
      try {
        const buf = await ttsOnce(v.mood ? `(${v.mood}) ${text}` : text, v.speed);
        const { score, heard } = await scoreAudio(buf, text);
        if (score > best.score) best = { score, buf, mood: v.mood, speed: v.speed };
        if (best.score >= 95) break;
      } catch (e: any) {
        if (e?.pause) {
          paused = true;
          lines.push(`توقف: ${String(e.message)}`);
          break;
        }
        lines.push(`${row.text.slice(0, 18)}…: ${String(e.message)}`);
      }
    }
    if (paused) break;
    if (best.buf && best.score >= 95) {
      const path = `golden/${row.id}.mp3`;
      const up = await db.storage.from("factory-audio").upload(path, best.buf, { contentType: "audio/mpeg" });
      if (up.error) {
        lines.push(up.error.message);
      } else {
        await db.from("factory_golden").insert({ text: row.text, path, score: best.score, mood: best.mood, speed: best.speed });
        await db.from("factory_retrain").update({ status: "done", last_score: best.score }).eq("id", row.id);
        trained++;
      }
    } else {
      const attempts = (row.attempts ?? 0) + 1;
      await db
        .from("factory_retrain")
        .update({ attempts, last_score: best.score, status: attempts >= 8 ? "stuck" : "pending" })
        .eq("id", row.id);
    }
  }
  const summary = lines.length ? `دربت ${trained} من ${queue.length}. ${lines.join(" | ")}` : `دربت ${trained} من ${queue.length}.`;
  await db.from("factory_logs").insert({ summary: summary.slice(0, 900), trained });
  if (paused) await db.from("app_settings").upsert({ key: "factory_paused", value: "1" }, { onConflict: "key" });
  return { trained, summary };
}
