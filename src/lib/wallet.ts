import { supabase } from "@/integrations/supabase/client";

export const COSTS = { brain: 1, reply: 1, voice: 2, report: 5 } as const;

export async function getBalance(storeId: string): Promise<number> {
  const { data } = await supabase.rpc("ensure_wallet", { _store: storeId });
  return typeof data === "number" ? data : 0;
}

/** يخصم نقاط من رصيد المتجر؛ يرجع الرصيد الجديد أو null إذا ما يكفي. */
export async function spend(storeId: string, amount: number, reason: string): Promise<number | null> {
  const { data, error } = await supabase.rpc("spend_points", { _store: storeId, _amount: amount, _reason: reason });
  if (error) return null;
  window.dispatchEvent(new CustomEvent("wallet-changed", { detail: data }));
  return data as number;
}

export async function getSetting(key: string): Promise<string> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? "";
}
