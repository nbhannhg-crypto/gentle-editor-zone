import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

const GATEWAY = "https://ai.gateway.lovable.dev";

const ruleSchema = z.object({ trigger: z.string().max(500), response: z.string().max(2000) });

async function askModel(system: string, prompt: string) {
  const { getAIResponse } = await import("./ai-keys.server");
  const ext = await getAIResponse(system, prompt);
  if (ext) return ext;
  const key = process.env['LOVABLE_API_KEY'];
  if (!key) throw new Error("مفتاح الذكاء غير مهيأ");
  const openai = createOpenAI({
    baseURL: `${GATEWAY}/v1`,
    apiKey: key,
    headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  const result = streamText({
    model: openai.responses("openai/gpt-6-astra"),
    system,
    prompt,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "high",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  let text = "";
  for await (const part of result.textStream) text += part;
  return text.trim();
}

function rulesBlock(rules: { trigger: string; response: string }[]) {
  return rules.map((r, i) => `${i + 1}. إذا قال الزبون: "${r.trigger}" ← الرد: "${r.response}"`).join("\n");
}

const SYSTEM = `أنتِ موظفة مبيعات سعودية محترفة وذكية اسمها "موظفة المملكة". تتكلمين باللهجة السعودية البيضاء، وتفهمين قصد الزبون حتى لو كتب بعامية أو بأخطاء إملائية أو بصوت محوّل لنص. ردودك قصيرة (جملة أو جملتين)، مقنعة، ودودة، وتلتزمين بأسلوب وتعليمات صاحب المتجر أولاً، وتتعاملين مع الاعتراضات بذكاء (السعر، التأجيل، عدم الاهتمام) بدون إلحاح مزعج.`;

export const suggestReplies = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      customer: z.string().min(1).max(1000),
      product: z.string().max(2000).default(""),
      rules: z.array(ruleSchema).max(200),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const text = await askModel(
      SYSTEM,
      `معلومات المنتج: ${data.product || "غير محددة"}\n\nتعليمات صاحب المتجر:\n${rulesBlock(data.rules) || "لا يوجد"}\n\nالزبون قال: "${data.customer}"\n\nاكتبي 3 ردود مبيعات مختلفة ومثالية، كل رد في سطر مستقل، بدون ترقيم أو شرح.`,
    );
    const replies = text.split("\n").map((l) => l.replace(/^[\s\d\-.•*)]+/, "").trim()).filter(Boolean).slice(0, 3);
    return { replies };
  });

export const smartReply = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      customer: z.string().min(1).max(1000),
      product: z.string().max(2000).default(""),
      rules: z.array(ruleSchema).max(200),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { quickGreeting } = await import("./ai-keys.server");
    const greet = quickGreeting(data.customer);
    if (greet) return { reply: greet };
    const reply = await askModel(
      SYSTEM,
      `معلومات المنتج: ${data.product || "غير محددة"}\n\nتعليمات صاحب المتجر (التزمي بها أولاً):\n${rulesBlock(data.rules) || "لا يوجد"}\n\nالزبون قال: "${data.customer}"\n\nاكتبي ردك فقط.`,
    );
    return { reply };
  });

