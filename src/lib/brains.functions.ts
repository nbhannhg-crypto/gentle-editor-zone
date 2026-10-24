import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SPECIALISTS } from "@/lib/brains";
import { geminiJson } from "@/lib/ai-keys.server";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["specialist", "reply", "tab", "create_brain", "voice_text"],
  properties: {
    specialist: { type: "string", enum: SPECIALISTS.map((s) => s.id) },
    reply: { type: "string" },
    tab: { type: "string" },
    voice_text: { type: "string" },
    create_brain: {
      anyOf: [
        { type: "null" },
        {
          type: "object", additionalProperties: false,
          required: ["name", "emoji", "specialty", "source", "instructions", "knowledge"],
          properties: {
            name: { type: "string" }, emoji: { type: "string" }, specialty: { type: "string" },
            source: { type: "string", enum: ["ai", "library", "both"] },
            instructions: { type: "string" }, knowledge: { type: "string" },
          },
        },
      ],
    },
  },
};

async function streamJson(instructions: string, input: unknown[]): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI key missing");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Lovable-API-Key": key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra", stream: true, store: false, reasoning: { effort: "low" }, instructions, input,
      text: { format: { type: "json_schema", name: "brain", strict: true, schema: SCHEMA } },
    }),
  });
  if (res.status === 402) throw new Error("رصيد الذكاء في المنصة خلص مؤقتاً");
  if (res.status === 429) throw new Error("ضغط كبير، جرّب بعد ثواني");
  if (!res.ok || !res.body) throw new Error(`AI ${res.status}`);
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
  return out;
}

