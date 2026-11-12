// Shared marriage-form field definitions (public form + dashboard).
export type MField = { k: string; l: string; opts?: string[]; long?: boolean; private?: boolean; req?: boolean };
export const M_SECTIONS: { t: string; fields: MField[] }[] = [
  { t: "أولاً: البيانات الشخصية", fields: [
    { k: "name", l: "الاسم الكامل", private: true, req: true }, { k: "age", l: "العمر", req: true },
    { k: "nationality", l: "الجنسية" }, { k: "city", l: "بلد الإقامة والمدينة", req: true },
    { k: "tribe", l: "العائلة / القبيلة", private: true },
    { k: "marital", l: "الحالة الاجتماعية", opts: ["أعزب/عزباء", "مطلق/ة", "أرمل/ة", "متزوج"] },
    { k: "kids", l: "عدد الأطفال إن وجد" },
    { k: "type", l: "نوع الزواج المطلوب", opts: ["زواج دائم", "تعدد"] },
    { k: "prev", l: "هل سبق الزواج؟", opts: ["نعم", "لا"] } ] },
  { t: "ثانياً: المعلومات الشخصية والمعيشية", fields: [
    { k: "edu", l: "المؤهل التعليمي" }, { k: "job", l: "الوظيفة / المهنة" }, { k: "jobStatus", l: "الوضع الوظيفي" },
    { k: "height", l: "الطول" }, { k: "weight", l: "الوزن" }, { k: "skin", l: "لون البشرة (اختياري)" },
    { k: "religion", l: "مستوى الالتزام الديني" }, { k: "hobbies", l: "الاهتمامات والهوايات" },
    { k: "traits", l: "صفات الشخصية" }, { k: "housing", l: "الاستقرار السكني" } ] },
  { t: "ثالثاً: نبذة عنك", fields: [{ k: "about", l: "اكتب نبذة عن نفسك وأسلوب حياتك وما يميزك", long: true }] },
  { t: "رابعاً: مواصفات شريك الحياة", fields: [
    { k: "pAge", l: "العمر المناسب" }, { k: "pNationality", l: "الجنسية المطلوبة" }, { k: "pCity", l: "المدينة أو بلد الإقامة" },
    { k: "pMarital", l: "الحالة الاجتماعية المطلوبة" }, { k: "pEdu", l: "المستوى التعليمي" }, { k: "pLooks", l: "المواصفات الشكلية" },
    { k: "pTraits", l: "الصفات التي تبحث عنها" }, { k: "pTerms", l: "شروطك الأساسية", long: true },
    { k: "pNo", l: "أمور لا تقبل التنازل عنها", long: true } ] },
  { t: "خامساً: معلومات إضافية", fields: [
    { k: "moveCity", l: "الاستعداد للانتقال لمدينة أخرى", opts: ["نعم", "لا", "حسب الظروف"] },
    { k: "abroad", l: "الاستعداد للزواج من خارج البلد", opts: ["نعم", "لا"] },
    { k: "after", l: "السكن بعد الزواج", opts: ["مستقل", "مع العائلة", "حسب الاتفاق"] },
    { k: "when", l: "الوقت المتوقع لإتمام الزواج" }, { k: "extra", l: "معلومات إضافية", long: true } ] },
  { t: "سادساً: بيانات التواصل", fields: [
    { k: "phone", l: "رقم التواصل (واتساب)", private: true, req: true }, { k: "callTime", l: "الوقت المناسب للتواصل" } ] },
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
