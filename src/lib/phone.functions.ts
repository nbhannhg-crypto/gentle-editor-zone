import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Owner-only: mints a short-lived Telnyx WebRTC login token for the web phone.
export const phoneToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("الاتصال متاح للمالك فقط");
    const key = process.env["TELNYX_API_KEY"], cred = process.env["TELNYX_CREDENTIAL_ID"];
    if (!key || !cred) throw new Error("إعدادات الاتصال ناقصة");
    const r = await fetch(`https://api.telnyx.com/v2/telephony_credentials/${cred}/token`, { method: "POST", headers: { Authorization: `Bearer ${key}` } });
    if (!r.ok) throw new Error("تعذر تجهيز الخط");
    const b = await fetch("https://api.telnyx.com/v2/balance", { headers: { Authorization: `Bearer ${key}` } }).then((x) => x.json()).catch(() => null);
    return { token: await r.text(), from: await (await import("@/lib/telnyx-caller.server")).preferredCallerId(key), balance: (b?.data?.balance as string) ?? "" };
  });

async function ownerKey(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!isAdmin) throw new Error("الاتصال متاح للمالك فقط");
  const key = process.env["TELNYX_API_KEY"];
  if (!key) throw new Error("إعدادات الاتصال ناقصة");
  return key;
}
const tx = (key: string, path: string, init?: RequestInit) =>
  fetch(`https://api.telnyx.com/v2${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } });
const e164 = (v: unknown) => {
  const s = String(v ?? "").trim();
  if (!/^\+\d{8,15}$/.test(s)) throw new Error("اكتب الرقم بالصيغة الدولية مثل +9665xxxxxxxx");
  return s;
};

// Caller IDs the carrier accepts: numbers owned on the account + numbers verified by code.
export const phoneCallerIds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const key = await ownerKey(context);
    const [own, ver] = await Promise.all([
      tx(key, "/phone_numbers?page[size]=50").then((r) => r.json()).catch(() => null),
      tx(key, "/verified_numbers?page[size]=50").then((r) => r.json()).catch(() => null),
    ]);
    const owned = ((own?.data ?? []) as any[]).map((n) => String(n.phone_number));
    const verified = ((ver?.data ?? []) as any[]).filter((n) => n.verified_at).map((n) => String(n.phone_number));
    return { owned, verified };
  });

export const phoneVerifyStart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { number: string; method: "sms" | "call" }) => ({ number: e164(d?.number), method: d?.method === "call" ? "call" : "sms" }))
  .handler(async ({ context, data }) => {
    const key = await ownerKey(context);
    const r = await tx(key, "/verified_numbers", { method: "POST", body: JSON.stringify({ phone_number: data.number, verification_method: data.method }) });
    if (!r.ok) { const t = await r.text(); throw new Error("تعذر إرسال الكود: " + (t.match(/"detail":"([^"]+)/)?.[1] ?? r.status)); }
    return { ok: true };
  });

export const phoneVerifyConfirm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { number: string; code: string }) => ({ number: e164(d?.number), code: String(d?.code ?? "").replace(/\D/g, "") }))
  .handler(async ({ context, data }) => {
    const key = await ownerKey(context);
    const r = await tx(key, `/verified_numbers/${encodeURIComponent(data.number)}/actions/verify`, { method: "POST", body: JSON.stringify({ verification_code: data.code }) });
    if (!r.ok) throw new Error("الكود غير صحيح أو انتهى");
    return { ok: true };
  });

// Owner-only SMS through the same carrier account; sender must be a number owned on the account.
export const smsSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { to: string; text: string }) => {
    const text = String(d?.text ?? "").trim().slice(0, 670);
    if (!text) throw new Error("اكتب نص الرسالة");
    return { to: e164(d?.to), text };
  })
  .handler(async ({ context, data }) => {
    const key = await ownerKey(context);
    const own = await tx(key, "/phone_numbers?page[size]=50").then((r) => r.json()).catch(() => null);
    const nums = ((own?.data ?? []) as any[]).map((n) => String(n.phone_number));
    const from = process.env["TELNYX_FROM"] ?? process.env["TELNYX_FROM_NUMBER"] ?? nums[0];
    if (!from) throw new Error("ما فيه رقم مملوك بالحساب للإرسال منه");
    const r = await tx(key, "/messages", { method: "POST", body: JSON.stringify({ from, to: data.to, text: data.text }) });
    const b: any = await r.json().catch(() => null);
    if (!r.ok) throw new Error("تعذر الإرسال: " + (b?.errors?.[0]?.detail ?? b?.errors?.[0]?.title ?? r.status));
    const parts = Number(b?.data?.parts ?? 1);
    const cost = b?.data?.cost?.amount ? String(b.data.cost.amount) : "";
    return { id: String(b?.data?.id ?? ""), from, parts, cost };
  });
