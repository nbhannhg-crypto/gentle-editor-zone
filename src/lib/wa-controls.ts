// Live WhatsApp controls stored as one special row in the rules table (readable by the webhook without extra setup).
export const CTRL_PREFIX = "__wa_settings__:";
export type WaCtrl = {
  enabled: boolean;
  source: "smart" | "rules" | "ai";
  allowed: string;
  prompt: string;
  delay: number;
  paused: string[];
  brains: string[];
  misses: { n: string; t: string; at: number }[];
};
export const defaultCtrl = (): WaCtrl => ({ enabled: true, source: "smart", allowed: "", prompt: "", delay: 3, paused: [], brains: [], misses: [] });
export const parseCtrl = (s: string | null | undefined): WaCtrl => {
  try { return { ...defaultCtrl(), ...(JSON.parse(s || "{}") as Partial<WaCtrl>) }; } catch { return defaultCtrl(); }
};
export const digits = (s: string) => s.replace(/\D/g, "");
