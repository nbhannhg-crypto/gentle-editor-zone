/** Shared (browser + server) staff roster types and prompt text. */
export type Identity = { name: string; age: string; status: string; city: string; family: string; work: string; free: string };
export type Staff = Identity & { id: string; avatar: string; tone: string };
export type Channel = "call" | "wa" | "live" | `wa:${string}`;
export const CHANNELS: [Channel, string][] = [["call", "📱 مكالمة المملكة"], ["wa", "💬 الواتساب"], ["live", "🎙️ المكالمة المباشرة"]];
/** ch: موظفة لكل قناة — قيمة "off" تعني مطفية، وغيابها يعني الموظفة العامة (active). */
export type StaffRoster = { active: string; list: Staff[]; ch?: Partial<Record<string, string>> };

export function pickFor(r: StaffRoster | null | undefined, c?: Channel): Staff | null {
  if (!r?.list?.length) return null;
  // كل رقم واتساب (wa:instance) مستقل تماماً — لا يتبع أي رقم آخر
  const v = c ? r.ch?.[c] : undefined;
  if (v === "off") return null;
  if (v) { const s = r.list.find((x) => x.id === v); if (s) return s; }
  return pickActive(r);
}

export const staffKey = (store: string) => `call_staff:${store}`;

const LABELS: [keyof Identity, string][] = [
  ["name", "الاسم"], ["age", "العمر"], ["status", "الحالة الاجتماعية"], ["city", "وين ساكنة"],
  ["family", "مين عندها / مع مين عايشة"], ["work", "دراستها أو شغلها ويومها"],
];

export function identityText(i: Partial<Staff>): string {
  const lines = LABELS.map(([k, l]) => (String(i[k] ?? "").trim() ? `${l}: ${String(i[k]).trim()}` : "")).filter(Boolean);
  if (i.tone?.trim()) lines.push(`طبعها وأسلوبها: ${i.tone.replace(/^\S+\s/, "").trim()}`);
  if (i.free?.trim()) lines.push(`تفاصيل عن حياتها: ${i.free.trim()}`);
  return lines.join("\n");
}

export function pickActive(r: StaffRoster | null | undefined): Staff | null {
  if (!r?.list?.length) return null;
  return r.list.find((s) => s.id === r.active) ?? r.list[0]!;
}

export const staffPromptLine = (text: string) =>
  text ? `هذي هويتك وحياتك الحقيقية، التزمي فيها بالضبط إذا سألك أحد عن نفسك ولا تناقضينها:\n${text}` : "";

export const channelLabel = (c?: Channel) => !c ? "" : c.startsWith("wa:") ? `💬 واتساب ${c.slice(3)}` : CHANNELS.find(([k]) => k === c)?.[1] ?? "";

/** 🥇 يبدأ الرد من هوية الموظفة المناوبة: لو السؤال عنها (اسمها، عمرها، سكنها…) ترد من ملفها فوراً. */
const ASK: [RegExp, string, (v: string) => string][] = [
  [/(وش|ايش|شو|ما) ?(اسمك|إسمك)|مين (انتي|أنتي|انتِ|معي)|مع مين (اكلم|أكلم|اتكلم)|اسمك/, "الاسم", (v) => `أنا ${v} يا قلبي`],
  [/(كم|قد ايش) (عمرك|سنك|عمرج)|عمرك كم/, "العمر", (v) => `عمري ${v} فديتك`],
  [/(وين|فين) (ساكنه|ساكنة|تسكنين|بيتكم|عايشه|عايشة)|^من (وين|فين)( (انتي|أنتي|انتِ|انت|أنت))?$|من وين (انتي|أنتي|انتِ)|^وينك$|من اي (ديره|ديرة|مدينه|مدينة)|وش مدينتك/, "وين ساكنة", (v) => `ساكنة في ${v} يا روحي`],
  [/متزوج|مرتبط|عزباء|مطلق|ارمل|أرمل|حالتك/, "الحالة الاجتماعية", (v) => `${v} يا بعد قلبي`],
  [/(مين|من) (عندك|معك|عايش معك|ساكن معك)|اهلك|أهلك|عيالك/, "مين عندها / مع مين عايشة", (v) => `${v} يا عمري`],
  [/(وش|ايش|شو) (تشتغلين|تدرسين|شغلك|دراستك|تسوين في يومك)|تدرسين|تشتغلين|موظفه|موظفة|طالبه|طالبة/, "دراستها أو شغلها ويومها", (v) => `${v} حبيبي`],
];
export function staffAnswer(text: string, idText: string): string {
  if (!text || !idText) return "";
  const t = text.replace(/[ًٌٍَُِّْـ؟?!.,،]/g, " ").replace(/\s+/g, " ").trim();
  for (const [re, label, fmt] of ASK) {
    if (!re.test(t)) continue;
    const line = idText.split("\n").find((l) => l.startsWith(`${label}:`));
    const v = line?.slice(label.length + 1).trim();
    if (v) return fmt(v);
  }
  return "";
}
