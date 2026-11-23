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
    return { token: await r.text(), from: process.env["TELNYX_FROM_NUMBER"] ?? "", balance: (b?.data?.balance as string) ?? "" };
  });
