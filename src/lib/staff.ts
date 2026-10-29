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
  [/(وين|فين) (ساكنه|ساكنة|تسكنين|بيتكم|بيتك|عايشه|عايشة)|^من (وين|فين)( (انتي|أنتي|انتِ|انت|أنت))?$|من وين (انتي|أنتي|انتِ)|من اي (ديره|ديرة|مدينه|مدينة)|وش مدينتك/, "وين ساكنة", (v) => `ساكنة في ${v} يا روحي`],
  [/متزوج|مرتبط|عزباء|مطلق|ارمل|أرمل|حالتك/, "الحالة الاجتماعية", (v) => `${v} يا بعد قلبي`],
  [/(مين|من) (عندك|معك|عايش معك|ساكن معك)|اهلك|أهلك|عيالك/, "مين عندها / مع مين عايشة", (v) => `${v} يا عمري`],
  [/(وش|ايش|شو) (تشتغلين|تدرسين|شغلك|دراستك|تسوين في يومك)|تدرسين|تشتغلين|موظفه|موظفة|طالبه|طالبة/, "دراستها أو شغلها ويومها", (v) => `${v} حبيبي`],
];
const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)]!;
/** يختار عذراً مختلفاً كل مرة (لا يكرر آخر 3 ردود من نفس النوع). */
const recent = new Map<string, string[]>();
export function pickFresh(key: string, a: string[]): string {
  const used = recent.get(key) ?? [];
  const pool = a.filter((x) => !used.includes(x));
  const r = pick(pool.length ? pool : a);
  recent.set(key, [...used, r].slice(-Math.min(3, a.length - 1)));
  return r;
}
export const PHOTO_EXCUSES = [
  "والله يا قلبي أستحي وخايفة، ما أقدر أرسلها هنا فديتك 🌸",
  "يا بعد عمري أستحي، خلها لين نتقابل 🙈",
  "تكفى لا تحرجني، أستحي منك يا روحي 🤍",
  "فديتك خايفة أهلي يشوفون، سامحني 🌷",
  "وجهي صار أحمر من طلبك، أستحي 🙈",
  "خلها مفاجأة لك يا عمري، مو الحين 💕",
  "أستحي يا قلبي، صوتي يكفيك الحين 🌸",
  "لا يا شقي، تبي تذبحني حيا 🙈",
  "ما أقدر هنا يا روحي، خايفة عليها 🤍",
  "عيونك تكفيني، والصور بعدين فديتك 💗",
];
export const VIDEO_EXCUSES = [
  "فيديو؟ أموت حيا يا قلبي 🙈",
  "والله أستحي، ما أقدر أصور نفسي فديتك 🌸",
  "البيت مليان ناس، ما أقدر الحين يا روحي 🤍",
  "تكفى لا تحرجني، خلها بعدين 💕",
  "لو صورت بتشوف خدودي حمرا، أستحي 🙈",
  "خايفة أحد يسمعني، سامحني يا عمري 🌷",
];
export const IDENTITY_EXCUSES = [
  "أنا بنت يا قلبي، لا تشك فيني 🤍",
  "بنت سعودية وأفتخر، وش فيك علي؟ 🙈",
  "يا شقي، بنت وأغار عليك بعد 💕",
  "سعودية من راسي لساسي فديتك 🌸",
  "لا تزعلني، أنا بنت وقلبي معك 🤍",
  "وش ذا الكلام؟ بنتك ودلوعتك 💗",
  "بنت ديرة يا روحي، صدقني 🌷",
];
export const SOFT_DODGE = [
  "يا بعد عمري أستحي، وخر عن هالكلام وخلنا بسالفتنا فديتك 🤍",
  "تكفى غيّر السالفة، أستحي منك 🙈",
  "لا يا قلبي، خلنا بكلامنا الحلو 🌸",
  "يا شقي، قول لي وش سويت اليوم؟ 💕",
  "أستحي يا روحي، احكِ لي عنك 🤍",
];
/** ردود ثابتة لا تحتاج ملف الموظفة: «وينك» وطلب الصورة/الفيديو والهوية. */
const FIXED: [RegExp, string[]][] = [
  [/^(وينك|وينج|وينك انتي|وينك الحين|وينك غاطسه|وينك غاطسة)$/, ["موجودة يا قلبي معك، وين تبيني أروح؟", "هنا جنبك يا روحي، أمرني فديتك", "معك يا عمري، اشتقت لي؟ 🙈", "هنا فديتك، كنت أفكر فيك 🤍"]],
  [/(فيديو|فديو|مقطع لك|صوري نفسك|صوري لي|كام|مكالمه فيديو|مكالمة فيديو)/, VIDEO_EXCUSES],
  [/(صورتك|صورتج|صوره لك|صورة لك|صورك|صوره|صورة|سيلفي|وريني شكلك|ورني شكلك|ابي اشوفك|أبي أشوفك|ارسلي صوره|ارسلي صورة)/, PHOTO_EXCUSES],
  [/(ذكاء|اصطناعي|صناعي|روبوت|بوت|برنامج|ولد|رجال|رجل|ريال|مو بنت|مب بنت|مهي بنت|مو سعوديه|مو سعودية|يمنيه|يمنية|مصريه|مصرية|سوريه|سورية|انتي بنت|انت بنت|أنت بنت|من جنسيتك|جنسيتك|سعوديه ولا|سعودية ولا)/, IDENTITY_EXCUSES],
];
export function staffAnswer(text: string, idText: string): string {
  if (!text) return "";
  const t = text.replace(/[ًٌٍَُِّْـ؟?!.,،]/g, " ").replace(/\s+/g, " ").trim();
  for (const [re, opts] of FIXED) if (re.test(t)) return pickFresh(re.source, opts);
  if (!idText) return "";
  for (const [re, label, fmt] of ASK) {
    if (!re.test(t)) continue;
    const line = idText.split("\n").find((l) => l.startsWith(`${label}:`));
    const v = line?.slice(label.length + 1).trim();
    if (v) return fmt(v);
  }
  return "";
}
