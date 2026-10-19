import { supabase } from "@/integrations/supabase/client";
import type { VaultClip } from "@/components/VoiceSmartVault";

/** Cloud copy of voice-vault clips (one settings row per clip). localStorage stays the instant source; cloud is best-effort. */
const T = "training_rules";
const mine = (store: string, id: string) => `vv_clip:${store}:${id}`;
const king = (id: string) => `vv_kingdom:${id}`;
type Row = { id: string; trigger_text: string; response_text: string };
const parse = (r: Row): VaultClip | null => { try { return JSON.parse(r.response_text) as VaultClip; } catch { return null; } };

export async function vaultContext(): Promise<{ storeId: string; admin: boolean }> {
  try {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return { storeId: "", admin: false };
    const [{ data: s }, { data: a }] = await Promise.all([
      supabase.from("stores").select("id").eq("owner_id", u.user.id).order("created_at").limit(1).maybeSingle(),
      supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" } as never),
    ]);
    return { storeId: (s as { id?: string } | null)?.id ?? "", admin: !!a };
  } catch { return { storeId: "", admin: false }; }
}

async function upsert(key: string, clip: VaultClip) {
  const body = JSON.stringify(clip);
  const { data } = await supabase.from(T).select("id").eq("trigger_text", key).limit(1).maybeSingle();
  const { error } = data
    ? await supabase.from(T).update({ response_text: body }).eq("id", (data as { id: string }).id)
    : await supabase.from(T).insert({ trigger_text: key, response_text: body, category: "settings", store_id: null } as never);
  if (error) throw error;
}

export const pushClip = (store: string, c: VaultClip) => (store ? upsert(mine(store, c.id), c) : Promise.resolve());
export async function removeClip(store: string, id: string) { if (store) await supabase.from(T).delete().eq("trigger_text", mine(store, id)); }

export async function pullMine(store: string): Promise<VaultClip[]> {
  if (!store) return [];
  const { data } = await supabase.from(T).select("id, trigger_text, response_text").like("trigger_text", `vv_clip:${store}:%`).limit(1000);
  return ((data ?? []) as Row[]).map(parse).filter((x): x is VaultClip => !!x);
}

export async function pullKingdom(): Promise<VaultClip[]> {
  const { data } = await supabase.from(T).select("id, trigger_text, response_text").like("trigger_text", "vv_kingdom:%").limit(1000);
  return ((data ?? []) as Row[]).map(parse).filter((x): x is VaultClip => !!x).map((c) => ({ ...c, id: `kg_${c.id.replace(/^kg_/, "")}`, cat: c.fname && c.cat !== "kingdom" ? `kg:${c.cat}` : "kingdom" }));
}

/** bundle=true keeps the folder identity (cat + fname) so merchants see it as its own Kingdom folder. */
export async function publishKingdom(c: VaultClip, on: boolean, bundle = false) {
  const id = c.id.replace(/^kg_/, "");
  if (on) await upsert(king(id), bundle && c.fname ? { ...c, id } : { ...c, id, cat: "kingdom" });
  else await supabase.from(T).delete().eq("trigger_text", king(id));
}

/** Queen: every merchant clip (store id comes from the key). */
export async function pullAllMerchants(): Promise<(VaultClip & { store: string })[]> {
  const { data } = await supabase.from(T).select("id, trigger_text, response_text").like("trigger_text", "vv_clip:%").limit(2000);
  return ((data ?? []) as Row[]).flatMap((r) => { const c = parse(r); return c ? [{ ...c, store: r.trigger_text.split(":")[1] ?? "" }] : []; });
}

/** Queen: edit a merchant clip in place. */
export const queenUpdate = (store: string, c: VaultClip) => upsert(mine(store, c.id), c);