export const brainChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(6000) })).min(1).max(24),
    image: z.string().max(6_000_000).startsWith("data:image/").optional(),
    brainId: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: st } = await sb.from("stores").select("id, name, business_type, bio").eq("owner_id", context.userId).limit(1).maybeSingle();
    if (!st) throw new Error("ما لقينا متجرك");
    const cost = data.image ? 3 : 2;
    const { error } = await sb.rpc("spend_points", { _store: st.id, _amount: cost, _reason: "مصنع العقول" });
    if (error) throw new Error(error.message.includes("insufficient") ? "رصيدك ما يكفي — اشحن من المحفظة" : error.message);

    const [{ data: products }, { data: rules }, { data: mine }, { data: services }] = await Promise.all([
      sb.from("products").select("name, price").eq("store_id", st.id).limit(40),
      sb.from("training_rules").select("trigger_text, response_text").eq("store_id", st.id).limit(60),
      sb.from("brains").select("id, name, emoji, specialty, source, instructions, knowledge, uses").eq("store_id", st.id).limit(30),
      sb.from("brain_services").select("name, emoji, guide, price_points").eq("active", true).limit(40),
    ]);
    const active0 = data.brainId ? (mine ?? []).find((b) => b.id === data.brainId) : undefined;
    if (active0) await sb.from("brains").update({ uses: (active0.uses ?? 0) + 1 }).eq("id", active0.id).then(() => undefined);
    let active = active0;
    if (active0) {
      const { data: meta } = await sb.from("brains").select("library_tag").eq("id", active0.id).maybeSingle();
      const tag = meta?.library_tag ?? "";
      if (tag) {
        const lastQ = data.history[data.history.length - 1]?.content.slice(0, 40) ?? "";
        const word = lastQ.split(/\s+/).find((w) => w.length > 2) ?? "";
        const w = word.replace(/[%_,()]/g, "");
        let lib: { trigger_text: string; reply_text: string }[] | null;
        if (tag === "__rules__") {
          let q = sb.from("training_rules").select("trigger_text, response_text").eq("store_id", st.id).limit(50);
          if (w) q = q.ilike("trigger_text", `%${w}%`);
          lib = ((await q).data ?? []).map((r) => ({ trigger_text: r.trigger_text, reply_text: r.response_text }));
        } else {
          let q = sb.from("reply_library").select("trigger_text, reply_text").eq("store_id", st.id).eq("tag", tag).limit(50);
          if (w) q = q.ilike("trigger_text", `%${w}%`);
          lib = (await q).data;
        }
        if (lib?.length) active = { ...active0, knowledge: `${active0.knowledge}\nمكتبة الردود (${tag}): ${lib.map((r) => `[${r.trigger_text} ← ${r.reply_text}]`).join(" ")}` };
      }
    }

    const instructions = `أنت "مصنع العقول" في منصة مملكة المبيعات — نظام عقول ذكية خارقة يفهم أي أمر كأنه موظف بشري ذكي جداً ما يغلط.
تخدم التاجر باللهجة السعودية البيضاء، مختصر وعملي وواضح بنقاط.
لكل رسالة: اختر العقل المتخصص المناسب (specialist) وتكلم بشخصيته ("هلا أنا عقل ... متخصص في ...") في أول رد له فقط، ثم نفّذ الطلب مباشرة: علّمه خطوة بخطوة، أو اكتب الرد الجاهز، أو اعرض الخيارات.
العقول المتاحة:
${SPECIALISTS.map((s) => `- ${s.id}: ${s.emoji} ${s.name} — ${s.job}`).join("\n")}
${(services ?? []).length ? `خدمات إضافية أضافها مالك المنصة:\n${(services ?? []).map((s) => `- ${s.emoji} ${s.name}: ${s.guide} (${s.price_points} نقطة)`).join("\n")}` : ""}
قواعد:
- tab: اسم الصفحة اللي يحتاج يفتحها لينفذ بنفسه، من: train, kcall, channels, customers, campaigns, deals, appointments, products, wallet, bots, profile, studio — أو "" إذا ما يحتاج.
- voice_text: إذا طلب رسالة صوتية أو قال "سمعني" اكتب النص اللي ينقال بالصوت (قصير، سعودي)، وإلا "".
- create_brain: إذا طلب "ابي عقل ..." وأنت جمعت معلومات كافية (اسأله سؤال أو سؤالين ذكية أولاً إذا ناقص: وش يبيع، أسلوب الرد، مصدر الرد ذكاء/مكتبته/الاثنين) أنشئ العقل بتعليمات كاملة ومعرفة مفصلة. وإلا null.
- إذا أرسل صورة محادثة: اقرأها كاملة، لخص وش صار بسطر، ثم اكتب الرد التالي المثالي جاهز للنسخ والإرسال.
- إذا طلب تنفيذ شي يحتاج ربط رسمي (رد فعلي في تيك توك مثلاً) وضّح الخطوة وافتح الصفحة المناسبة، لا تدّعي أنك أرسلت.
- لا تقل أبداً إنك ذكاء اصطناعي أو اسم أي شركة تقنية.
المتجر: ${st.name} (${st.business_type}) ${st.bio}
المنتجات: ${(products ?? []).map((p) => `${p.name} ${p.price} ريال`).join("، ") || "ما أضاف"}
ردود محفوظة: ${(rules ?? []).slice(0, 40).map((r) => `[${r.trigger_text} ← ${r.response_text}]`).join(" ") || "لا يوجد"}
عقول التاجر الخاصة: ${(mine ?? []).map((b) => `${b.emoji} ${b.name}`).join("، ") || "ما أنشأ بعد"}
${active ? `\n⚠️ التاجر الآن يكلم عقله الخاص "${active.emoji} ${active.name}". التزم بتعليماته: ${active.instructions}\nمعرفته: ${active.knowledge}\nمصدر الرد: ${active.source === "library" ? "من الردود المحفوظة والمعرفة فقط، لا تخترع" : active.source === "ai" ? "ذكاء حر" : "المحفوظ أولاً ثم الذكاء"}` : ""}`;

    const input: unknown[] = data.history.map((m, i) => {
      const last = i === data.history.length - 1 && m.role === "user" && data.image;
      if (m.role === "assistant") return { role: "assistant", content: [{ type: "output_text", text: m.content }] };
      return { role: "user", content: last ? [{ type: "input_text", text: m.content || "اقرأ المحادثة وكمّلها" }, { type: "input_image", image_url: data.image }] : [{ type: "input_text", text: m.content }] };
    });
    const gContents = data.history.map((m, i) => {
      const last = i === data.history.length - 1 && m.role === "user" && data.image;
      const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [{ text: m.content || "اقرأ المحادثة وكمّلها" }];
      if (last && data.image) { const mm = /^data:([^;]+);base64,(.*)$/.exec(data.image); if (mm) parts.push({ inlineData: { mimeType: mm[1]!, data: mm[2]! } }); }
      return { role: m.role === "assistant" ? "model" as const : "user" as const, parts };
    });
    const jsonHint = `\n\nمهم جداً: إذا طلب إنشاء عقل أو مكتبة (حتى لو قال "عبّه سوالف/ردود") أنشئه فوراً بدون أسئلة إضافية إذا الموضوع واضح، واملأ "replies" بـ 25 سالفة/رد سعودي واقعي (سؤال الزبون وردك) مطابقة لشخصية العقل.\nأخرج JSON فقط بهذا الشكل: {"specialist": واحد من [${SPECIALISTS.map((s) => s.id).join(", ")}], "reply": نص, "tab": نص, "voice_text": نص, "create_brain": null أو {"name","emoji","specialty","source": "ai"|"library"|"both","instructions","knowledge","replies":[{"q":"...","a":"..."}]}}`;
    const raw = (await geminiJson(instructions + jsonHint, gContents)) ?? (() => { void input; throw new Error("المفاتيح المجانية مشغولة الحين، انتظر دقيقة وجرّب مرة ثانية"); })();
    type Out = { specialist: string; reply: string; tab: string; voice_text: string; create_brain: null | { name: string; emoji: string; specialty: string; source: string; instructions: string; knowledge: string; replies?: { q: string; a: string }[] } };
    let j: Out;
    try { j = JSON.parse(raw) as Out; } catch { throw new Error("ما وصل رد واضح، جرّب مرة ثانية"); }
    let created: { id: string; name: string; replies: number } | null = null;
    const lastUser = [...data.history].reverse().find((m) => m.role === "user")?.content ?? "";
    const wantsCreate = /(أنشئ|انشئ|انشأ|أنشأ|اصنع|سو[يّ]?\s*(لي\s*)?(عقل|مكتبة)|ابي\s*(عقل|مكتبة)\s*(جديد|خاص)|عبّ?ه|عبي)/.test(lastUser);
    if (j.create_brain && wantsCreate) {
      const b = j.create_brain;
      const tag = String(b.name || "عقل").trim().slice(0, 40);
      const { data: row, error: e2 } = await sb.from("brains").insert({
        store_id: st.id, name: String(b.name || "عقل جديد").slice(0, 60), emoji: String(b.emoji || "🧠").slice(0, 4) || "🧠", specialty: String(b.specialty || "").slice(0, 40),
        source: ["ai", "library", "both"].includes(b.source) ? b.source : "both", instructions: String(b.instructions || "").slice(0, 4000), knowledge: String(b.knowledge || "").slice(0, 6000), library_tag: tag,
      }).select("id, name").single();
      if (e2) throw new Error(e2.message);
      let n = 0;
      let reps = cleanPairs(b.replies);
      if (reps.length < 5) reps = await genPairs(String(b.name), `${b.instructions}\n${b.knowledge}`, 25).catch(() => reps);
      if (reps.length) { const { error: e3 } = await sb.from("reply_library").insert(reps.map((r) => ({ store_id: st.id, tag, trigger_text: r.q, reply_text: r.a }))); if (!e3) n = reps.length; }
      created = { ...row, replies: n };
    }
    return { specialist: j.specialist, reply: j.reply, tab: j.tab, voice_text: j.voice_text, created };
  });