export const speak = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ text: z.string().min(1).max(1500) }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env['LOVABLE_API_KEY'];
    if (!key) throw new Error("مفتاح الصوت غير مهيأ");
    const res = await fetch(`${GATEWAY}/v1/audio/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-tts-preview",
        contents: [{ role: "user", parts: [{ text: `قوليها بصوت أنثوي سعودي دافئ ومتحمس وبلهجة سعودية: ${data.text}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
        },
        stream_format: "audio",
      }),
    });
    if (!res.ok) throw new Error(`تعذر توليد الصوت (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    return { audio: `data:audio/wav;base64,${buf.toString("base64")}` };
  });

export const weeklyReport = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      rulesCount: z.number(),
      messages: z.array(z.string().max(500)).max(300),
      topRules: z.array(z.string().max(300)).max(20),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const report = await askModel(
      "أنتِ مستشارة مبيعات سعودية خبيرة. تحلين بيانات متجر وتكتبين تقرير أسبوعي قصير وعملي.",
      `عدد القواعد المتعلمة: ${data.rulesCount}\n\nأكثر القواعد استخداماً:\n${data.topRules.join("\n") || "لا يوجد"}\n\nآخر كلام الزبائن:\n${data.messages.slice(0, 100).join("\n") || "لا يوجد"}\n\nاكتبي تقريراً من 5 نقاط: 1) وش أكثر شي يسألون عنه 2) وش الاعتراض الأكبر 3) وش الردود اللي تنجح 4) وش ينقص الموظفة من تدريب 5) توصية واحدة ترفع المبيعات هذا الأسبوع. بدون مقدمات.`,
    );
    return { report };
  });

/* ---------------- عقل الملكة ---------------- */
const BRAIN_SYSTEM = `أنتِ "عقل الملكة"، المساعدة الذكية داخل منصة "مملكة المبيعات". تتكلمين سعودي بلطف واختصار. تعرفين كل أقسام المنصة:
- train: علّم الموظفة (قواعد: إذا قال الزبون… ردي…)
- call: المكالمة المباشرة
- voice: الصوت
- channels: القنوات (whatsapp, instagram, telegram, messenger, tiktok, snapchat, x) وكل منصة تقبل أكثر من حساب
- customers: الزبائن
- products: المنتجات والأسعار
- wallet: محفظة الذهب (رصيد النقاط والشحن اليدوي بالتحويل)
- dash: لوحة الأداء
- kcall: مكالمة المملكة (شاشة اتصال بصورة الموظفة ونبرة الصوت)
- bots: فريق البوتات (مبيعات، متابعة، تسويق، منشورات، دعم، تصميم، تسعير، مدربة)
- profile: ملف البائعة ونوع نشاطها ورابط صفحة متجرها العامة
- deals: عين الصفقة (تحليل المحادثات: هل تم البيع + نصائح)
- campaigns: حملات المملكة (إرسال عروض واتساب لكل الزبائن دفعة واحدة)
- appointments: مواعيد المملكة (حجز وإدارة مواعيد الزبائن)
تنفذين أوامر التاجر فوراً. إذا قال "علميني" أو كان جديد، اسأليه سؤال واحد كل مرة عن نشاطه ومنتجاته وأسعاره والأسئلة الشائعة، وحوّلي إجاباته إلى منتجات وقواعد بنفسك.
أرجعي JSON فقط بالشكل: {"reply":"نص الرد","actions":[...]}
الأفعال المتاحة:
{"type":"add_rule","trigger":"...","response":"..."}
{"type":"add_product","name":"...","price":0,"description":"..."}
{"type":"add_channel","platform":"whatsapp","label":"..."}
{"type":"go_tab","tab":"products"}
لا تخترعي أسعار ما قالها التاجر.`;

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("add_rule"), trigger: z.string().min(1).max(500), response: z.string().min(1).max(2000) }),
  z.object({ type: z.literal("add_product"), name: z.string().min(1).max(200), price: z.coerce.number().min(0).max(10_000_000).default(0), description: z.string().max(1000).default("") }),
  z.object({ type: z.literal("add_channel"), platform: z.enum(["whatsapp", "instagram", "telegram", "messenger", "tiktok", "snapchat", "x"]), label: z.string().min(1).max(100) }),
  z.object({ type: z.literal("go_tab"), tab: z.enum(["train", "call", "kcall", "voice", "channels", "customers", "products", "wallet", "dash", "bots", "profile", "deals", "campaigns", "appointments"]) }),
]);

export const queenBrain = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1).max(20),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const convo = data.history.map((m) => `${m.role === "user" ? "التاجر" : "عقل الملكة"}: ${m.content}`).join("\n");
    const raw = await askModel(BRAIN_SYSTEM, `المحادثة:\n${convo}\n\nأرجعي JSON فقط.`);
    const m = raw.match(/\{[\s\S]*\}/);
    try {
      const j = JSON.parse(m ? m[0] : raw) as { reply?: unknown; actions?: unknown[] };
      const actions = (Array.isArray(j.actions) ? j.actions : []).flatMap((a) => {
        const p = actionSchema.safeParse(a);
        return p.success ? [p.data] : [];
      }).slice(0, 20);
      return { reply: typeof j.reply === "string" ? j.reply : "", actions };
    } catch {
      return { reply: raw, actions: [] };
    }
  });

/* ---------------- عين الصفقة ---------------- */
export const analyzeDeal = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      conversation: z.array(z.object({ who: z.enum(["c", "a"]), t: z.string().max(1000) })).min(1).max(100),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const convo = data.conversation.map((m) => `${m.who === "c" ? "الزبون" : "الموظفة"}: ${m.t}`).join("\n");
    const raw = await askModel(
      "أنتِ محللة مبيعات سعودية خبيرة. تحلين محادثة بيع وتحكمين على نتيجتها بدقة. أرجعي JSON فقط.",
      `المحادثة:\n${convo}\n\nأرجعي JSON فقط بالشكل: {"verdict":"sold|hot|cold|lost","score":0-100,"summary":"جملة واحدة","tips":["نصيحة1","نصيحة2"]}\nverdict: sold=تم البيع، hot=مهتم جداً، cold=متردد، lost=رفض.`,
    );
    const m = raw.match(/\{[\s\S]*\}/);
    try {
      const j = JSON.parse(m ? m[0] : raw);
      const verdict = ["sold", "hot", "cold", "lost"].includes(j.verdict) ? j.verdict : "cold";
      return {
        verdict: verdict as "sold" | "hot" | "cold" | "lost",
        score: Math.max(0, Math.min(100, Number(j.score) || 0)),
        summary: typeof j.summary === "string" ? j.summary : "",
        tips: Array.isArray(j.tips) ? j.tips.filter((t: unknown) => typeof t === "string").slice(0, 3) : [],
      };
    } catch {
      return { verdict: "cold" as const, score: 50, summary: raw.slice(0, 200), tips: [] };
    }
  });

export const lieCheck = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      conversation: z.array(z.object({ who: z.enum(["c", "a"]), t: z.string().max(1000) })).min(1).max(100),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const convo = data.conversation.map((m) => `${m.who === "c" ? "الزبون" : "الموظفة"}: ${m.t}`).join("\n");
    const raw = await askModel(
      "أنتِ خبيرة كشف تلاعب الزبائن في المبيعات السعودية. تكشفين المبالغة والوعود المشبوهة والتناقض في كلام الزبون. أرجعي JSON فقط.",
      `المحادثة:\n${convo}\n\nحللي كلام الزبون فقط: هل فيه تناقض؟ مبالغة؟ علامات تلاعب أو كذب (مثل "شفته أرخص" بدون دليل، تغيير الكلام، استعجال مشبوه)؟\nأرجعي JSON فقط: {"risk":"low|mid|high","signals":["علامة1","علامة2"],"advice":"نصيحة واحدة للموظفة كيف تتعامل معه"}\nrisk: low=كلامه طبيعي، mid=فيه علامات تحتاج انتباه، high=غالباً يتلاعب.`,
    );
    const m = raw.match(/\{[\s\S]*\}/);
    try {
      const j = JSON.parse(m ? m[0] : raw);
      const risk = ["low", "mid", "high"].includes(j.risk) ? j.risk : "low";
      return {
        risk: risk as "low" | "mid" | "high",
        signals: Array.isArray(j.signals) ? j.signals.filter((s: unknown) => typeof s === "string").slice(0, 4) : [],
        advice: typeof j.advice === "string" ? j.advice : "",
      };
    } catch {
      return { risk: "low" as const, signals: [], advice: raw.slice(0, 200) };
    }
  });

/* ---------------- Fish Audio ---------------- */
const FISH = "https://api.fish.audio";
const BUILTIN_FISH_VOICE_ID = "ca005277ffeb4282961e5253b18c6280";

export const fishStatus = createServerFn({ method: "GET" }).handler(async () => ({
  connected: Boolean(process.env['FISH_AUDIO_API_KEY']),
}));

export const fishVoices = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ q: z.string().max(100).default(""), lang: z.string().max(10).default("ar") }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env['FISH_AUDIO_API_KEY'];
    if (!key) return { voices: [] as FishVoice[] };
    const { getBrandNames } = await import("./branding.server");
    const brand = await getBrandNames();
    const u = new URL(`${FISH}/model`);
    u.searchParams.set("page_size", "30");
    u.searchParams.set("sort_by", "score");
    if (data.lang) u.searchParams.set("language", data.lang);
    if (data.q) u.searchParams.set("title", data.q);
    const res = await fetch(u, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`تعذر جلب أصوات ${brand.voice} (${res.status})`);
    const j = (await res.json()) as { items?: any[] };
    const voices: FishVoice[] = (j.items ?? []).map((m) => ({
      id: String(m._id), title: String(m.title ?? ""), cover: m.cover_image ? `https://public-platform.r2.fish.audio/${m.cover_image}` : "",
      tags: (m.tags ?? []).slice(0, 3), likes: m.like_count ?? 0,
    }));
    return { voices };
  });

