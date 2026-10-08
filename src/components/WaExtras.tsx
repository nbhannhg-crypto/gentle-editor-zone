import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { waExtraList, waExtraSet, waAiTest, type WaExtra } from "@/lib/studio.functions";

const countNums = (s: string) => s.split(/[,\n،;]+/).map((x) => x.replace(/\D/g, "")).filter((n) => n.length >= 5).length;

/** Extra optional settings under "ترد من" — added without touching existing buttons. */
export function WaExtras({ name, myNumber }: { name: string; myNumber: string }) {
  const list = useServerFn(waExtraList);
  const save = useServerFn(waExtraSet);
  const test = useServerFn(waAiTest);
  const [x, setX] = useState<WaExtra | null>(null);
  const [state, setState] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [chatOpen, setChatOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [chat, setChat] = useState<{ me: boolean; t: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { list().then((r) => setX(r.find((e) => e.instance === name) ?? { instance: name, allowed_numbers: "", system_prompt: "", ai_model: "", supported: false })).catch(() => {}); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const update = (patch: Partial<WaExtra>) => {
    if (!x) return;
    const next = { ...x, ...patch };
    setX(next); setState("⏳ جاري الحفظ…");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await save({ data: { name, allowed_numbers: next.allowed_numbers, system_prompt: next.system_prompt, ...(next.ai_model ? { ai_model: next.ai_model as "gpt-4o" } : {}) } });
        setState("✅ انحفظ تلقائياً");
      } catch (e) { setState(""); toast.error((e as Error).message); }
    }, 800);
  };

  const send = async () => {
    if (!msg.trim() || !x) return;
    const t = msg.trim(); setMsg(""); setChat((c) => [...c, { me: true, t }]); setBusy(true);
    try { const r = await test({ data: { message: t, system_prompt: x.system_prompt, ai_model: x.ai_model } }); setChat((c) => [...c, { me: false, t: r.reply }]); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  if (!x) return null;
  const n = countNums(x.allowed_numbers);
  return (
    <div className="w-full space-y-3 rounded-lg border bg-background p-3">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-semibold">📱 الأرقام المسموحة فقط</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{n ? `يرد على ${n} أرقام فقط` : "يرد حالياً على: الكل"}</span>
        </div>
        <Textarea dir="ltr" rows={3} value={x.allowed_numbers} onChange={(e) => update({ allowed_numbers: e.target.value })}
          placeholder={"مثال: 967777777777, 966500000000\nكل رقم في سطر أو بفاصلة"} />
        <p className="mt-1 text-xs text-muted-foreground">اتركه فاضي للرد على الجميع - لو كتبت أرقام بيرد عليهم فقط</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!myNumber} onClick={() => {
            if (x.allowed_numbers.replace(/\D/g, "").includes(myNumber)) return toast("رقمك موجود أصلاً");
            update({ allowed_numbers: x.allowed_numbers.trim() ? `${x.allowed_numbers.trim()}\n${myNumber}` : myNumber });
          }}>➕ إضافة رقمي الحالي تلقائياً</Button>
          <Button size="sm" variant="ghost" onClick={() => update({ allowed_numbers: "" })}>🗑️ مسح الكل والرد على الجميع</Button>
        </div>
      </div>
      <div>
        <span className="text-sm font-semibold">شخصية الموظفة (System Prompt)</span>
        <Textarea rows={4} value={x.system_prompt} onChange={(e) => update({ system_prompt: e.target.value })} placeholder="اتركه فاضي ويستخدم الأسلوب القديم" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">قوة الذكاء:</span>
        <select className="rounded-md border bg-background px-2 py-1 text-sm" value={x.ai_model} onChange={(e) => update({ ai_model: e.target.value })}>
          <option value="gpt-4o-mini">gpt-4o-mini (سريع)</option>
          <option value="gpt-4o">gpt-4o (أذكى)</option>
          <option value="claude-3.5-sonnet">claude-3.5-sonnet (الأقوى)</option>
        </select>
        <Button size="sm" variant="secondary" onClick={() => setChatOpen(true)}>اختبار الذكاء 🧪</Button>
        {state && <span className="text-xs text-muted-foreground">{state}</span>}
      </div>
      <Dialog open={chatOpen} onOpenChange={setChatOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>🧪 محادثة تجريبية</DialogTitle></DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {chat.length === 0 && <p className="text-sm text-muted-foreground">اكتب كأنك زبون وشوف كيف ترد الموظفة (ما يُرسل لأي أحد).</p>}
            {chat.map((m, i) => <div key={i} className={`rounded-xl p-2 text-sm ${m.me ? "bg-muted" : "bg-primary text-primary-foreground"}`}>{m.me ? "👤 " : "👩‍💼 "}{m.t}</div>)}
            {busy && <p className="text-xs text-muted-foreground">تكتب…</p>}
          </div>
          <div className="flex gap-2">
            <Input value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="مثال: بكم العطر؟" />
            <Button onClick={send} disabled={busy}>إرسال</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
