// WhatsApp step-by-step marriage registration (no links). Additive: only handles
// messages that start a session by keyword or belong to an active session.
const START = /^(تسجيل|سجلني|استمارة|استماره|خطابة|خطابه|ابي اسجل|أبي أسجل|ابغى اسجل|تسجيل زواج)/;
const CANCEL = /^(الغاء|إلغاء|وقف|cancel)$/i;
const SKIP = /^(تخطي|تخطى|سكب|-)$/;

export const WA_STEPS: { k: string; q: string }[] = [
  { k: "gender", q: "يا هلا ومسهلا فيك مع خطابة أم ندى 🤍\nبياناتك في سرية وأمان تام، وما نطلب منك أي فلوس أو رموز.\n\nأول سؤال: أنت *عريس* ولا *عروس*؟\n(تقدر تكتب «تخطي» لأي سؤال، أو «الغاء» للإيقاف)" },
  { k: "name", q: "الاسم (يبقى سري ولا ينشر) ✍️" },
  { k: "age", q: "كم العمر؟" },
  { k: "nationality", q: "الجنسية؟" },
  { k: "city", q: "بلد الإقامة والمدينة؟" },
  { k: "marital", q: "الحالة الاجتماعية؟ (أعزب/عزباء، مطلق/ة، أرمل/ة، متزوج)" },
  { k: "kids", q: "عدد الأطفال إن وجد؟" },
  { k: "type", q: "نوع الزواج المطلوب؟ (دائم معلن، تعدد، مسيار، حسب الاتفاق... أو اكتب اللي تبيه)" },
  { k: "job", q: "الوظيفة / المهنة؟" },
  { k: "edu", q: "المؤهل التعليمي؟" },
  { k: "height", q: "الطول والوزن تقريباً؟" },
  { k: "about", q: "نبذة مختصرة عنك وعن أسلوب حياتك 🤍" },
  { k: "pAge", q: "العمر المناسب للطرف الثاني؟" },
  { k: "pCity", q: "المدينة أو البلد المفضل للطرف الثاني؟" },
  { k: "pTraits", q: "الصفات والمواصفات اللي تبحث عنها؟" },
  { k: "pTerms", q: "شروطك الأساسية؟" },
  { k: "callTime", q: "آخر سؤال: الوقت المناسب للتواصل معك؟" },
];

export async function handleMarriageWa(db: any, instance: string, number: string, text: string): Promise<string | null> {
  const t = text.trim();
  const phone = number.replace(/\D/g, "") || number;
  const { data: s } = await db.from("marriage_wa_sessions").select("*").eq("instance", instance).eq("phone", phone).maybeSingle();
  const active = s && !s.done;
  if (!active && !START.test(t)) return null;
  if (active && CANCEL.test(t)) {
    await db.from("marriage_wa_sessions").delete().eq("id", s.id);
    return "تم إيقاف التسجيل 🤍 متى ما حبيت تكمل اكتب «تسجيل».";
  }
  if (!active) {
    const store = await findStore(db, instance);
    if (!store) return null;
    await db.from("marriage_wa_sessions").upsert({ instance, phone, store_id: store, step: 0, gender: "", data: {}, done: false, updated_at: new Date().toISOString() }, { onConflict: "instance,phone" });
    return WA_STEPS[0]!.q;
  }
  const step = WA_STEPS[s.step]!;
  const data = { ...(s.data ?? {}) } as Record<string, string>;
  let gender = s.gender as string;
  if (step.k === "gender") {
    if (/عروس|بنت|انثى|أنثى|امرأة|مرأة/.test(t)) gender = "female";
    else if (/عريس|رجل|ولد|ذكر|شاب/.test(t)) gender = "male";
    else return "اكتب *عريس* أو *عروس* بس عشان نكمل 🤍";
  } else if (!SKIP.test(t)) data[step.k] = t.slice(0, 600);
  const next = s.step + 1;
  if (next >= WA_STEPS.length) {
    data["platform"] = "واتساب"; data["phone"] = phone; data["source"] = "تسجيل واتساب تفاعلي";
    const { data: code } = await db.rpc("submit_marriage_form", { _store: s.store_id, _gender: gender || "male", _data: data });
    await db.from("marriage_wa_sessions").update({ step: next, gender, data, done: true, updated_at: new Date().toISOString() }).eq("id", s.id);
    return `تم تسجيل طلبك بنجاح 💍\nرقم طلبك: *${code ?? "—"}*\nاحتفظ فيه، وبنتواصل معك أول ما يتوفر توافق مناسب بإذن الله 🤍`;
  }
  await db.from("marriage_wa_sessions").update({ step: next, gender, data, updated_at: new Date().toISOString() }).eq("id", s.id);
  return WA_STEPS[next]!.q;
}

async function findStore(db: any, instance: string): Promise<string | null> {
  const { data: c } = await db.from("wa_autoreply").select("store_id").eq("instance", instance).maybeSingle();
  if (c?.store_id) return c.store_id;
  const { data: r } = await db.from("user_roles").select("user_id").eq("role", "admin").limit(1).maybeSingle();
  if (!r) return null;
  const { data: st } = await db.from("stores").select("id").eq("owner_id", r.user_id).order("created_at").limit(1).maybeSingle();
  return st?.id ?? null;
}
