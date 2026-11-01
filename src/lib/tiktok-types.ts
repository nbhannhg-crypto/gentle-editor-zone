/** Shared (browser + server) TikTok account types. */
export type TtLog = { n: string; t: string; r?: string; at: number; me?: boolean };
export type TtCtrl = { enabled: boolean; source: "ai" | "smart" | "rules"; delay: number };
export type TtAccount = {
  open_id: string;
  name: string;
  avatar: string;
  ctrl: TtCtrl;
  log: TtLog[];
  linked_at: number;
};
export const defaultTtCtrl = (): TtCtrl => ({ enabled: true, source: "smart", delay: 3 });
/** Staff channel per TikTok account (independent like each WhatsApp number). */
export const ttChannel = (openId: string) => `wa:tt_${openId}` as const;
