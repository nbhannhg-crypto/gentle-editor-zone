import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COSTS, getBalance, getSetting } from "@/lib/wallet";
import { JeebTopup } from "@/components/JeebTopup";

type Tx = { id: string; amount: number; reason: string; created_at: string };
type Req = { id: string; points: number; amount_sar: number; status: string; created_at: string };

const PACKS = [100, 500, 1000, 5000];

export function Wallet({ storeId }: { storeId?: string | undefined }) {
  const [balance, setBalance] = useState(0);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [instructions, setInstructions] = useState("");
  const [price, setPrice] = useState(0.1);
  const [points, setPoints] = useState(500);
  const [ref, setRef] = useState("");

  const reload = async (): Promise<void> => {
    if (!storeId) return;
    setBalance(await getBalance(storeId));
    const [t, r] = await Promise.all([
      supabase.from("wallet_transactions").select("*").eq("store_id", storeId).order("created_at", { ascending: false }).limit(30),
      supabase.from("topup_requests").select("*").eq("store_id", storeId).order("created_at", { ascending: false }).limit(10),
    ]);
    setTxs((t.data ?? []) as Tx[]);
    setReqs((r.data ?? []) as Req[]);
  };
  useEffect(() => {
    reload();
    getSetting("payment_instructions").then(setInstructions);
    getSetting("point_price_sar").then((v) => setPrice(Number(v) || 0.1));
  }, [storeId]);

  const request = async (): Promise<void> => {
    if (!storeId) return;
    if (!ref.trim()) { toast.error("اكتب رقم عملية التحويل"); return; }
    const { error } = await supabase.from("topup_requests").insert({
      store_id: storeId, points, amount_sar: +(points * price).toFixed(2), reference: ref.trim().slice(0, 200),
    });
    if (error) { toast.error("تعذر إرسال الطلب"); return; }
    toast.success("وصل طلبك ✅ يُضاف الرصيد بعد تأكيد التحويل");
    setRef("");
    reload();
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-royal p-6 text-primary-foreground shadow-soft">
        <p className="text-sm opacity-80">💰 محفظة الذهب</p>
        <p className="font-display mt-1 text-5xl">{balance.toLocaleString("ar-SA")} <span className="text-xl">نقطة</span></p>
        <p className="mt-3 text-xs opacity-80">
          الأسعار: رسالة لعقل الملكة {COSTS.brain} • رد ذكي {COSTS.reply} • رد صوتي {COSTS.voice} • تقرير {COSTS.report} نقاط
        </p>
      </section>

      <JeebTopup storeId={storeId} onDone={reload} />


      <section className="rounded-2xl border bg-card p-5 shadow-soft">
        <h2 className="font-display mb-3 text-lg text-primary">📜 سجل الحركات</h2>
        {txs.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد حركات بعد.</p> : (
          <div className="space-y-1 text-sm">
            {txs.map((t) => (
              <div key={t.id} className="flex justify-between border-b py-1.5">
                <span>{t.reason}</span>
                <span className={t.amount > 0 ? "text-primary font-semibold" : "text-muted-foreground"}>{t.amount > 0 ? "+" : ""}{t.amount}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
