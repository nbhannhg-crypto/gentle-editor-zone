// WhatsApp step-by-step marriage registration (no links). Additive: only handles
// messages that start a session by keyword or belong to an active session.
// Smart mode: extracts every detail in one message, skips answered questions,
// numbered choice buttons, learned answers for client questions, owner-editable questions.
const START = /^(تسجيل|سجلني|استمارة|استماره|خطابة|خطابه|ابي اسجل|أبي أسجل|ابغى اسجل|تسجيل زواج)/;
const CANCEL = /^(الغاء|إلغاء|وقف|cancel)$/i;
const SKIP = /^(تخطي|تخطى|سكب|-)$/;
const BACK = /^(رجوع|ارجع|السابق)$/;

export type WaStep = { k: string; q: string; opts?: string[]; hint?: string; why?: string };
export const WA_STEPS: WaStep[] = [
  { k: "gender", q: "يا هلا ومسهلا فيك مع خطابة أم ندى 🤍\nهنا نسجل بياناتك عشان نبحث لك عن الشريك المناسب بإذن الله 💍\n🔒 كل معلوماتك سرية ومحفوظة عندنا، ما تنشر ولا تنعطى لأحد إلا بموافقتك.\n✅ خطابة موثوقة ونتعامل بوضوح وأمانة.\n⚠️ نرجو منك الجدية التامة وكتابة معلومات حقيقية بأمانة؛ لأنها أمانة ونبني عليها التوفيق بإذن الله.\n\nأول سؤال: أنت عريس ولا عروس؟", opts: ["عريس", "عروس"], hint: "اكتب 1 أو 2، أو اكتب: عريس / عروس", why: "عشان نعرف نبحث لك عن الطرف المناسب" },
  { k: "name", q: "الاسم الحقيقي والكنية (يبقى سري ولا ينشر) ✍️", hint: "اكتب اسمك الحقيقي مع الكنية، مثال: محمد عبدالله - أبو فهد / سارة أحمد - أم ريان", why: "الاسم الحقيقي للتوثيق والتعامل معك فقط وما ينشر أبد" },
  { k: "age", q: "كم العمر؟", hint: "اختر عمرك واكتبه بالأرقام فقط، مثال: 20 أو 35 أو 50", why: "العمر مهم عشان نوفق بينك وبين شريك قريب من سنك" },
  { k: "nationality", q: "الجنسية؟", opts: ["سعودي / سعودية", "مقيم / مقيمة"], hint: "اكتب 1 = سعودي/سعودية أو 2 = مقيم/مقيمة", why: "بعض الطرف الثاني يشترط جنسية معينة" },
  { k: "country", q: "من أي دولة أنت؟ (الأصل)", hint: "مثال: السعودية / اليمن / مصر / سوريا", why: "عشان نعرف بلدك الأصلي بدقة" },
  { k: "city", q: "بلد الإقامة والمدينة؟", hint: "مثال: السعودية - الرياض", why: "عشان نقربك من شريك في مدينتك أو قريب منها" },
  { k: "district", q: "اسم الحي؟", hint: "مثال: حي النرجس / حي الصفا", why: "عشان نقربك من شريك قريب منك (يبقى سري)" },
  { k: "marital", q: "الحالة الاجتماعية؟", opts: ["أعزب / عزباء", "مطلق / مطلقة", "أرمل / أرملة", "متزوج"], hint: "اكتب الرقم، مثال: 1", why: "الحالة تفرق في التوافق بين الطرفين" },
  { k: "kids", q: "عدد الأطفال إن وجد؟", opts: ["لا يوجد", "1", "2", "3 أو أكثر"], hint: "اكتب الرقم، مثال: 1 = لا يوجد", why: "بعض الأطراف تسأل عن الأطفال قبل القبول" },
  { k: "type", q: "نوع الزواج المطلوب؟ (أو اكتب اللي تبيه)", opts: ["زواج دائم معلن", "تعدد معلن", "تعدد سري", "مسيار معلن", "مسيار سري", "حسب الاتفاق"], hint: "اكتب الرقم أو اكتب نوعك، مثال: مسيار معلن", why: "عشان ما نعرض عليك إلا اللي يناسب نوع الزواج اللي تبيه" },
  { k: "job", q: "الوظيفة / المهنة؟", hint: "مثال: موظف حكومي / معلمة / أعمال حرة", why: "الوظيفة تعطي الطرف الثاني صورة عن استقرارك" },
  { k: "edu", q: "المؤهل التعليمي؟", opts: ["ثانوي", "دبلوم", "بكالوريوس", "ماجستير أو أعلى"], hint: "اكتب الرقم، مثال: 3 = بكالوريوس", why: "بعض الأطراف تهتم بالمستوى التعليمي" },
  { k: "height", q: "كم الطول؟", hint: "اكتب الطول بالسنتيمتر، مثال: 165 أو 175", why: "للمواصفات الشكلية اللي يسأل عنها الطرف الثاني" },
  { k: "weight", q: "كم الوزن؟", hint: "اكتب الوزن بالكيلو، مثال: 60 أو 80", why: "للمواصفات الشكلية اللي يسأل عنها الطرف الثاني" },
  { k: "health", q: "هل أنت خالي من جميع الأمراض؟", opts: ["نعم، خالي/خالية من الأمراض", "عندي مرض مزمن بسيط", "عندي حالة صحية (بوضحها)"], hint: "اكتب الرقم بأمانة، وإذا عندك حالة اكتبها بعد الرقم", why: "الصدق في الصحة أمانة ويبني الثقة بين الطرفين" },
  { k: "about", q: "نبذة مختصرة عنك وعن أسلوب حياتك 🤍", hint: "اكتب عن نفسك بصدق: طبعك، التزامك، اهتماماتك، وضعك المعيشي. مثال: هادي وحنون، ملتزم بالصلاة، موظف مستقر، أحب السفر والجلسات العائلية", why: "نبذتك تخلي الطرف الثاني يعرف شخصيتك" },
  { k: "when", q: "متى تبي يكون الزواج؟", opts: ["في أقرب وقت", "خلال 3 أشهر", "خلال 6 أشهر", "خلال سنة", "حسب الظروف"], hint: "اكتب الرقم، مثال: 2 = خلال 3 أشهر", why: "عشان نوفق بينك وبين طرف جاهز بنفس الوقت" },
  { k: "pAge", q: "العمر المناسب للطرف الثاني؟", hint: "مثال: من 25 إلى 35 — أو اكتب: ما يهم", why: "عشان نختار لك أعمار مناسبة" },
  { k: "pCity", q: "المدينة أو البلد المفضل للطرف الثاني؟", hint: "مثال: الرياض أو أي مدينة بالسعودية — أو: ما يهم", why: "عشان نحدد مكان البحث" },
  { k: "pTraits", q: "الصفات والمواصفات اللي تبحث عنها؟", hint: "اشرح وصف شريكة/شريك حياتك: الشكل (الطول، البشرة، الجسم)، الأخلاق، الالتزام، الطباع. مثال: متوسطة الطول، بيضاء، ملتزمة، هادية وحنونة، تحب الاستقرار", why: "عشان نبحث لك عن المواصفات اللي تبيها بالضبط" },
  { k: "pTerms", q: "شروطك الأساسية؟", hint: "مثال: سكن مستقل، تكمل دراستها — أو: لا يوجد", why: "الشروط نوضحها للطرف الثاني من البداية" },
  { k: "platform", q: "من أي منصة وصلت لنا؟ 📱", opts: ["تيك توك", "سناب شات", "إنستقرام", "إكس (تويتر)", "واتساب", "تلجرام", "فيسبوك", "يوتيوب", "أخرى"], hint: "اكتب رقم المنصة، مثال: 1 = تيك توك", why: "عشان نعرف من وين تواصلت معنا ونتابعك منها" },
  { k: "handle", q: "اسم حسابك في البرنامج اللي جيت منه؟ 🤍", hint: "مثل: محمد، أبو فهد، ندى — أي اسم مكتوب في صفحتك. إذا ما تعرف اكتب: ما أعرف", why: "بس عشان نعرف نتابعك من نفس البرنامج اللي شفتنا فيه، ما نطلب أي دخول لحسابك" },
  { k: "via", q: "كيف عرفتنا؟ شفت إعلان أو بث أو جيت عن طريق خطابة؟", opts: ["شفت إعلان", "بث مباشر", "عن طريق خطابة", "صديق أو قريب", "بحث بنفسي"], hint: "اكتب الرقم، مثال: 3 = عن طريق خطابة", why: "عشان نعرف المصدر ونخدمك أفضل" },
  { k: "brokerHandle", q: "اسم الخطابة اللي شفت إعلانها أو كلمتها؟ 🌸", hint: "مثل: أم ندى، أم فهد — أو اكتب: ما أذكر", why: "عشان نعرف عن طريق أي خطابة أو حساب وصلت" },
  { k: "phone", q: "رقم جوالك للاتصال (واتساب) مع مفتاح الدولة 📞", hint: "مثال: 9665XXXXXXXX — اكتب رقم صحيح لأننا بنتواصل عليه", why: "رقمك يبقى سري، وللتواصل معك فقط عند وجود توافق" },
  { k: "callTime", q: "آخر سؤال: الوقت المناسب للتواصل معك؟", opts: ["الصباح", "الظهر", "المساء", "أي وقت"], hint: "اكتب الرقم، مثال: 3 = المساء", why: "عشان نتواصل معك بوقت يناسبك" },
];

