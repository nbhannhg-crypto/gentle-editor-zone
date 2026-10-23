/** Persona & companion hub settings, stored as one settings row per store (training_rules, key persona_hub:<store>). */
export type Persona = {
  companion: string;
  tone: "dala" | "salfa" | "care";
  words: string;
  banned: string;
  theme: "rose" | "night" | "cashmere" | "royal";
  status: string;
  voice: string;
  avatar: string; // storage path in media-library
  cover: string;
  welcome: string; // audio storage path
};

export const PERSONA_DEFAULT: Persona = {
  companion: "", tone: "dala", words: "تدلل، فديتك، يا بعد روحي، نورت، هلا وغلا", banned: "",
  theme: "rose", status: "متواجدة ومتحمسة لسوالفك 🟢", voice: "", avatar: "", cover: "", welcome: "",
};

export const TONES: [Persona["tone"], string, string][] = [
  ["dala", "💗 دلع ولطافة", "رقيقة ناعمة وكلامها يدخل القلب"],
  ["salfa", "😂 سوالف ووناسة", "عفوية وخفيفة دم سعودية"],
  ["care", "🤍 اهتمام وفضفضة", "دافئة تسمع وتواسي وتعطي طاقة حلوة"],
];

export const THEMES: [Persona["theme"], string, string][] = [
  ["rose", "🌸 وردي مخملي", "theme-rose"],
  ["night", "🌙 بنفسجي ليلي", "theme-night"],
  ["cashmere", "🤎 كشميري دافئ", "theme-cashmere"],
  ["royal", "👑 ذهبي ملكي", "theme-royal"],
];

export const personaKey = (store: string) => `persona_hub:${store}`;
export const statsKey = (store: string) => `persona_stats:${store}`;
export const parsePersona = (s?: string | null): Persona => {
  try { return { ...PERSONA_DEFAULT, ...(JSON.parse(s || "{}") as Partial<Persona>) }; } catch { return { ...PERSONA_DEFAULT }; }
};
