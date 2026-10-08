import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type M = { msg_id: string; from_number: string; text: string; reply: string; status: string; created_at: string };

/** WhatsApp conversations inside the site, grouped by number, plus manual send to any number. */
export function WaInbox({ storeId }: { storeId?: string | undefined }) {
  const [rows, setRows] = useState<M[]>([]);
  const [sel, setSel] = useState<string>("");
  const [num, setNum] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!storeId) return;
    void supabase.from("wa_inbox").select("msg_id, from_number, text, reply, status, created_at").eq("store_id", storeId).order("created_at", { ascending: false }).limit(500)
      .then(({ data }) => setRows((data ?? []) as M[]));
  }, [storeId]);
  const numbers = [...new Set(rows.map((r) => r.from_number))];
  const chat = rows.filter((r) => r.from_number === sel).reverse();
  const open = () => { const n = (num || sel).replace(/\D/g, ""); if (n) window.open(`https://wa.me/${n}?text=${encodeURIComponent(msg)}`, "_blank"); };
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <h2 className="text-lg font-bold">💬 محادثات الواتساب</h2>
      <div className="flex flex-wrap gap-2">
        {numbers.map((n) => <button key={n} onClick={() => setSel(n)} className={`rounded-full px-3 py-1 text-sm ${sel === n ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{n}</button>)}
        {!numbers.length && <p className="text-sm text-muted-foreground">ما وصلت رسائل للحين. اربطي رقمك من «القنوات».</p>}
      </div>
      {sel && (
        <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl bg-muted p-3">
          {chat.map((m) => (
            <div key={m.msg_id} className="space-y-1">
              <p className="w-fit max-w-[85%] rounded-xl bg-background p-2 text-sm">{m.text}</p>
              {m.reply && <p className="mr-auto w-fit max-w-[85%] rounded-xl bg-primary p-2 text-sm text-primary-foreground">{m.reply}</p>}
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
        <Input placeholder={sel || "رقم جديد 9665…"} value={num} onChange={(e) => setNum(e.target.value)} />
        <Input placeholder="رسالتك" value={msg} onChange={(e) => setMsg(e.target.value)} />
        <Button onClick={open}>إرسال</Button>
      </div>
    </div>
  );
}
