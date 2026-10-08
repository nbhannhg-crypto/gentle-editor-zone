import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BRAND_DEFAULTS, BRAND_KEYS, type BrandNames } from "./branding";

function mapRows(data: { key: string; value: string }[] | null): BrandNames {
  const names: BrandNames = { ...BRAND_DEFAULTS };
  for (const row of data ?? []) {
    const v = String(row.value ?? "").trim();
    if (!v) continue;
    if (row.key === BRAND_KEYS.voice) names.voice = v;
    else if (row.key === BRAND_KEYS.ai) names.ai = v;
    else if (row.key === BRAND_KEYS.chat) names.chat = v;
  }
  return names;
}

export const getBranding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BrandNames> => {
    const { data } = await context.supabase
      .from("app_settings")
      .select("key,value")
      .in("key", Object.values(BRAND_KEYS));
    return mapRows((data as { key: string; value: string }[] | null) ?? null);
  });

const namesSchema = z.object({
  voice: z.string().min(1).max(40),
  ai: z.string().min(1).max(40),
  chat: z.string().min(1).max(40),
});

export const setBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => namesSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("هذا الإعداد للمالك فقط");
    const rows = [
      { key: BRAND_KEYS.voice, value: data.voice.trim() },
      { key: BRAND_KEYS.ai, value: data.ai.trim() },
      { key: BRAND_KEYS.chat, value: data.chat.trim() },
    ];
    const { error } = await context.supabase.from("app_settings").upsert(rows, { onConflict: "key" });
    if (error) throw new Error("تعذر حفظ الأسماء");
    try {
      const { resetBrandCache } = await import("./branding.server");
      resetBrandCache();
    } catch { /* cache refresh best-effort */ }
    return { ok: true };
  });
