import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getBalance } from "@/lib/wallet";

/** "رصيدك: X 💎" في الهيدر + إشعار فوري عند الشحن. */
export function BalanceBadge({ storeId, onClick }: { storeId?: string | undefined; onClick?: () => void }) {
  const [bal, setBal] = useState<number | null>(null);
  useEffect(() => {
    if (!storeId) return;
    getBalance(storeId).then(setBal);
    const onChange = (e: Event) => { const d = (e as CustomEvent).detail; if (typeof d === "number") setBal(d); };
    window.addEventListener("wallet-changed", onChange);
    const ch = supabase.channel(`wallet-${storeId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wallet_transactions", filter: `store_id=eq.${storeId}` }, (p) => {
        const row = p.new as { amount: number; reason: string };
        if (row.amount > 0 && row.reason.startsWith("شحن")) toast.success(`تم شحن رصيدك بـ ${row.amount.toLocaleString("ar-SA")} نقطة بنجاح 🎉`);
        getBalance(storeId).then(setBal);
      }).subscribe();
    return () => { window.removeEventListener("wallet-changed", onChange); supabase.removeChannel(ch); };
  }, [storeId]);
  if (bal === null) return null;
  return (
    <button onClick={onClick} className="rounded-full bg-primary-foreground/15 px-3 py-1.5 text-sm font-semibold">
      رصيدك: {bal.toLocaleString("ar-SA")} 💎
    </button>
  );
}