type FishVoice = { id: string; title: string; cover: string; tags: string[]; likes: number };

/** Look up any external voice by its ID (for "link a voice by ID"). */
export const fishVoiceInfo = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().trim().regex(/^[a-zA-Z0-9_-]{6,64}$/, "المعرّف غير صحيح") }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env['FISH_AUDIO_API_KEY'];
    if (!key) throw new Error("خدمة الأصوات غير مربوطة");
    const res = await fetch(`${FISH}/model/${data.id}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(res.status === 404 ? "ما لقينا صوت بهذا المعرّف" : `تعذر فحص الصوت (${res.status})`);
    const m: any = await res.json();
    return { id: String(m._id ?? data.id), title: String(m.title ?? "صوت خارجي"), cover: m.cover_image ? `https://public-platform.r2.fish.audio/${m.cover_image}` : "" };
  });

/** Create a private custom voice from a 15-30s sample (base64 data URL). */
export const fishClone = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ name: z.string().trim().min(1).max(60), audio: z.string().min(100).max(15_000_000), priv: z.boolean().default(true) }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env['FISH_AUDIO_API_KEY'];
    if (!key) throw new Error("خدمة الأصوات غير مربوطة");
    const m = data.audio.match(/^data:([^;,]+)[^,]*,(.*)$/);
    if (!m) throw new Error("ملف الصوت غير صالح");
    const mime = m[1] ?? "audio/webm";
    const buf = Buffer.from(m[2] ?? "", "base64");
    const form = new FormData();
    form.append("type", "tts");
    form.append("train_mode", "fast");
    form.append("title", data.name);
    form.append("visibility", data.priv ? "private" : "unlist");
    form.append("voices", new Blob([new Uint8Array(buf)], { type: mime }), `sample.${mime.split("/")[1]?.split(";")[0] || "webm"}`);
    const res = await fetch(`${FISH}/model`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
    if (!res.ok) throw new Error(res.status === 402 ? "رصيد الأصوات خلص" : `تعذر الاستنساخ (${res.status}): ${(await res.text()).slice(0, 150)}`);
    const j: any = await res.json();
    return { id: String(j._id), title: String(j.title ?? data.name) };
  });

