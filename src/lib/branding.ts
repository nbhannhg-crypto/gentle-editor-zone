import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getBranding } from "./branding.functions";

/** أسماء العرض للمزودين الخارجيين — الاسم الحقيقي ما يظهر أبداً للمستخدم. */
export type BrandNames = { voice: string; ai: string; chat: string };

export const BRAND_DEFAULTS: BrandNames = {
  voice: "مختبر الأصوات",
  ai: "العقل الملكي",
  chat: "مركز المحادثات",
};

export const BRAND_KEYS = {
  voice: "brand_voice",
  ai: "brand_ai",
  chat: "brand_chat",
} as const;

/** يقرأ الأسماء المعروضة (مع قيم افتراضية محمية) — تُحدّث من لوحة المالك. */
export function useBranding(): BrandNames {
  const fetchNames = useServerFn(getBranding);
  const { data } = useQuery({
    queryKey: ["branding"],
    queryFn: () => fetchNames(),
    staleTime: 5 * 60_000,
  });
  return data ?? BRAND_DEFAULTS;
}
