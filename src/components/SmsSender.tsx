import { useState } from "react";
import { toast } from "sonner";
import { smsSend } from "@/lib/phone.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function SmsSender() {
  const [to, setTo] = useState("+966");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState("");
  const arabic = /[^\x00-\x7F]/.test(text);
  const per = arabic ? 70 : 160;
  const parts = Math.max(1, Math.ceil(text.length / per));
  async function send() {
    setBusy(true);
    try {
      const r = await smsSend({ data: { to: to.replace(/\s/g, ""), text } });
      setLast(`انرسلت من ${r.from} — ${r.parts} مقطع${r.cost ? ` — التكلفة ${r.cost}$` : ""}`);
      toast.success("انرسلت الرسالة");
      setText("");
    } catch (e: any) { toast.error(e?.message ?? "تعذر الإرسال"); setLast(e?.message ?? ""); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <h3 className="font-display text-lg">✉️ رسالة نصية SMS</h3>
      <Input dir="ltr" value={to} onChange={e => setTo(e.target.value)} placeholder="+9665xxxxxxxx" aria-label="رقم المستلم" />
      <Textarea value={text} onChange={e => setText(e.target.value)} maxLength={670} rows={3} placeholder="نص الرسالة" aria-label="نص الرسالة" />
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{text.length} حرف — {parts} مقطع (كل مقطع يُحسب رسالة)</span>
        <Button size="sm" disabled={busy || !text.trim() || to.length < 9} onClick={send}>{busy ? "يرسل..." : "إرسال"}</Button>
      </div>
      {last && <p className="text-xs">{last}</p>}
    </div>
  );
}
