import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { normalizeSmsNumber, smsMetrics, smsRouteProblem, type SmsSenderNumber } from "./sms";

type Context = { supabase: SupabaseClient<Database>; userId: string };
type CarrierMessage = {
  id?: string;
  parts?: number;
  to?: { status?: string }[];
  cost?: { amount?: string; currency?: string } | null;
  errors?: { detail?: string; title?: string }[];
};

async function smsContext(context: Context) {
  const { data: admin, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error || !admin) throw new Error("الرسائل النصية متاحة للمالك فقط حالياً");
  const { data: store, error: storeError } = await context.supabase.from("stores").select("id")
    .eq("owner_id", context.userId).order("created_at").limit(1).maybeSingle();
  if (storeError || !store) throw new Error("تعذر تحديد متجر حسابك");
  return { db: context.supabase, storeId: store.id };
}

function carrierKey() {
  const key = process.env["TELNYX_API_KEY"];
  if (!key) throw new Error("إعدادات مزود الرسائل ناقصة");
  return key;
}

async function carrierRequest(path: string, init: RequestInit = {}) {
  return fetch(`https://api.telnyx.com/v2${path}`, {
    ...init, signal: AbortSignal.timeout(25000),
    headers: { ...init.headers, Authorization: `Bearer ${carrierKey()}`, "Content-Type": "application/json" },
  });
}

async function senderNumbers(): Promise<SmsSenderNumber[]> {
  const numbers: SmsSenderNumber[] = [];
  for (let page = 1; page <= 10; page++) {
    const response = await carrierRequest(`/phone_numbers/messaging?page[size]=100&page[number]=${page}`);
    const body = await response.json() as { data?: { phone_number: string; country_code?: string; messaging_profile_id?: string | null; features?: { sms?: { domestic_two_way?: boolean; international_outbound?: boolean } | null } }[]; meta?: { total_pages?: number } };
    if (!response.ok) throw new Error("تعذر قراءة أرقام الرسائل من المزود");
    const rows = body.data ?? [];
    numbers.push(...rows.map((row) => ({
      number: row.phone_number, country: row.country_code ?? "", profile: Boolean(row.messaging_profile_id),
      domestic: row.features?.sms?.domestic_two_way === true, international: row.features?.sms?.international_outbound === true,
    })));
    if (rows.length < 100 || (body.meta?.total_pages && page >= body.meta.total_pages)) break;
  }
  return numbers;
}

export const smsSetup = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, storeId } = await smsContext(context);
    const [history, contacts, customers, senders] = await Promise.all([
      db.from("sms_messages").select("*").eq("store_id", storeId).order("created_at", { ascending: false }).limit(100),
      db.from("sms_contacts").select("id,name,phone").eq("store_id", storeId).order("name").limit(500),
      db.from("customers").select("id,name,phone").eq("store_id", storeId).order("name").limit(500),
      senderNumbers().then((numbers) => ({ numbers, error: "" })).catch((e: unknown) => ({ numbers: [] as SmsSenderNumber[], error: e instanceof Error ? e.message : "تعذر قراءة الخط" })),
    ]);
    if (history.error || contacts.error || customers.error) throw new Error("تعذر تحميل سجل الرسائل وجهات الاتصال");
    const merged = new Map<string, { name: string; phone: string }>();
    for (const row of [...(customers.data ?? []), ...(contacts.data ?? [])]) {
      if (!row.phone) continue;
      merged.set(row.phone, { name: row.name, phone: row.phone });
    }
    return { history: history.data ?? [], contacts: [...merged.values()], senders: senders.numbers, carrierError: senders.error };
  });

export const smsSaveContact = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: { phone: string; name: string }) => ({ phone: normalizeSmsNumber(input.phone), name: input.name.trim().slice(0, 100) }))
  .handler(async ({ context, data }) => {
    const { db, storeId } = await smsContext(context);
    const { error } = await db.from("sms_contacts").upsert({ store_id: storeId, ...data }, { onConflict: "store_id,phone" });
    if (error) throw new Error("تعذر حفظ جهة الاتصال");
    return { ok: true };
  });

export const smsSaveDraft = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: { id?: string; from: string; to: string; text: string }) => {
    if (!input.text.trim()) throw new Error("اكتب نص الرسالة");
    if (input.text.length > 670) throw new Error("الرسالة تتجاوز حد 670 وحدة نصية؛ اختصرها دون قص تلقائي");
    return { ...input, to: normalizeSmsNumber(input.to), from: input.from ? normalizeSmsNumber(input.from) : "" };
  }).handler(async ({ context, data }) => {
    const { db, storeId } = await smsContext(context);
    const values = { from_number: data.from, to_number: data.to, text: data.text, parts: smsMetrics(data.text).parts, updated_at: new Date().toISOString() };
    const query = data.id
      ? db.from("sms_messages").update(values).eq("id", data.id).eq("store_id", storeId).eq("status", "draft")
      : db.from("sms_messages").insert({ ...values, store_id: storeId, user_id: context.userId });
    const { data: row, error } = await query.select("*").single();
    if (error || !row) throw new Error("تعذر حفظ المسودة أو لم تعد قابلة للتعديل");
    return row;
  });