export const fishSpeak = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      text: z.string().min(1).max(1500),
      voiceId: z.string().max(100),
      speed: z.number().min(0.5).max(2).default(1),
      volume: z.number().min(-10).max(10).default(0),
      emotion: z.string().max(30).default(""),
      custom: z.boolean().default(false),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { getBrandNames } = await import("./branding.server");
    const brand = await getBrandNames();
    const key = process.env['FISH_AUDIO_API_KEY'];
    if (!key) throw new Error(`${brand.voice} غير مربوط بعد`);
    const voiceId = data.custom && data.voiceId ? data.voiceId : BUILTIN_FISH_VOICE_ID;
    const res = await fetch(`${FISH}/v1/tts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", model: "s1" },
      body: JSON.stringify({
        text: data.emotion ? `(${data.emotion}) ${data.text}` : data.text,
        reference_id: voiceId,
        format: "mp3",
        latency: "normal",
        prosody: { speed: data.speed, volume: data.volume },
      }),
    });
    if (!res.ok) {
      const msg = res.status === 402 ? `رصيد ${brand.voice} خلص` : res.status === 401 ? `مفتاح ${brand.voice} غير صحيح` : `تعذر توليد الصوت (${res.status})`;
      throw new Error(msg);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { audio: `data:audio/mpeg;base64,${buf.toString("base64")}` };
  });

/* ---------------- عقول الإلهام ---------------- */
const MAGIC: Record<string, string> = {
  intent: `اقرئي رسالة الزبون (طريقة الكتابة، المد، الإيموجي، الأسئلة). أرجعي JSON فقط: {"level":"hot|warm|cold","label":"جملة قصيرة مثل: بيشتري اضغطي عليه","why":"السبب","reply":"أفضل رد سعودي مقترح"}`,
  objection: `الزبون/الزبونة عندها عذر يمنعها من الشراء (مثل: زوجي ما يخليني، ما عندي فلوس الحين، بفكر). اكتبي 3 ردود سعودية لطيفة وصادقة بدون كذب أو خداع تحترم قرارها وتفتح باب الشراء. أرجعي JSON فقط: {"label":"تحليل العذر بجملة","why":"","reply":"الرد 1\\n\\nالرد 2\\n\\nالرد 3"}`,
  dream: `الموظفة تحكي حلم أو إحساس أو مزاجها اليوم. حوليه بلطف ومرح لخطة بيع ليوم واحد (3 خطوات عملية). لا تدعي تفسير غيبي. أرجعي JSON فقط: {"label":"عنوان ملهم للخطة","why":"","reply":"الخطة بخطوات"}`,
  meeting: `أنتِ اجتماع العقول اليومي: عقل المبيعات، التسويق، التصميم، الدعم، النشر، المراجعة، المحتوى، الملكة. بناءً على معلومات التاجرة، اكتبي محضر اجتماع قصير: كل عقل يقول جملة، ثم القرار: على أي منتج نركز اليوم وثلاث مهام. أرجعي JSON فقط: {"label":"قرار اليوم بجملة","why":"","reply":"المحضر"}`,
  tutor: `أنتِ معلمة سعودية حنونة تشرح واجب الطفل خطوة خطوة بلهجة سعودية بسيطة، ولا تعطين الحل مباشرة بل توجهين الطفل ثم تذكرين الجواب بالنهاية. أرجعي JSON فقط: {"label":"عنوان الدرس","why":"","reply":"الشرح"}`,
};
export const magicBrain = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ kind: z.enum(["intent", "objection", "dream", "meeting", "tutor"]), text: z.string().min(1).max(3000) }).parse(d))
  .handler(async ({ data }) => {
    const raw = await askModel(`أنتِ من عقول مملكة المبيعات. ${MAGIC[data.kind]}`, data.text);
    const m = raw.match(/\{[\s\S]*\}/);
    try {
      const j = JSON.parse(m ? m[0] : raw);
      return { level: ["hot", "warm", "cold"].includes(j.level) ? j.level as string : "", label: String(j.label ?? ""), why: String(j.why ?? ""), reply: String(j.reply ?? "") };
    } catch { return { level: "", label: "", why: "", reply: raw }; }
  });

/* ---------------- مغيّر الصوت: تنقية كلام التاجر وصياغته بأسلوب الموظفة ---------------- */
export const polishSpeech = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ text: z.string().min(1).max(1500), dialect: z.string().max(60).default(""), persona: z.string().max(1000).default("") }).parse(d),
  )
  .handler(async ({ data }) => {
    const out = await askModel(
      "أنتِ موظفة مبيعات. أعيدي صياغة كلام صاحب المتجر بأسلوبك أنتِ كأنك المتحدثة، بنفس المعنى بالضبط، بدون تأتأة أو تكرار أو حشو. لا تضيفي معلومات جديدة. أرجعي الجملة فقط.",
      `اللهجة: ${data.dialect || "سعودية"}\nالشخصية: ${data.persona || "ودودة ومحترفة"}\n\nالكلام: "${data.text}"`,
    );
    return { text: out.replace(/^["«]|["»]$/g, "").trim() || data.text };
  });
