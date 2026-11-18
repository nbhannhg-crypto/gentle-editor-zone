import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CARD_DEFAULTS, MarriageCardView, type CardOpts } from "@/components/MarriageCard";

type Cfg = { allow: boolean; note: string; opts: CardOpts };
export async function loadCardCfg(storeId: string): Promise<Cfg> {
  const { data } = await supabase.rpc("get_marriage_card_setting", { _store: storeId });
  const d = (data || {}) as Partial<Cfg>;
  return { allow: d.allow ?? true, note: d.note ?? "", opts: (d.opts as CardOpts) || {} };
}

const SAMPLE = { name: "محمد", age: "32", nationality: "سعودي", city: "الرياض", marital: "أعزب", type: "زواج دائم", job: "موظف", height: "175", weight: "75", about: "إنسان هادئ وملتزم ويحب الاستقرار", pAge: "25 - 30", pNationality: "سعودية", phone: "05xxxxxxxx" };

/** Owner control for the royal card: customer visibility, editable printed texts, optional terms & social icons, live preview. */
export function CardSettings({ storeId }: { storeId: string }) {
  const [allow, setAllow] = useState(true);
  const [note, setNote] = useState("");
  const [o, setO] = useState<Required<CardOpts>>({ ...CARD_DEFAULTS });
  const [busy, setBusy] = useState(false);
  useEffect(() => { void loadCardCfg(storeId).then((c) => { setAllow(c.allow); setNote(c.note); setO({ ...CARD_DEFAULTS, ...c.opts }); }); }, [storeId]);
  const save = async (a = allow, opts = o) => {
    setBusy(true);
    const base = { store_id: storeId, card_customer: a, card_note: note.slice(0, 160) };
    let { error } = await supabase.from("marriage_wa_settings").upsert({ ...base, card_opts: opts } as never, { onConflict: "store_id" });
    let partial = false;
    if (error) { partial = true; ({ error } = await supabase.from("marriage_wa_settings").upsert(base, { onConflict: "store_id" })); }
    setBusy(false); if (error) toast.error("ما انحفظ الإعداد"); else if (partial) toast.message("انحفظ التشغيل والرسالة، ونصوص الكرت تنحفظ بعد دقائق — جرّب مرة ثانية"); else toast.success("انحفظ ✅");
  };
  const set = <K extends keyof CardOpts>(k: K, v: Required<CardOpts>[K]) => setO((p) => ({ ...p, [k]: v }));
  const Tg = ({ on, label, k }: { on: boolean; label: string; k: "terms" | "socials" }) => (
    <label className="mt-2 flex items-center justify-between gap-2 text-sm"><span>{label}</span>
      <button disabled={busy} onClick={() => { const n = { ...o, [k]: !on }; setO(n); void save(allow, n); }} className={`rounded-full px-4 py-1 text-xs font-bold ${on ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{on ? "ظاهر" : "مخفي"}</button></label>
  );
  const F = ({ k, label, ph, area }: { k: "tagline" | "badge" | "live" | "footer" | "handle" | "whatsapp" | "termsText"; label: string; ph?: string; area?: boolean }) => (
    <label className="mt-2 block text-xs text-muted-foreground">{label}
      {area ? <textarea rows={3} value={o[k]} onChange={(e) => set(k, e.target.value)} className="mt-1 w-full rounded-lg border bg-background p-2 text-sm text-foreground" />
        : <input value={o[k]} placeholder={ph} maxLength={90} onChange={(e) => set(k, e.target.value)} className="mt-1 w-full rounded-lg border bg-background p-2 text-sm text-foreground" />}
    </label>
  );
  return (
    <details className="rounded-2xl border-2 border-gold bg-card p-3">
      <summary className="cursor-pointer font-bold">👑 إعدادات الكرت الملكي</summary>
      <label className="mt-3 flex items-center justify-between gap-2 text-sm"><span>السماح للزبون يشوف ويحفظ كرته بعد التسجيل</span>
        <button disabled={busy} onClick={() => { setAllow(!allow); void save(!allow); }} className={`rounded-full px-4 py-1 text-xs font-bold ${allow ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{allow ? "شغّال" : "مطفي"}</button></label>
      <Tg on={o.terms} label="🤝 مربع «شروطنا الواضحة بالحلال»" k="terms" />
      <Tg on={o.socials} label="📱 أيقونات منصات التواصل أسفل الكرت" k="socials" />
      <div className="mt-3 rounded-xl bg-muted/40 p-2">
        <b className="text-xs">✍️ نصوص الكرت (تقدر تغيّرها)</b>
        {F({ k: "live", label: "سطر إعلان مميز (مثل البث المباشر)", ph: "نفتح بث مباشر يومياً" })}
        {F({ k: "tagline", label: "الشريط العلوي يسار" })}
        {F({ k: "badge", label: "الدرع العلوي يمين" })}
        {F({ k: "footer", label: "عبارة أسفل الكرت" })}
        {F({ k: "handle", label: "اليوزر الموحد لكل المنصات" })}
        {F({ k: "whatsapp", label: "رقم الواتساب" })}
        {F({ k: "termsText", label: "نص الشروط (كل سطر في سطر)", area: true })}
        <label className="mt-2 block text-xs text-muted-foreground">رسالة إضافية تنطبع (اختياري، مثل رقم الترخيص)
          <input value={note} maxLength={160} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-lg border bg-background p-2 text-sm text-foreground" /></label>
        <div className="mt-2 flex gap-2">
          <button disabled={busy} onClick={() => void save()} className="flex-1 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground">💾 حفظ النصوص</button>
          <button onClick={() => setO({ ...CARD_DEFAULTS, terms: o.terms, socials: o.socials })} className="rounded-xl border px-3 py-2 text-xs">↩️ الافتراضي</button>
        </div>
      </div>
      <details className="mt-3"><summary className="cursor-pointer text-sm font-bold text-primary">👁️ معاينة الكرت</summary>
        <div className="mt-2"><MarriageCardView code="ND-000" gender="male" data={SAMPLE} note={note} opts={o} /></div></details>
      <p className="mt-2 text-[11px] text-muted-foreground">لتوليد كرت أي طلب: افتح الطلب واضغط «🪪 كرت للنشر» — فوق الكرت زرّين: 📢 نسخة النشر (للنشر بالمنصات، البيانات الخاصة محجوبة) و🔐 النسخة الخاصة (لك وللعميل، فيها كل شيء).</p>
    </details>
  );
}
