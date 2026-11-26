import { SegmentedMessage } from "sms-segments-calculator";
import { parsePhoneNumberFromString } from "libphonenumber-js";

export type SmsSenderNumber = {
  number: string;
  country: string;
  profile: boolean;
  domestic: boolean;
  international: boolean;
};

export function normalizeSmsNumber(value: string) {
  const cleaned = value.trim().replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
    .replace(/[\s().-]/g, "").replace(/^00/, "+");
  const phone = parsePhoneNumberFromString(cleaned);
  if (!phone?.isPossible() || !cleaned.startsWith("+")) throw new Error("اكتب رقم المستلم مع مفتاح الدولة مثل +966");
  return phone.number;
}

export function smsMetrics(text: string) {
  const message = new SegmentedMessage(text, "auto", false);
  return {
    characters: Array.from(text).length,
    units: message.messageSize / (message.encodingName === "GSM-7" ? 7 : 16),
    encoding: message.encodingName,
    parts: text.length ? message.segmentsCount : 0,
    singleLimit: message.encodingName === "GSM-7" ? 160 : 70,
    multipartLimit: message.encodingName === "GSM-7" ? 153 : 67,
  };
}

export function smsRouteProblem(sender: SmsSenderNumber | undefined, to: string) {
  if (!sender) return "اختر رقماً مملوكاً ومهيّأ للرسائل";
  if (!sender.profile) return "هذا الرقم غير مربوط بملف إرسال الرسائل لدى المزود";
  let number: string;
  try { number = normalizeSmsNumber(to); } catch (e) { return (e as Error).message; }
  const country = parsePhoneNumberFromString(number)?.country;
  if (!country) return "تعذر تحديد بلد المستلم";
  if (country === sender.country) {
    if (!sender.domestic) return "هذا الرقم لا يدعم الرسائل المحلية";
  } else if (!sender.international) {
    return "هذا الرقم لا يدعم إرسال الرسائل دولياً؛ يلزم خط يدعم بلد المستلم لدى المزود";
  }
  return "";
}

export function estimateSmsCost(parts: number, previous: { parts: number; cost_amount: string | null; cost_currency: string | null } | undefined) {
  if (!previous?.cost_amount || previous.parts < 1 || !previous.cost_currency) return null;
  const amount = Number(previous.cost_amount);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return { amount: (amount / previous.parts * parts).toFixed(5), currency: previous.cost_currency };
}

export function smsStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "مسودة", submitting: "جارٍ التسليم للمزود", queued: "في الانتظار لدى المزود", sending: "جارٍ الإرسال",
    sent: "أُرسلت — الوصول غير مؤكد", delivered: "تم التسليم", sending_failed: "فشل الإرسال",
    delivery_failed: "فشل التسليم", delivery_unconfirmed: "التسليم غير مؤكد", failed: "رفض الإرسال",
    unknown: "النتيجة غير مؤكدة — لا تعِد الإرسال قبل التحقق",
  };
  return labels[status] ?? "بانتظار تأكيد المزود";
}