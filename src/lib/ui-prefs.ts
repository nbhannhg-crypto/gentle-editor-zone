import { supabase } from "@/integrations/supabase/client";
import { getOrCreateMyStore } from "@/lib/stores";

// ☁️ يحفظ إعدادات الواجهة لكل متجر في السحابة (مع نسخة محلية للسرعة)
let storeP: Promise<string | null> | null = null;
const sid = () => (storeP ??= getOrCreateMyStore().then((s) => s?.id ?? null).catch(() => null));

export async function loadPref<T>(key: string): Promise<T | undefined> {
  const id = await sid(); if (!id) return undefined;
  const { data } = await supabase.from("store_ui_prefs").select("value").eq("store_id", id).eq("key", key).maybeSingle();
  return (data?.value as T | undefined) ?? undefined;
}
export async function savePref(key: string, value: unknown) {
  const id = await sid(); if (!id) return;
  await supabase.from("store_ui_prefs").upsert({ store_id: id, key, value: value as never, updated_at: new Date().toISOString() }, { onConflict: "store_id,key" });
}
