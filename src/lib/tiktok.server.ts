/** TikTok accounts per store — kept server-side only (tokens never leave the server). */
import type { TtAccount, TtLog } from "./tiktok-types";

export const ttKey = (store: string) => `__tt_accounts__:${store}`;
export const ttStateKey = (state: string) => `__tt_state__:${state}`;

export type TtFull = TtAccount & { token: string; refresh: string; expires: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function admin(): Promise<any> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    void supabaseAdmin.from; // throws when the service key is missing
    return supabaseAdmin;
  } catch {
    // Same fallback as the WhatsApp webhook: regular project connection.
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"] || "https://fzbkadflmlwgrbuxbtey.supabase.co";
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || "sb_publishable_CMchUjkN04kOIT5y-z_6hA_A7mhsUmZ";
    return createClient(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: { fetch: (input: any, init: any) => { const h = new Headers(init?.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); } },
    });
  }
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
