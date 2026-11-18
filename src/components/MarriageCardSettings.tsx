import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/** Owner control: whether the customer sees/saves the royal card after submitting, plus a custom note printed on it. */
export function CardSettings({ storeId }: { storeId: string }) {
  const [allow, setAllow] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void supabase.rpc("get_marriage_card_setting", { _store: storeId }).then(({ data }) => { const d = data as { allow: boolean; note: string } | null; if (d) { setAllow(d.allow); setNote(d.note); } }); }, [storeId]);
  const save = async (a = allow, n = note) => {
    setBusy(true);
    const { error } = await supabase.from("marriage_wa_settings").upsert({ store_id: storeId, card_customer: a, card_note: n.slice(0, 160) }, { onConflict: "store_id" });
    setBusy(false); if (error) toast.error("ما انحفظ الإعداد"); else toast.success("انحفظ ✅");
  };
  return (
    <details className="rounded-2xl border-2 border-gold bg-card p-3">
      <summary className="cursor-pointer font-bold">👑 إعدادات الكرت الملكي</summary>
      <label className="mt-3 flex items-center justify-between gap-2 text-sm"><span>السماح للزبون يشوف ويحفظ كرته بعد التسجيل</span>
        <button disabled={busy} onClick={() => { setAllow(!allow); void save(!allow, note); }} className={`rounded-full px-4 py-1 text-xs font-bold ${allow ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{allow ? "شغّال" : "مطفي"}</button></label>
      <label className="mt-3 block text-xs text-muted-foreground">رسالة أو معلومة مخصصة تنطبع في الكرت (اختياري، مثل رقم الترخيص)
        <input value={note} maxLength={160} onChange={(e) => setNote(e.target.value)} placeholder="مثال: نتشرف بخدمتك 🤍" className="mt-1 w-full rounded-lg border bg-background p-2 text-sm text-foreground" /></label>
      <button disabled={busy} onClick={() => void save()} className="mt-2 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground">💾 حفظ الرسالة</button>
      <p className="mt-2 text-[11px] text-muted-foreground">لتوليد كرت أي طلب: افتح الطلب واضغط «🪪 كرت للنشر» — تلاقي نسخة النشر المحجوبة والنسخة الخاصة الكاملة.</p>
    </details>
  );
}