// Only a saved draft can be submitted. Atomic claiming plus carrier idempotency prevents double billing on double clicks.
export const smsSendDraft = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: input.id }))
  .handler(async ({ context, data }) => {
    const { db, storeId } = await smsContext(context);
    const { data: draft, error: readError } = await db.from("sms_messages").select("*").eq("id", data.id).eq("store_id", storeId).single();
    if (readError || !draft) throw new Error("المسودة غير موجودة");
    if (draft.status !== "draft") throw new Error("هذه الرسالة سبق تقديمها؛ حدّث حالتها ولا تكرر الإرسال");
    const senders = await senderNumbers();
    const problem = smsRouteProblem(senders.find((s) => s.number === draft.from_number), draft.to_number);
    if (problem) throw new Error(problem);
    const { data: claimed, error: claimError } = await db.from("sms_messages").update({ status: "submitting", updated_at: new Date().toISOString() })
      .eq("id", draft.id).eq("store_id", storeId).eq("status", "draft").select("id").maybeSingle();
    if (claimError || !claimed) throw new Error("الرسالة قيد الإرسال؛ لا تكرر الطلب");
    let response: Response;
    let body: { data?: CarrierMessage; errors?: { detail?: string; title?: string }[] };
    try {
      response = await carrierRequest("/messages", { method: "POST", headers: { "Idempotency-Key": draft.id }, body: JSON.stringify({
        from: draft.from_number, to: draft.to_number, text: draft.text, type: "SMS",
        encoding: smsMetrics(draft.text).encoding === "GSM-7" ? "gsm7" : "ucs2", auto_detect: true,
      }) });
      body = await response.json();
    } catch {
      await db.from("sms_messages").update({ status: "unknown", error: "انقطع رد المزود؛ تحقّق لديه قبل أي إعادة إرسال", updated_at: new Date().toISOString() }).eq("id", draft.id).eq("store_id", storeId);
      throw new Error("نتيجة الإرسال غير مؤكدة؛ لا تعِد الإرسال قبل التحقق من المزود");
    }
    if (!response.ok || !body.data?.id) {
      const uncertain = response.status >= 500 || response.status === 409 || response.ok;
      const message = uncertain ? "رد المزود غير مؤكد؛ تحقّق قبل إعادة الإرسال" : (body.errors?.[0]?.detail ?? body.errors?.[0]?.title ?? "رفض مزود الرسائل الإرسال");
      await db.from("sms_messages").update({ status: uncertain ? "unknown" : "failed", error: message, updated_at: new Date().toISOString() }).eq("id", draft.id).eq("store_id", storeId);
      throw new Error(message);
    }
    const result = body.data;
    const { data: row, error } = await db.from("sms_messages").update({
      provider_id: result.id, status: result.to?.[0]?.status ?? "queued", parts: result.parts ?? draft.parts,
      cost_amount: result.cost?.amount ?? null, cost_currency: result.cost?.currency ?? null, error: null, updated_at: new Date().toISOString(),
    }).eq("id", draft.id).eq("store_id", storeId).select("*").single();
    if (error || !row) throw new Error("المزود قبل الرسالة لكن تعذر تحديث السجل؛ لا تكرر الإرسال");
    return row;
  });

export const smsRefreshStatus = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    const { db, storeId } = await smsContext(context);
    const { data: row } = await db.from("sms_messages").select("*").eq("store_id", storeId).eq("id", data.id).single();
    if (!row?.provider_id) throw new Error("ما فيه رقم تتبع من المزود؛ لا تعِد الإرسال إذا النتيجة غير مؤكدة");
    const response = await carrierRequest(`/messages/${encodeURIComponent(row.provider_id)}`);
    const body = await response.json() as { data?: CarrierMessage };
    if (!response.ok || !body.data) throw new Error("تعذر قراءة حالة الرسالة من المزود");
    const msg = body.data;
    const { data: updated, error } = await db.from("sms_messages").update({ status: msg.to?.[0]?.status ?? row.status,
      parts: msg.parts ?? row.parts, cost_amount: msg.cost?.amount ?? row.cost_amount, cost_currency: msg.cost?.currency ?? row.cost_currency,
      error: msg.errors?.[0]?.detail ?? null, updated_at: new Date().toISOString(),
    }).eq("id", row.id).eq("store_id", storeId).select("*").single();
    if (error || !updated) throw new Error("تعذر حفظ حالة الرسالة");
    return updated;
  });