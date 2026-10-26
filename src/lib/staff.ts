/** Shared (browser + server) staff roster types and prompt text. */
export type Identity = { name: string; age: string; status: string; city: string; family: string; work: string; free: string };
export type Staff = Identity & { id: string; avatar: string; tone: string };
export type Channel = "call" | "wa" | "live";
export const CHANNELS: [Channel, string][] = [["call", "📱 مكالمة المملكة"], ["wa", "💬 الواتساب"], ["live", "🎙️ المكالمة المباشرة"]];
/** ch: موظفة لكل قناة — قيمة "off" تعني مطفية، وغيابها يعني الموظفة العامة (active). */
export type StaffRoster = { active: string; list: Staff[]; ch?: Partial<Record<Channel, string>> };

export function pickFor(r: StaffRoster | null | undefined, c?: Channel): Staff | null {
  if (!r?.list?.length) return null;
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
