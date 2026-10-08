import { BRAND_DEFAULTS, BRAND_KEYS, type BrandNames } from "./branding";

let cache: { at: number; names: BrandNames } | null = null;
const TTL = 5 * 60_000;

/** قراءة أسماء العرض للاستخدام داخل دوال السيرفر (مع تخزين مؤقت). */
export async function getBrandNames(): Promise<BrandNames> {
  if (cache && Date.now() - cache.at < TTL) return cache.names;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("key,value")
      .in("key", Object.values(BRAND_KEYS));
    const names: BrandNames = { ...BRAND_DEFAULTS };
    for (const row of (data ?? []) as { key: string; value: string }[]) {
      const v = String(row.value ?? "").trim();
      if (!v) continue;
      if (row.key === BRAND_KEYS.voice) names.voice = v;
      else if (row.key === BRAND_KEYS.ai) names.ai = v;
      else if (row.key === BRAND_KEYS.chat) names.chat = v;
    }
    cache = { at: Date.now(), names };
    return names;
  } catch {
    return BRAND_DEFAULTS;
  }
}

export function resetBrandCache() {
  cache = null;
}
