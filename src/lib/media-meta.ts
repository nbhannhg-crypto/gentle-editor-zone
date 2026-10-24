import { supabase } from "@/integrations/supabase/client";
import { normalizeArabic } from "@/lib/media-match";

/** Cloud metadata for media-library items (stored as settings rows, same pattern as the voice vault). */
export type MediaMeta = {
  active: boolean;
  folder: string;
  triggers: string[];
  tags: string[];
  questions: string[];
  ocr: string;
  summary: string;
  sends: number;
  plays: number;
  /** وقت الحذف (سلة المحذوفات) — 0 = غير محذوف */
  deletedAt?: number;
};
export const emptyMeta = (): MediaMeta => ({ active: true, folder: "", triggers: [], tags: [], questions: [], ocr: "", summary: "", sends: 0, plays: 0 });

const T = "training_rules";
const key = (store: string, id: string) => `ml_meta:${store}:${id}`;

export async function pullMeta(store: string): Promise<Record<string, MediaMeta>> {
  if (!store) return {};
  const { data } = await supabase.from(T).select("trigger_text, response_text").like("trigger_text", `ml_meta:${store}:%`).limit(2000);
  const out: Record<string, MediaMeta> = {};
  for (const r of (data ?? []) as { trigger_text: string; response_text: string }[]) {
    try { out[r.trigger_text.split(":")[2] ?? ""] = { ...emptyMeta(), ...JSON.parse(r.response_text) }; } catch { /* skip */ }
  }
  return out;
}

export async function pushMeta(store: string, id: string, m: MediaMeta) {
  if (!store) return;
  const k = key(store, id);
  const body = JSON.stringify(m);
  const { data } = await supabase.from(T).select("id").eq("trigger_text", k).limit(1).maybeSingle();
  const { error } = data
    ? await supabase.from(T).update({ response_text: body }).eq("id", (data as { id: string }).id)
    : await supabase.from(T).insert({ trigger_text: k, response_text: body, category: "settings", store_id: null } as never);
  if (error) throw error;
}

export async function removeMeta(store: string, id: string) {
  if (store) await supabase.from(T).delete().eq("trigger_text", key(store, id));
}

export { normalizeArabic };
