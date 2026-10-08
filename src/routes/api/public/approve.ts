import { createFileRoute } from "@tanstack/react-router";

const page = (title: string, body: string, color: string) => new Response(
  `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:linear-gradient(135deg,#fff7ed,#fed7aa)">
<div style="background:#fff;border-radius:24px;padding:40px;max-width:420px;text-align:center;box-shadow:0 20px 50px -20px #ea580c88;border-top:6px solid ${color}">
<h1 style="color:${color};font-size:26px;margin:0 0 12px">${title}</h1><p style="font-size:18px;color:#444">${body}</p><p style="margin-top:24px;color:#ea580c">👑 مملكة المبيعات</p></div></body></html>`,
  { headers: { "content-type": "text/html; charset=utf-8" } },
);

export const Route = createFileRoute("/api/public/approve")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token") ?? "";
        if (!/^[a-f0-9]{32}$/.test(token)) return page("⛔ رابط غير صحيح", "تأكد من الرابط.", "#dc2626");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("approve_payment", { _token: token });
        if (error) return page("⛔ خطأ", "حاول مرة ثانية.", "#dc2626");
        const r = data as { result: string; points?: number; at?: string; status?: string };
        if (r.result === "ok") return page("✅ تم الشحن بنجاح", `تم إضافة ${r.points?.toLocaleString("ar-SA")} نقطة 💎`, "#16a34a");
        if (r.result === "done") return page("⚠️ تمت المعالجة مسبقاً", `هذا الطلب ${r.status === "approved" ? "تمت الموافقة عليه" : "تمت معالجته"} بتاريخ ${r.at ? new Date(r.at).toLocaleString("ar-SA") : ""}`, "#ea580c");
        if (r.result === "expired") return page("⌛ انتهت صلاحية الرابط", "الرابط صالح 24 ساعة فقط.", "#dc2626");
        return page("⛔ الطلب غير موجود", "", "#dc2626");
      },
    },
  },
});
