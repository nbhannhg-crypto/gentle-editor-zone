import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyNotes, scoreAudio, ttsOnce, type Db } from "./factory.server";

type Ctx = { userId: string; supabase: any };

// Only the platform owner may use the factory
async function gate(ctx: Ctx): Promise<Db> {
  const { data: ok } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!ok) throw new Error("هذا المختبر للمالك فقط");
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as unknown as Db;
}

export const factoryTry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        text: z.string().trim().min(1).max(500),
        variants: z.array(z.object({ mood: z.string().max(30).default(""), speed: z.number().min(0.6).max(1.6).default(1) })).min(1).max(3).default([
          { mood: "دلع", speed: 1 },
          { mood: "", speed: 1 },
          { mood: "حماسية", speed: 1.05 },
        ]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await gate(context as unknown as Ctx);
    const text = await applyNotes(db, data.text);
    const out: { mood: string; speed: number; score: number; heard: string; audio: string }[] = [];
    for (const v of data.variants) {
      const buf = await ttsOnce(v.mood ? `(${v.mood}) ${text}` : text, v.speed);
      const { score, heard } = await scoreAudio(buf, text);
      out.push({ mood: v.mood, speed: v.speed, score, heard, audio: `data:audio/mpeg;base64,${buf.toString("base64")}` });
    }
    return { variants: out.sort((a, b) => b.score - a.score) };
  });

export const factorySaveGolden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ text: z.string().trim().min(1).max(500), audioB64: z.string().startsWith("data:audio/").max(15_000_000), score: z.number().min(0).max(100), mood: z.string().max(30).default(""), speed: z.number().min(0.6).max(1.6).default(1) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await gate(context as unknown as Ctx);
    const buf = Buffer.from(data.audioB64.replace(/^data:audio\/[a-z]+;base64,/, ""), "base64");
    const path = `golden/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    const up = await db.storage.from("factory-audio").upload(path, buf, { contentType: "audio/mpeg" });
    if (up.error) throw new Error(up.error.message);
    const { error } = await db.from("factory_golden").insert({ text: data.text, path, score: Math.round(data.score), mood: data.mood, speed: data.speed });
    if (error) throw new Error(error.message);
    // A text that passed the check leaves the retraining queue
    await db.from("factory_retrain").update({ status: "done" }).eq("text", data.text);
    return { saved: true };
  });

export const factoryDelGolden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), path: z.string().max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await gate(context as unknown as Ctx);
    await db.storage.from("factory-audio").remove([data.path]);
    await db.from("factory_golden").delete().eq("id", data.id);
    return { ok: true };
  });

export const factoryWrong = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ text: z.string().trim().min(1).max(500), note: z.string().max(300).default("") }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await gate(context as unknown as Ctx);
    const { error } = await db.from("factory_retrain").upsert({ text: data.text, note: data.note, status: "pending" }, { onConflict: "text" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const factoryAddNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ word: z.string().trim().min(1).max(60), say: z.string().trim().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await gate(context as unknown as Ctx);
    const { error } = await db.from("factory_notes").insert({ word: data.word, say: data.say });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const factoryDelNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await gate(context as unknown as Ctx);
    await db.from("factory_notes").delete().eq("id", data.id);
    return { ok: true };
  });

export const factoryRunNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await gate(context as unknown as Ctx);
    const { runTrainingBatch } = await import("./factory.server");
    return runTrainingBatch(db, 6);
  });

export const factoryData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await gate(context as unknown as Ctx);
    const sb = (context as unknown as Ctx).supabase;
    const [g, r, n, l] = await Promise.all([
      sb.from("factory_golden").select("id, text, path, score, mood, speed, created_at").order("created_at", { ascending: false }).limit(60),
      sb.from("factory_retrain").select("id, text, note, attempts, last_score, status").eq("status", "pending").order("created_at", { ascending: false }).limit(60),
      sb.from("factory_notes").select("id, word, say").order("created_at", { ascending: false }).limit(100),
      sb.from("factory_logs").select("summary, trained, created_at").order("created_at", { ascending: false }).limit(15),
    ]);
    return { golden: g.data ?? [], retrain: r.data ?? [], notes: n.data ?? [], logs: l.data ?? [] };
  });

export const factoryPlay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await gate(context as unknown as Ctx);
    const { data: row } = await db.from("factory_golden").select("path").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("ما لقينا الصوت");
    const signed = await db.storage.from("factory-audio").createSignedUrl(row.path, 600);
    if (signed.error) throw new Error(signed.error.message);
    return { url: signed.data.signedUrl };
  });
