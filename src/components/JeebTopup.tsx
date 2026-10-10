import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendWhatsappApproval } from "@/lib/payments.functions";

export const JEEB_WALLET = "113581";
const CURRENCIES = [
  { id: "USD", label: "$ دولار", rate: 1000 },
  { id: "SAR", label: "﷼ سعودي", rate: 240 },
  { id: "YER", label: "﷼ يمني", rate: 1.714 },
] as const;
type Cur = (typeof CURRENCIES)[number]["id"];

export function JeebTopup({ storeId, onDone }: { storeId?: string | undefined; onDone?: () => void }) {
  const [cur, setCur] = useState<Cur>("SAR");
  const [amount, setAmount] = useState("");
  const [txn, setTxn] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [doneMsg, setDoneMsg] = useState("");
  const rate = CURRENCIES.find((c) => c.id === cur)!.rate;
  const amt = Number(amount);
  const points = amt > 0 ? Math.floor(amt * rate) : 0;

  const copy = async () => { await navigator.clipboard.writeText(JEEB_WALLET); toast.success("انسخ رقم المحفظة ✅"); };

  const submit = async () => {
    if (!storeId) return;
    if (!(amt > 0) || points < 1) { toast.error("اكتب مبلغ صحيح"); return; }
    if (txn.trim().length < 3) { toast.error("رقم العملية إجباري"); return; }
    setBusy(true);
    try {
      let receipt = "";
      if (file) {
        if (file.size > 8 * 1024 * 1024) throw new Error("الصورة أكبر من 8 ميجا");
        const { data: { user } } = await supabase.auth.getUser();
        const path = `${user!.id}/${Date.now()}-${file.name.replace(/[^\w.]/g, "_")}`;
        const up = await supabase.storage.from("receipts").upload(path, file);
        if (up.error) throw new Error("تعذر رفع الإيصال");
        receipt = path;
      }
      const { data, error } = await supabase.rpc("create_payment", { _store: storeId, _amount: amt, _currency: cur, _txn: txn.trim(), _receipt: receipt });
      if (error) throw new Error(error.message.includes("duplicate") ? "رقم العملية مستخدم من قبل ⛔" : "تعذر حفظ الطلب");
      const row = (data as { id: string; points: number; token: string }[])[0]!;
      const t = txn.trim();
      sendWhatsappApproval({ data: { paymentId: row.id, origin: window.location.origin } })
        .then((r) => { if (!r.sent) { console.error("إشعار واتساب لم يُرسل:", r.error); toast.warning("طلبك محفوظ ✅ لكن إشعار الواتساب ما وصل — بيظهر للإدارة في اللوحة"); } })
        .catch((e) => { console.error("إشعار واتساب فشل:", e); toast.warning("طلبك محفوظ ✅ لكن إشعار الواتساب ما وصل"); });
      setDoneMsg(`✅ تم استلام طلبك - رقم العملية ${t} - سيتم شحن ${row.points.toLocaleString("ar-SA")} نقطة خلال دقائق 🎉`);
      toast.success("✅ تم استلام طلبك");
      setTxn(""); setAmount(""); setFile(null);
      onDone?.();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-soft">
      <h2 className="font-display text-xl text-primary">💎 اشحن رصيدك بأي عملة</h2>

      <div className="rounded-2xl bg-gold p-4 text-accent-foreground shadow-soft">
        <div className="flex items-center justify-between gap-2">
          <p className="text-lg font-bold">محفظة جيب: {JEEB_WALLET}</p>
          <Button size="sm" variant="secondary" onClick={copy}>📋 نسخ</Button>
        </div>
        <p className="mt-1 text-sm">الاسم: نـ.... مـ... مـ... قـ..... قـ.....</p>
        <ol className="mt-3 list-decimal space-y-1 pr-5 text-sm">
          <li>افتح تطبيق جيب وحوّل للمحفظة {JEEB_WALLET}.</li>
          <li>تأكد إن الاسم يطلع بنفس الشكل فوق قبل التأكيد.</li>
          <li>انسخ رقم العملية من إشعار التحويل واكتبه تحت.</li>
          <li>اضغط "تأكيد الدفع" وأرسل رسالة الواتساب اللي تطلع لك.</li>
          <li>ينضاف رصيدك أول ما نوافق، ويوصلك إشعار فوري 🎉</li>
        </ol>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {CURRENCIES.map((c) => (
          <button key={c.id} onClick={() => setCur(c.id)}
            className={`rounded-xl border p-3 font-semibold transition ${cur === c.id ? "border-primary bg-primary text-primary-foreground" : ""}`}>{c.label}</button>
        ))}
      </div>
      <Input type="number" inputMode="decimal" min="0" placeholder="كم تبي تدفع؟" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <p className="text-center text-lg font-bold text-primary">ستحصل على {points.toLocaleString("ar-SA")} نقطة 💎</p>
      <Input placeholder="اكتب رقم عملية التحويل من جيب" value={txn} maxLength={100} onChange={(e) => setTxn(e.target.value)} />
      <label className="block cursor-pointer rounded-xl border border-dashed p-3 text-center text-sm text-muted-foreground">
        {file ? `📎 ${file.name}` : "📷 ارفع صورة الإيصال (اختياري)"}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <Button className="w-full" size="lg" disabled={busy} onClick={submit}>{busy ? "جاري..." : "✅ تأكيد الدفع"}</Button>
      {doneMsg && <p className="rounded-xl bg-secondary p-3 text-center font-semibold text-primary">{doneMsg}</p>}
    </section>
  );
}
