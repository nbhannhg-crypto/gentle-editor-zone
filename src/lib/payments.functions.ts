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
    const url = (process.env["EVO_LIVE_URL"] || process.env["EVOLUTION_API_URL"])?.replace(/\/$/, "");
    const key = process.env["EVO_LIVE_KEY"] || process.env["EVOLUTION_API_KEY"];
    if (!url || !key) return { sent: false, error: "whatsapp not configured" };
    const call = async (path: string, method = "GET", body?: unknown) => {
      const r = await fetch(`${url}${path}`, { method, headers: { apikey: key, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const t = await r.text();
      if (!r.ok) throw new Error(`Evolution ${r.status}: ${t.slice(0, 200)}`);
      try { return JSON.parse(t); } catch { return t; }
    };
    try {
      const all = (await call("/instance/fetchInstances")) as any[];
      const list = Array.isArray(all) ? all : [];
      const owner = (i: any) => String(i?.ownerJid ?? i?.instance?.owner ?? "");
      const state = (i: any) => String(i?.connectionStatus ?? i?.instance?.status ?? i?.instance?.state ?? "");
      // رقم الموقع الثابت فقط — لازم تكون جلسته مفتوحة
      const inst = list.find((i) => owner(i).includes(SITE_NUMBER));
      const name = inst?.name ?? inst?.instance?.instanceName;
      if (!name) { console.error(`sendWhatsappApproval: رقم الموقع ${SITE_NUMBER} غير مربوط بسيرفر الواتساب`); return { sent: false, error: "site number not connected" }; }
      if (state(inst) && state(inst) !== "open") console.error(`sendWhatsappApproval: جلسة ${SITE_NUMBER} حالتها ${state(inst)} — امسح QR من جديد`);
      const origin = new URL(data.origin).origin;
      const text = `طلب شحن جديد 💰\nالمبلغ: ${p.amount_paid} ${p.currency} = ${p.points_calculated} نقطة\nرقم العملية: ${p.transaction_number}\nللموافقة اضغط: ${origin}/api/public/approve?token=${p.approval_token}`;
      await call(`/message/sendText/${encodeURIComponent(name)}`, "POST", { number: OWNER_NUMBER, text });
      return { sent: true };
    } catch (e) {
      console.error("sendWhatsappApproval", e);
      return { sent: false, error: (e as Error).message };
    }
  });

/** المالك فقط: اعتماد أو رفض طلب شحن من pending_payments مباشرة من لوحة التحكم. */
export const adminReviewPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ paymentId: z.string().uuid(), approve: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!ok) throw new Error("هذه العملية للمالك فقط");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p, error } = await supabaseAdmin.from("pending_payments").select("approval_token, status").eq("id", data.paymentId).maybeSingle();
    if (error || !p) throw new Error("الطلب غير موجود");
    if (p.status !== "pending") return { result: "done" };
    if (data.approve) {
      const { data: r, error: e } = await supabaseAdmin.rpc("approve_payment", { _token: p.approval_token });
      if (e) throw new Error(e.message);
      return r as { result: string; points?: number };
    }
    await supabaseAdmin.from("pending_payments").update({ status: "rejected", processed_at: new Date().toISOString() }).eq("id", data.paymentId);
    return { result: "rejected" };
  });
