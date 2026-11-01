/** TikTok accounts per store — kept server-side only (tokens never leave the server). */
import type { TtAccount, TtLog } from "./tiktok-types";

export const ttKey = (store: string) => `__tt_accounts__:${store}`;
export const ttStateKey = (state: string) => `__tt_state__:${state}`;

export type TtFull = TtAccount & { token: string; refresh: string; expires: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function loadAccounts(store: string): Promise<TtFull[]> {
  const db = await admin();
  const { data } = await db.from("training_rules").select("response_text").eq("trigger_text", ttKey(store)).limit(1).maybeSingle();
  try { return (JSON.parse(data?.response_text ?? "[]") as TtFull[]) ?? []; } catch { return []; }
}

export async function saveAccounts(store: string, list: TtFull[]): Promise<void> {
  const db = await admin();
  const body = JSON.stringify(list);
  const { data } = await db.from("training_rules").select("id").eq("trigger_text", ttKey(store)).limit(1).maybeSingle();
  if (data) await db.from("training_rules").update({ response_text: body }).eq("id", data.id);
  else await db.from("training_rules").insert({ trigger_text: ttKey(store), response_text: body, category: "settings", store_id: store });
}

/** Find the store that owns a TikTok open_id. */
export async function findOwner(openId: string): Promise<{ store: string; list: TtFull[] } | null> {
  const db = await admin();
  const { data } = await db.from("training_rules").select("trigger_text, response_text").like("trigger_text", "__tt_accounts__:%").limit(1000);
  for (const r of (data ?? []) as { trigger_text: string; response_text: string }[]) {
    try {
      const list = JSON.parse(r.response_text) as TtFull[];
      if (list.some((a) => a.open_id === openId)) return { store: r.trigger_text.slice("__tt_accounts__:".length), list };
    } catch { /* ignore */ }
  }
  return null;
}

export const publicView = (a: TtFull): TtAccount => {
  const { token: _t, refresh: _r, expires: _e, ...rest } = a;
  return rest;
};

export const pushLog = (a: TtFull, m: TtLog) => { a.log = [...(a.log ?? []), m].slice(-300); };