type Learned = { q: string; a: string };
type Settings = { store_id: string; enabled: boolean; instance: string; smart: boolean; welcome: string; questions: Record<string, string>; learned: Learned[] };

const NUM: Record<string, string> = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };
const toEn = (s: string) => s.replace(/[٠-٩]/g, (d) => NUM[d] ?? d);
const norm = (s: string) => s.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();

function askText(st: WaStep, cfg: Settings | null, first: boolean, done: number): string {
  let q = (cfg?.questions?.[st.k] || "").trim() || st.q;
  if (first && cfg?.welcome?.trim() && st.k === "gender") q = `${cfg.welcome.trim()}\n\n${q.replace(/^[\s\S]*?\n\n/, "")}`;
  const progress = done > 0 ? `(${done}/${WA_STEPS.length}) ` : "";
  const opts = st.opts?.length ? "\n\n" + st.opts.map((o, i) => `${i + 1}️⃣ ${o}`).join("\n") : "";
  const hint = st.hint ? `\n\n💡 ${st.hint}` : "";
  const help = first ? "\n\n(تقدر تكتب «تخطي» لأي سؤال، «رجوع» للسابق، «فهمني» للشرح، أو «الغاء» للإيقاف)" : "";
  return `${progress}${q}${opts}${hint}${help}`;
}