function cleanPairs(x: unknown): { q: string; a: string }[] {
  if (!Array.isArray(x)) return [];
  const seen = new Set<string>();
  return x.flatMap((r) => {
    const q = String((r as { q?: unknown })?.q ?? "").trim().slice(0, 500), a = String((r as { a?: unknown })?.a ?? "").trim().slice(0, 2000);
    const k = q.replace(/\s+/g, " ");
    if (!q || !a || seen.has(k)) return [];
    seen.add(k); return [{ q, a }];
  });
}

async function genPairs(name: string, persona: string, count: number, topic = ""): Promise<{ q: string; a: string }[]> {
  const sys = `أنت كاتب ردود سعودي محترف. تكتب سوالف وردود واقعية باللهجة السعودية لعقل اسمه "${name}". شخصيته: ${persona.slice(0, 1500) || "سعودية لطيفة"}. نوّع: ترحيب، سوالف ودية، دلع، أسئلة شائعة، اعتراضات، أسعار عامة بدون اختراع أرقام، توديع. كل سؤال بكلام الزبون الطبيعي، وكل رد قصير وحي.`;
  const raw = await geminiJson(`${sys}\nأخرج JSON فقط: {"replies":[{"q":"كلام الزبون","a":"الرد"}]}`, [{ role: "user", parts: [{ text: `اكتب ${count} سالفة/رد مختلفة${topic ? ` عن: ${topic}` : ""}.` }] }]);
  if (!raw) throw new Error("المفاتيح المجانية مشغولة الحين، جرّب بعد دقيقة");
  try { return cleanPairs((JSON.parse(raw) as { replies?: unknown }).replies).slice(0, count); } catch { return []; }
}

async function myBrain(sb: any, userId: string, brainId: string) {
  const { data: st } = await sb.from("stores").select("id").eq("owner_id", userId).limit(1).maybeSingle();
  if (!st) throw new Error("ما لقينا متجرك");
  const { data: b } = await sb.from("brains").select("id, name, instructions, knowledge, library_tag, store_id, uses").eq("id", brainId).eq("store_id", st.id).maybeSingle();
  if (!b) throw new Error("العقل مو موجود");
  return { st, b: b as { id: string; name: string; instructions: string; knowledge: string; library_tag: string; store_id: string; uses: number } };
}

