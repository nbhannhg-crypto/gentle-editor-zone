import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { M_ALL } from "@/lib/marriage";

/** Turns a messy pasted chat message into marriage-form fields (external AI keys only). */
export const parseMarriageText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ text: z.string().trim().min(5).max(8000) }).parse(d))
  .handler(async ({ data }) => {
    const { aiText } = await import("@/lib/autoreply.server");
    const keys = M_ALL.filter((f) => f.k !== "phone2").map((f) => `"${f.k}": ${f.l}`).join("\n");
    const sys = `استخرج بيانات استمارة زواج من نص محادثة عشوائي. أرجع JSON فقط بدون شرح وبدون علامات كود، بالشكل:
{"gender":"male" أو "female","fields":{...}}
المفاتيح المسموحة داخل fields:\n${keys}
قواعد: لا تخترع أي معلومة غير موجودة في النص؛ اترك المفتاح غير مذكور. الجوال أرقام فقط مع مفتاح الدولة إن وجد. استنتج gender من سياق النص (عريس/عروس، صيغة المتكلم).`;
    const out = await aiText(sys, data.text).catch(() => "");
    if (!out) return { error: "المفاتيح المجانية مشغولة الحين، جرّب بعد شوي", gender: "male", fields: {} as Record<string, string> };
    try {
      const j = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) as { gender?: string; fields?: Record<string, unknown> };
      const allowed = new Set(M_ALL.map((f) => f.k));
      const fields: Record<string, string> = {};
      for (const [k, v] of Object.entries(j.fields ?? {})) if (allowed.has(k) && v != null && String(v).trim()) fields[k] = String(v).trim().slice(0, 1000);
      return { error: "", gender: j.gender === "female" ? "female" : "male", fields };
    } catch {
      return { error: "ما قدرت أفهم النص، جرّب تلصقه كامل", gender: "male", fields: {} as Record<string, string> };
    }
  });