function pickOpt(st: WaStep, t: string): string | null {
  if (!st.opts?.length) return null;
  const n = parseInt(toEn(t).trim(), 10);
  if (String(n) === toEn(t).trim() && n >= 1 && n <= st.opts.length) return st.opts[n - 1]!;
  const nt = norm(t);
  const hit = st.opts.find((o) => o.split("/").some((p) => { const np = norm(p); return np && (nt === np || nt.includes(np)); }));
  return hit ?? null;
}

function genderOf(t: string): string {
  if (/عروس|بنت|انثى|أنثى|امرأة|مرأة|^2$|^٢$/.test(t.trim())) return "female";
  if (/عريس|رجل|ولد|ذكر|شاب|^1$|^١$/.test(t.trim())) return "male";
  return "";
}

function learnedHit(cfg: Settings | null, t: string): string | null {
  const nt = norm(t);
  for (const l of cfg?.learned ?? []) {
    const nq = norm(l.q || "");
    if (nq.length >= 2 && (nt.includes(nq) || nq.includes(nt) && nt.length > 4)) return l.a;
  }
  return null;
}

async function smartExtract(t: string, gender: string): Promise<{ gender: string; fields: Record<string, string> }> {
  try {
    const { aiText } = await import("@/lib/autoreply.server");
    const keys = WA_STEPS.filter((s) => s.k !== "gender").map((s) => `"${s.k}": ${s.q.split("\n")[0]}`).join("\n");
    const sys = `أنت مساعد تسجيل خطابة. استخرج من رسالة العميل فقط المعلومات المذكورة صراحة. أرجع JSON فقط: {"gender":"male"|"female"|"","fields":{...}}
المفاتيح:\n${keys}
قواعد صارمة: لا تخمّن ولا تخترع؛ أي شيء غير مذكور لا تضعه. مواصفات الطرف الثاني (العمر المطلوب، مدينته، صفاته، الشروط) تذهب إلى pAge/pCity/pTraits/pTerms وليس لبيانات العميل. ${gender ? "" : "استنتج gender من صيغة الكلام إن كانت واضحة."}`;
    const out = await aiText(sys, t, 2000);
    const j = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) as { gender?: string; fields?: Record<string, unknown> };
    const allowed = new Set(WA_STEPS.map((s) => s.k));
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(j.fields ?? {})) if (allowed.has(k) && k !== "gender" && v != null && String(v).trim()) fields[k] = String(v).trim().slice(0, 600);
    return { gender: j.gender === "female" || j.gender === "male" ? j.gender : "", fields };
  } catch { return { gender: "", fields: {} }; }
}