/** Fill a brain's library with AI-written Saudi Q/A pairs (skips duplicates). */
export const brainFill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ brainId: z.string().uuid(), topic: z.string().max(200).default(""), count: z.number().int().min(5).max(50).default(25) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { st, b } = await myBrain(sb, context.userId, data.brainId);
    const { error } = await sb.rpc("spend_points", { _store: st.id, _amount: 2, _reason: "تعبئة عقل" });
    if (error) throw new Error(error.message.includes("insufficient") ? "رصيدك ما يكفي — اشحن من المحفظة" : error.message);
    const tag = b.library_tag || b.name.slice(0, 40);
    if (!b.library_tag) await sb.from("brains").update({ library_tag: tag }).eq("id", b.id);
    const pairs = await genPairs(b.name, `${b.instructions}\n${b.knowledge}`, data.count, data.topic);
    const { data: old } = await sb.from("reply_library").select("trigger_text").eq("store_id", st.id).eq("tag", tag).limit(5000);
    const have = new Set((old ?? []).map((r: { trigger_text: string }) => r.trigger_text.replace(/\s+/g, " ").trim()));
    const fresh = pairs.filter((p) => !have.has(p.q.replace(/\s+/g, " ")));
    if (fresh.length) { const { error: e2 } = await sb.from("reply_library").insert(fresh.map((p) => ({ store_id: st.id, tag, trigger_text: p.q, reply_text: p.a }))); if (e2) throw new Error(e2.message); }
    return { added: fresh.length, skipped: pairs.length - fresh.length, tag };
  });

/** Test a brain: answers in its persona, library first. */
export const brainTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ brainId: z.string().uuid(), text: z.string().trim().min(1).max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { st, b } = await myBrain(sb, context.userId, data.brainId);
    const tag = b.library_tag || b.name.slice(0, 40);
    const words = data.text.replace(/[%_,()؟?!.]/g, " ").split(/\s+/).filter((w) => w.length > 1).slice(0, 6);
    let q = sb.from("reply_library").select("trigger_text, reply_text").eq("store_id", st.id).eq("tag", tag).limit(40);
    if (words.length) q = q.or(words.map((w) => `trigger_text.ilike.%${w}%`).join(","));
    const lib = ((await q).data ?? []) as { trigger_text: string; reply_text: string }[];
    const norm = (s: string) => s.replace(/[؟?!.،,\s]+/g, " ").trim();
    const exact = lib.find((r) => norm(r.trigger_text) === norm(data.text));
    await sb.from("brains").update({ uses: (b.uses ?? 0) + 1 }).eq("id", b.id);
    if (exact) return { reply: exact.reply_text, source: "library" as const };
    const { error } = await sb.rpc("spend_points", { _store: st.id, _amount: 2, _reason: "تجربة عقل" });
    if (error) throw new Error(error.message.includes("insufficient") ? "رصيدك ما يكفي — اشحن من المحفظة" : error.message);
    const sys = `أنت "${b.name}". التزم بشخصيتك: ${b.instructions.slice(0, 1500)}\nمعرفتك: ${b.knowledge.slice(0, 1500)}\nردود محفوظة استخدمها إذا تناسب: ${lib.slice(0, 25).map((r) => `[${r.trigger_text} ← ${r.reply_text}]`).join(" ")}\nافهم نبرة الكلام (جاد، مستفسر، عاتب، يمزح، يبي دلع) ورد بنفس الأسلوب، سعودي قصير وطبيعي. لا تخترع أسعاراً. أخرج JSON: {"reply":"..."}`;
    const raw = await geminiJson(sys, [{ role: "user", parts: [{ text: data.text }] }]);
    if (!raw) throw new Error("المفاتيح المجانية مشغولة الحين، جرّب بعد دقيقة");
    try { return { reply: String((JSON.parse(raw) as { reply?: unknown }).reply ?? ""), source: "ai" as const }; } catch { return { reply: raw, source: "ai" as const }; }
  });

export const brainVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ text: z.string().trim().min(1).max(600) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: st } = await context.supabase.from("stores").select("id").eq("owner_id", context.userId).limit(1).maybeSingle();
    if (!st) throw new Error("ما لقينا متجرك");
    const { error } = await context.supabase.rpc("spend_points", { _store: st.id, _amount: 1, _reason: "صوت العقول" });
    if (error) throw new Error(error.message.includes("insufficient") ? "رصيدك ما يكفي" : error.message);
    const { fishTts } = await import("@/lib/autoreply.server");
    return { audio: await fishTts(data.text) };
  });
