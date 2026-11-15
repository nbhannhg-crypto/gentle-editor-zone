// WhatsApp step-by-step marriage registration (no links). Additive: only handles
// messages that start a session by keyword or belong to an active session.
// Smart mode: extracts every detail in one message, skips answered questions,
// numbered choice buttons, learned answers for client questions, owner-editable questions.
const START = /^(تسجيل|سجلني|استمارة|استماره|خطابة|خطابه|ابي اسجل|أبي أسجل|ابغى اسجل|تسجيل زواج)/;
const CANCEL = /^(الغاء|إلغاء|وقف|cancel)$/i;
const SKIP = /^(تخطي|تخطى|سكب|-)$/;
const BACK = /^(رجوع|ارجع|السابق)$/;

export type WaStep = { k: string; q: string; opts?: string[] };
export const WA_STEPS: WaStep[] = [
  { k: "gender", q: "يا هلا ومسهلا فيك مع خطابة أم ندى 🤍\nبياناتك في سرية وأمان تام، وما نطلب منك أي فلوس أو رموز.\n\nأول سؤال: أنت عريس ولا عروس؟", opts: ["عريس", "عروس"] },
  { k: "name", q: "الاسم (يبقى سري ولا ينشر) ✍️" },
  { k: "age", q: "كم العمر؟" },
  { k: "nationality", q: "الجنسية؟" },
  { k: "city", q: "بلد الإقامة والمدينة؟" },
  { k: "marital", q: "الحالة الاجتماعية؟", opts: ["أعزب / عزباء", "مطلق / مطلقة", "أرمل / أرملة", "متزوج"] },
  { k: "kids", q: "عدد الأطفال إن وجد؟", opts: ["لا يوجد", "1", "2", "3 أو أكثر"] },
  { k: "type", q: "نوع الزواج المطلوب؟ (أو اكتب اللي تبيه)", opts: ["زواج دائم معلن", "تعدد معلن", "تعدد سري", "مسيار معلن", "مسيار سري", "حسب الاتفاق"] },
  { k: "job", q: "الوظيفة / المهنة؟" },
  { k: "edu", q: "المؤهل التعليمي؟", opts: ["ثانوي", "دبلوم", "بكالوريوس", "ماجستير أو أعلى"] },
  { k: "height", q: "الطول والوزن تقريباً؟" },
  { k: "about", q: "نبذة مختصرة عنك وعن أسلوب حياتك 🤍" },
  { k: "pAge", q: "العمر المناسب للطرف الثاني؟" },
  { k: "pCity", q: "المدينة أو البلد المفضل للطرف الثاني؟" },
  { k: "pTraits", q: "الصفات والمواصفات اللي تبحث عنها؟" },
  { k: "pTerms", q: "شروطك الأساسية؟" },
  { k: "callTime", q: "آخر سؤال: الوقت المناسب للتواصل معك؟", opts: ["الصباح", "الظهر", "المساء", "أي وقت"] },
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
  const opts = st.opts?.length ? "\n\n" + st.opts.map((o, i) => `${i + 1}️⃣ ${o}`).join("\n") + "\n\nاكتب الرقم أو الكلمة 👆" : "";
  const help = first ? "\n\n(«تخطي» لأي سؤال • «رجوع» للسابق • «الغاء» للإيقاف)" : "";
  return `${progress}${q}${opts}${help}`;
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
  if (!active && !START.test(t)) return null;

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
      if (!data[step.k]) data[step.k] = t.slice(0, 600);
    }
  }

  const next = nextIdx(s.step + 1, data, gender);
  if (next >= WA_STEPS.length) {
    data["platform"] = "واتساب"; data["phone"] = phone; data["source"] = "تسجيل واتساب تفاعلي";
    for (const k of Object.keys(data)) if (data[k] === "") delete data[k];
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

async function findStore(db: any, instance: string): Promise<string | null> {
  const { data: c } = await db.from("wa_autoreply").select("store_id").eq("instance", instance).maybeSingle();
  if (c?.store_id) return c.store_id;
  const { data: r } = await db.from("user_roles").select("user_id").eq("role", "admin").limit(1).maybeSingle();
  if (!r) return null;
  const { data: st } = await db.from("stores").select("id").eq("owner_id", r.user_id).order("created_at").limit(1).maybeSingle();
  return st?.id ?? null;
}