const EXPLAIN = /(فهم(ني|يني|ني)|ما فهمت|مافهمت|كيف يعني|وش تقصد|وش قصدك|ايش تقصد|يعني ايش|يعني وش|ليش تسأل|ليش تسالون|ليش|لماذا|وضح|اشرح|\?|؟)/;
const ANY = /^(اي|أي|اي شي|أي شيء|ما يهم|مايهم|ماتفرق|ما تفرق|عادي|كله واحد|اي عمر|أي عمر|اي مدينه|أي مدينة|حسب|حسب النصيب|اللي يجي)/;
const REFUSE = /^(مابي|ما ابي|ما أبي|ماابي|مابغى|ما ابغى|سري|خاص|ما اقول|ما أقول|مااقول|بعدين|لاحقا|لاحقاً)/;

const INQ = /(كيف|ليش|لماذا|مافهمت|ما فهمت|فهمني|فهميني|وش فيك|وش تقصد|ايش تقصد|اشرح|وضح|يعني وش|يعني ايش)/;
type Intent = { kind: "answer" | "explain" | "any" | "refuse" | "question"; value?: string; reply?: string };
async function understand(step: WaStep, t: string, smart: boolean): Promise<Intent> {
  const nt = norm(t);
  if (smart) {
    try {
      const { aiText } = await import("@/lib/autoreply.server");
      const sys = `أنت خطابة سعودية ذكية تسجل بيانات عميل بالواتساب. السؤال الحالي: "${step.q.split("\n").pop()}" (${step.why ?? ""}). ${step.opts ? "الخيارات: " + step.opts.join(" | ") : ""}
صنّف رد العميل وأرجع JSON فقط: {"kind":"answer|explain|any|refuse|question","value":"","reply":""}
- answer: جاوب فعلا على السؤال → value = الجواب منظف ومختصر (للعمر رقم فقط، للخيارات اكتب الخيار المطابق نصاً).
- explain: ما فهم أو يسأل ليش/كيف/فهميني → reply = شرح قصير لطيف بلهجة سعودية لماذا نسأل وكيف يجاوب مع مثال، بدون إعادة السؤال.
- any: ما عنده تفضيل (اي/ما يهم/عادي).
- refuse: ما يبي يقول أو يأجل.
- question: سأل سؤال جانبي ثاني (سعر، موقع، طريقة...) → reply = جواب قصير صادق بلا اختلاق أرقام أو أسماء؛ إذا ما تعرف قل بنوضح لك الخطابة شخصياً.
ممنوع تخترع معلومة.`;
      const out = await aiText(sys, t, 400);
      const j = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) as Intent;
      if (["answer", "explain", "any", "refuse", "question"].includes(j.kind)) return j;
    } catch { /* fall back to rules */ }
  }
  if (REFUSE.test(nt)) return { kind: "refuse" };
  if (ANY.test(nt)) return { kind: "any" };
  if (EXPLAIN.test(t) && t.length < 40) return { kind: "explain" };
  if (step.k === "age") { const n = toEn(t).match(/\d{2}/); return n ? { kind: "answer", value: n[0] } : { kind: "explain" }; }
  return { kind: "answer", value: t };
}

const nextIdx = (from: number, data: Record<string, string>, gender: string) => {
  for (let i = from; i < WA_STEPS.length; i++) {
    const k = WA_STEPS[i]!.k;
    if (k === "gender" ? !gender : !(k in data)) return i;
  }
  return WA_STEPS.length;
};

export async function loadMarriageSettings(db: any, instance: string): Promise<Settings | null> {
  const { data: byInst } = await db.from("marriage_wa_settings").select("*").eq("instance", instance).limit(1).maybeSingle();
  if (byInst) return byInst as Settings;
  const store = await findStore(db, instance);
  if (!store) return null;
  const { data: s } = await db.from("marriage_wa_settings").select("*").eq("store_id", store).maybeSingle();
  return (s as Settings) ?? { store_id: store, enabled: true, instance: "", smart: true, welcome: "", questions: {}, learned: [] };
}

