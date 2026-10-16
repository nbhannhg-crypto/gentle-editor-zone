import { supabase } from "@/integrations/supabase/client";

/** Merchant library sections saved in the cloud (one settings row per store) — works on any phone/browser. */
const keyOf = (storeId: string) => `mb_sections:${storeId}`;

export async function loadSections(storeId: string): Promise<string[]> {
  if (!storeId) return [];
  const { data } = await supabase.from("training_rules").select("response_text").eq("trigger_text", keyOf(storeId)).limit(1).maybeSingle();
  let list: string[] = [];
  try { list = JSON.parse((data as any)?.response_text || "[]"); } catch { list = []; }
  // One-time move of any old sections kept on this device into the cloud
  try {
    const old = JSON.parse(localStorage.getItem(`mb_sections_${storeId}`) || "[]");
    const merged = [...new Set([...list, ...(Array.isArray(old) ? old.map(String) : [])])];
    if (merged.length !== list.length) { await saveSections(storeId, merged); list = merged; }
  } catch { /* ignore */ }
  return list;
}

export async function saveSections(storeId: string, list: string[]) {
  if (!storeId) return;
  const body = JSON.stringify([...new Set(list)]);
  const { data } = await supabase.from("training_rules").select("id").eq("trigger_text", keyOf(storeId)).limit(1).maybeSingle();
  const { error } = data
    ? await supabase.from("training_rules").update({ response_text: body }).eq("id", (data as any).id)
    : await supabase.from("training_rules").insert({ trigger_text: keyOf(storeId), response_text: body, category: "settings", store_id: null } as any);
  if (error) throw error;
}

/** Sections of every store the signed-in user owns. */
export async function loadMySections(): Promise<string[]> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return [];
  const { data: stores } = await supabase.from("stores").select("id").eq("owner_id", u.user.id);
  const all = await Promise.all((stores ?? []).map((s: any) => loadSections(s.id)));
  return [...new Set(all.flat())];
}
