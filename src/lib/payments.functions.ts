import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SITE_NUMBER = "966544810389";
const OWNER_NUMBER = "967712474671";

/** يرسل طلب الموافقة لواتساب المالك من رقم الموقع (سيرفر ← سيرفر). البيانات تُقرأ من القاعدة، مو من المتصفح. */
export const sendWhatsappApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ paymentId: z.string().uuid(), origin: z.string().url().max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: p } = await context.supabase.from("pending_payments")
      .select("amount_paid, currency, points_calculated, transaction_number, approval_token, user_id, status")
      .eq("id", data.paymentId).maybeSingle();
    if (!p || p.user_id !== context.userId || p.status !== "pending") return { sent: false, error: "not found" };
    const url = process.env["EVOLUTION_API_URL"]?.replace(/\/$/, "");
    const key = process.env["EVOLUTION_API_KEY"];
    if (!url || !key) return { sent: false, error: "whatsapp not configured" };
    const call = async (path: string, method = "GET", body?: unknown) => {
      const r = await fetch(`${url}${path}`, { method, headers: { apikey: key, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const t = await r.text();
      if (!r.ok) throw new Error(`Evolution ${r.status}: ${t.slice(0, 200)}`);
      try { return JSON.parse(t); } catch { return t; }
    };
    try {
      const all = (await call("/instance/fetchInstances")) as any[];
      const inst = (Array.isArray(all) ? all : []).find((i) => String(i?.ownerJid ?? i?.instance?.owner ?? "").includes(SITE_NUMBER));
      const name = inst?.name ?? inst?.instance?.instanceName;
      if (!name) return { sent: false, error: "site number not connected" };
      const origin = new URL(data.origin).origin;
      const text = `طلب شحن جديد 💰\nالمبلغ: ${p.amount_paid} ${p.currency} = ${p.points_calculated} نقطة\nرقم العملية: ${p.transaction_number}\nللموافقة اضغط: ${origin}/api/public/approve?token=${p.approval_token}`;
      await call(`/message/sendText/${encodeURIComponent(name)}`, "POST", { number: OWNER_NUMBER, text });
      return { sent: true };
    } catch (e) {
      console.error("sendWhatsappApproval", e);
      return { sent: false, error: (e as Error).message };
    }
  });
