// Shared marriage-form field definitions (public form + dashboard).
export type MField = { k: string; l: string; opts?: string[]; long?: boolean; private?: boolean; req?: boolean; ph?: string };

export const M_SECTIONS: { t: string; fields: MField[] }[] = [
  { t: "أولاً: البيانات الشخصية", fields: [
    { k: "name", l: "الاسم الكامل", ph: "مثال: محمد عبدالله", private: true, req: true }, { k: "age", l: "العمر", ph: "مثال: 28", req: true },
    { k: "nationality", l: "الجنسية", ph: "مثال: سعودي" }, { k: "city", l: "بلد الإقامة والمدينة", ph: "مثال: السعودية - الرياض", req: true },
    { k: "tribe", l: "العائلة / القبيلة", ph: "اختياري، يبقى سرياً", private: true },
    { k: "marital", l: "الحالة الاجتماعية", opts: ["أعزب/عزباء", "مطلق/ة", "أرمل/ة", "متزوج"] },
    { k: "kids", l: "عدد الأطفال إن وجد", ph: "مثال: لا يوجد / 2" },
    { k: "type", l: "نوع الزواج المطلوب", opts: ["زواج دائم", "تعدد"] },
    { k: "prev", l: "هل سبق الزواج؟", opts: ["نعم", "لا"] } ] },
  { t: "ثانياً: المعلومات الشخصية والمعيشية", fields: [
    { k: "edu", l: "المؤهل التعليمي", ph: "مثال: بكالوريوس" }, { k: "job", l: "الوظيفة / المهنة", ph: "مثال: معلم / موظف قطاع خاص" }, { k: "jobStatus", l: "الوضع الوظيفي", ph: "مثال: موظف / متقاعد / أعمال حرة" },
    { k: "height", l: "الطول", ph: "مثال: 170 سم" }, { k: "weight", l: "الوزن", ph: "مثال: 70 كجم" }, { k: "skin", l: "لون البشرة (اختياري)", ph: "مثال: حنطي" },
    { k: "religion", l: "مستوى الالتزام الديني", ph: "مثال: ملتزم / محافظ" }, { k: "hobbies", l: "الاهتمامات والهوايات", ph: "مثال: القراءة، السفر، الرياضة" },
    { k: "traits", l: "صفات الشخصية", ph: "مثال: هادئ، حنون، اجتماعي" }, { k: "housing", l: "الاستقرار السكني", ph: "مثال: سكن ملك / إيجار" } ] },
  { t: "ثالثاً: نبذة عنك", fields: [{ k: "about", l: "اكتب نبذة عن نفسك وأسلوب حياتك وما يميزك", ph: "اكتب بإيجاز عن نفسك وطبيعة حياتك وما يميزك...", long: true }] },
  { t: "رابعاً: مواصفات شريك الحياة", fields: [
    { k: "pAge", l: "العمر المناسب", ph: "مثال: من 22 إلى 30" }, { k: "pNationality", l: "الجنسية المطلوبة", ph: "مثال: سعودية / لا يهم" }, { k: "pCity", l: "المدينة أو بلد الإقامة", ph: "مثال: الرياض أو أي مدينة" },
    { k: "pMarital", l: "الحالة الاجتماعية المطلوبة", ph: "مثال: عزباء / لا يهم" }, { k: "pEdu", l: "المستوى التعليمي", ph: "مثال: جامعية" }, { k: "pLooks", l: "المواصفات الشكلية", ph: "مثال: متوسطة الطول" },
    { k: "pTraits", l: "الصفات التي تبحث عنها", ph: "مثال: طيبة، متفاهمة، ملتزمة" }, { k: "pTerms", l: "شروطك الأساسية", ph: "اذكر شروطك الأساسية بوضوح...", long: true },
    { k: "pNo", l: "أمور لا تقبل التنازل عنها", ph: "مثال: التدخين...", long: true } ] },
  { t: "خامساً: معلومات إضافية", fields: [
    { k: "moveCity", l: "الاستعداد للانتقال لمدينة أخرى", opts: ["نعم", "لا", "حسب الظروف"] },
    { k: "abroad", l: "الاستعداد للزواج من خارج البلد", opts: ["نعم", "لا"] },
    { k: "after", l: "السكن بعد الزواج", opts: ["مستقل", "مع العائلة", "حسب الاتفاق"] },
    { k: "when", l: "الوقت المتوقع لإتمام الزواج", ph: "مثال: خلال 6 أشهر" }, { k: "extra", l: "معلومات إضافية", ph: "أي معلومة تحب نعرفها...", long: true } ] },
  { t: "سادساً: بيانات التواصل", fields: [
    { k: "platform", l: "من أي منصة وصلت للرابط؟", opts: ["تيك توك", "سناب شات", "إنستقرام", "إكس (تويتر)", "واتساب", "أخرى"], req: true },
    { k: "handle", l: "يوزر حسابك في المنصة (مثال: @name)", ph: "مثال: @username", private: true, req: true },
    { k: "phone", l: "رقم الجوال (واتساب) مع مفتاح الدولة", ph: "مثال: 9665XXXXXXXX", private: true, req: true },
    { k: "phone2", l: "أعد كتابة رقم الجوال للتأكيد", ph: "أعد كتابة نفس الرقم", private: true, req: true }, { k: "callTime", l: "الوقت المناسب للتواصل", ph: "مثال: مساءً بعد 8" } ] },
];
export const M_ALL = M_SECTIONS.flatMap((s) => s.fields);
export const M_STATUS: [string, string][] = [["new", "🆕 جديد"], ["review", "🔎 قيد المراجعة"], ["match", "💞 مرشح للمطابقة"], ["done", "✅ تم"], ["archived", "🗄️ مؤرشف"]];
/** Public card text with private fields hidden. */
export function publicCardText(code: string, gender: string, d: Record<string, string>) {
  const lines = [`💍 ${gender === "female" ? "عروس" : "عريس"} — كود الطلب #${code}`];
  for (const f of M_ALL) { const v = d[f.k]?.trim(); if (!f.private && v) lines.push(`• ${f.l}: ${v}`); }
  lines.push("للتواصل والاستفسار أرسل كود الطلب على الواتساب 🤍");
  return lines.join("\n");
}