export async function handleMarriageWa(db: any, instance: string, number: string, text: string, sim?: { storeId: string }): Promise<string | null> {
  const t = text.trim();
  if (!t) return null;
  const phone = number.replace(/\D/g, "") || number;
  const { data: s } = await db.from("marriage_wa_sessions").select("*").eq("instance", instance).eq("phone", phone).maybeSingle();
  const active = s && !s.done;
  if (!active && !START.test(t)) {
    // 🤍 First message ever from this number → one-time welcome (never repeated)
    if (s || sim) return null;
    const c0 = await loadMarriageSettings(db, instance);
    if (!c0 || !c0.enabled || (c0.instance && c0.instance !== instance)) return null;
    await db.from("marriage_wa_sessions").upsert({ instance, phone, store_id: c0.store_id, step: 0, gender: "", data: { greeted: "1" }, done: true, updated_at: new Date().toISOString() }, { onConflict: "instance,phone" });
    return "يا هلا ومسهلا فيك مع خطابة أم ندى 🤍\nبياناتك في سرية وأمان تام.\n\nإذا تبي تسجّل طلب زواج اكتب «تسجيل» ونبدأ معك خطوة بخطوة، أو تفضّل بسؤالك 🌷";
  }

  let cfg: Settings | null;
  if (sim) {
    const { data: c } = await db.from("marriage_wa_settings").select("*").eq("store_id", sim.storeId).maybeSingle();
    cfg = (c as Settings) ?? { store_id: sim.storeId, enabled: true, instance: "", smart: true, welcome: "", questions: {}, learned: [] };
  } else {
    cfg = await loadMarriageSettings(db, instance);
    if (!cfg) return null;
    if (!active && (!cfg.enabled || (cfg.instance && cfg.instance !== instance))) return null;
  }

  if (active && CANCEL.test(t)) {
    await db.from("marriage_wa_sessions").delete().eq("id", s.id);
    return "تم إيقاف التسجيل 🤍 متى ما حبيت تكمل اكتب «تسجيل».";
  }
  if (!active) {
    await db.from("marriage_wa_sessions").upsert({ instance, phone, store_id: cfg.store_id, step: 0, gender: "", data: {}, done: false, updated_at: new Date().toISOString() }, { onConflict: "instance,phone" });
    return askText(WA_STEPS[0]!, cfg, true, 0);
  }

  const step = WA_STEPS[Math.min(s.step, WA_STEPS.length - 1)]!;
  const data = { ...(s.data ?? {}) } as Record<string, string>;
  let gender = s.gender as string;
  const save = (st: number, extra: Record<string, unknown> = {}) => db.from("marriage_wa_sessions").update({ step: st, gender, data, updated_at: new Date().toISOString(), ...extra }).eq("id", s.id);
  const answered = () => WA_STEPS.filter((x) => (x.k === "gender" ? !!gender : x.k in data)).length;

  if (BACK.test(t)) {
    const prev = Math.max(0, s.step - 1);
    const pk = WA_STEPS[prev]!.k;
    if (pk === "gender") gender = ""; else delete data[pk];
    await save(prev);
    return askText(WA_STEPS[prev]!, cfg, false, answered());
  }

  // Client asked a question instead of answering → learned answer, then repeat the question.
  const learned = learnedHit(cfg, t);
  if (learned && !pickOpt(step, t)) return `${learned}\n\n↩️ ${askText(step, cfg, false, answered())}`;

  if (step.k === "gender") {
    if (!genderOf(t) && (EXPLAIN.test(t) || t.length < 25)) {
      const it = await understand(step, t, !!cfg?.smart);
      if (it.kind === "explain" || it.kind === "question" || it.kind === "refuse" || it.kind === "any") return `${it.reply?.trim() || "يا هلا فيك 🤍 نسأل عشان نعرف نبحث لك عن الطرف المناسب: إذا أنت رجل تبي زوجة اختر 1، وإذا أنتِ امرأة تبين زوج اختاري 2."}\n\n↩️ اكتب 1 = عريس أو 2 = عروس`;
    }
    gender = genderOf(t);
    if (!gender && cfg.smart && t.length > 12) { const ex = await smartExtract(t, ""); gender = ex.gender; for (const [k, v] of Object.entries(ex.fields)) if (!(k in data)) data[k] = v; }
    if (!gender) return askText(step, cfg, false, 0);
  } else if (SKIP.test(t)) {
    data[step.k] = "";
  } else {
    const opt = pickOpt(step, t);
    if (opt) data[step.k] = opt;
    else {
      if (cfg.smart && t.length > 12) {
        const ex = await smartExtract(t, gender);
        if (!gender && ex.gender) gender = ex.gender;
        for (const [k, v] of Object.entries(ex.fields)) if (!(k in data) || !data[k]) data[k] = v;
      }
      if (!data[step.k]) {
        const xk = `_x_${step.k}`;
        if (DUNNO.test(norm(t))) { data[step.k] = ""; delete data[xk]; const nx = nextIdx(s.step + 1, data, gender); if (nx < WA_STEPS.length) { await save(nx); return `ولا يهمك يا بعد راسي ما هي مشكلة 🤍\n\n${askText(WA_STEPS[nx]!, cfg, false, answered())}`; } }
        const it = await understand(step, t, !!cfg?.smart);
        const confused = it.kind === "explain" || it.kind === "question" || (it.kind === "answer" && INQ.test(norm(it.value || t)) && (it.value || t).length < 30);
        if (confused && data[xk]) { data[step.k] = ""; delete data[xk]; const nx = nextIdx(s.step + 1, data, gender); if (nx < WA_STEPS.length) { await save(nx); return `ولا يهمك، نتخطاه ونكمل 🤍\n\n${askText(WA_STEPS[nx]!, cfg, false, answered())}`; } }
        if (confused) { data[xk] = "1"; await save(s.step); }
        const again = askText(step, cfg, false, answered());
        if (it.kind === "answer" && INQ.test(norm(it.value || t)) && (it.value || t).length < 30) return `يا بعد راسي 🤍 ${step.why ?? "هالمعلومة تساعدنا نوفق لك صح"}.\n\n↩️ ${again}`;
        if (it.kind === "explain") return `${it.reply?.trim() || `يا بعد راسي 🤍 ${step.why ?? "هالمعلومة تساعدنا نوفق لك صح"}.`}\n\n↩️ ${again}`;
        if (it.kind === "question") return `${it.reply?.trim() || "سؤالك في محله 🤍 بتوضحه لك الخطابة شخصياً بعد التسجيل."}\n\n↩️ نكمل: ${again}`;
        if (it.kind === "any") data[step.k] = "غير محدد / حسب التوافق";
        else if (it.kind === "refuse") data[step.k] = "";
        else data[step.k] = (pickOpt(step, it.value || t) ?? (it.value || t)).slice(0, 600);
      }
    }
  }

  const next = nextIdx(s.step + 1, data, gender);
  if (next >= WA_STEPS.length) {
    if (!data["platform"]) data["platform"] = "واتساب"; if (!data["phone"]) data["phone"] = phone; data["waPhone"] = phone; data["source"] = "تسجيل واتساب تفاعلي";
    for (const k of Object.keys(data)) if (data[k] === "" || k.startsWith("_x_")) delete data[k];
    if (sim) {
      await save(next, { done: true });
      const lines = WA_STEPS.filter((x) => x.k !== "gender" && data[x.k]).map((x) => `• ${(x.q.split("\n")[0] ?? "").replace(/[؟?✍️🤍]/g, "").trim()}: ${data[x.k]}`);
      return `🧪 (تجربة — ما انحفظ طلب حقيقي)\n✅ اكتمل التسجيل:\n• الجنس: ${gender === "female" ? "عروس" : "عريس"}\n${lines.join("\n")}`;
    }
    const { data: code } = await db.rpc("submit_marriage_form", { _store: s.store_id, _gender: gender || "male", _data: data });
    await save(next, { done: true });
    return `تم تسجيل طلبك بنجاح 💍\nرقم طلبك: *${code ?? "—"}*\nاحتفظ فيه، وبنتواصل معك أول ما يتوفر توافق مناسب بإذن الله 🤍`;
  }
  await save(next);
  const skipped = next - s.step - 1;
  const note = skipped > 0 ? `تمام، سجلت ${skipped + 1} معلومات من رسالتك 👌\n\n` : "";
  return note + askText(WA_STEPS[next]!, cfg, false, answered());
}

const DUNNO = /^(ما ?اعرف|ماعرف|مااعرف|ما ?ادري|مادري|مدري|ما ?اذكر|ماذكر|ناسي|نسيت|ما ?عندي|ماعندي|وش دراني|عادي|لا يوجد|مافي|ما فيه)$/;

async function findStore(db: any, instance: string): Promise<string | null> {
  const { data: c } = await db.from("wa_autoreply").select("store_id").eq("instance", instance).maybeSingle();
  if (c?.store_id) return c.store_id;
  const { data: r } = await db.from("user_roles").select("user_id").eq("role", "admin").limit(1).maybeSingle();
  if (!r) return null;
  const { data: st } = await db.from("stores").select("id").eq("owner_id", r.user_id).order("created_at").limit(1).maybeSingle();
  return st?.id ?? null;
}
