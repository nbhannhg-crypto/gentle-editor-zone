// Live WhatsApp controls stored as one special row in the rules table (readable by the webhook without extra setup).
export const CTRL_PREFIX = "__wa_settings__:";
export type WaLog = { n: string; t: string; r?: string; at: number; me?: boolean };
export type WaCtrl = {
  enabled: boolean;
  source: "smart" | "rules" | "ai";
  allowed: string;
  prompt: string;
  delay: number;
  paused: string[];
  brains: string[];
  misses: { n: string; t: string; at: number }[];
  // Additive fields (old rows simply get the defaults)
  mode: "auto" | "approval";
  voice: boolean;
  facts: string;
  banned: string;
  fixes: string;
  blocked: string;
  model: string;
  pending: { n: string; t: string; s: string; at: number }[];
  log: WaLog[];
  /** Match strictness in percent (50, 60, 80, 100). */
  match: number;
};
export const defaultCtrl = (): WaCtrl => ({
  enabled: true, source: "smart", allowed: "", prompt: "", delay: 3, paused: [], brains: [], misses: [],
  mode: "auto", voice: false, facts: "", banned: "", fixes: "", blocked: "", model: "", pending: [], log: [], match: 60,
});
export const parseCtrl = (s: string | null | undefined): WaCtrl => {
  try { return { ...defaultCtrl(), ...(JSON.parse(s || "{}") as Partial<WaCtrl>) }; } catch { return defaultCtrl(); }
};
export const digits = (s: string) => s.replace(/\D/g, "");

/** Store rules are only the general taught rules; section overflow rows (category = section name) belong to their own button. */
export const GENERAL_OR = 'category.is.null,category.in.(عام,السعر,التوصيل,الجودة,التأجيل)';

/** Full instructions for the AI built from the panel fields. */
export const ctrlPrompt = (c: WaCtrl) => [
  c.prompt && `الشخصية والأسلوب: ${c.prompt}`,
  c.facts && `معلومات المتجر المعتمدة: ${c.facts}`,
  c.banned && `ممنوع تستخدمين هالكلمات أبداً: ${c.banned}`,
  c.fixes && `أخطاء سابقة لا تكررينها: ${c.fixes}`,
].filter(Boolean).join("\n");

/** Banned words list ("كلمة" or "خطأ = صح" for automatic correction). */
export const cleanReply = (c: WaCtrl, reply: string) => {
  let out = reply;
  for (const line of c.banned.split(/[\n,،]+/)) {
    const [bad, good] = line.split("=").map((x) => x?.trim() ?? "");
    if (bad) out = out.split(bad).join(good ?? "");
  }
  return out.replace(/\s{2,}/g, " ").trim();
};
export const listHas = (list: string, sender: string) =>
  list.split(/[\n,،;\s]+/).map(digits).filter((n) => n.length >= 5).some((n) => sender.endsWith(n) || n.endsWith(sender));
