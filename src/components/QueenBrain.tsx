import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { queenBrain } from "@/lib/ai.functions";
import { addRule } from "@/lib/rules";
import { spend, COSTS } from "@/lib/wallet";
import { Button } from "@/components/ui/button";

type Msg = { role: "user" | "assistant"; content: string };
type Action =
  | { type: "add_rule"; trigger: string; response: string }
  | { type: "add_product"; name: string; price: number; description: string }
  | { type: "add_channel"; platform: string; label: string }
  | { type: "go_tab"; tab: string };

const WELCOME = "هلا والله 👑 أنا **عقل الملكة**. قل لي وش تبي وأنا أنفذ — مثل: «أضيفي منتج عطر بسعر 199» أو «علمي الموظفة إذا سألوا عن التوصيل تقول خلال يومين» أو «اربطي حساب انستقرام متجري». وإذا جديد، قل «علميني» وأمشي معك خطوة خطوة.";

export function QueenBrain({ storeId, onTab }: { storeId?: string | undefined; onTab: (t: string) => void }) {
  const ask = useServerFn(queenBrain);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: WELCOME }]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, open]);

  const run = async (a: Action): Promise<string> => {
    if (!storeId) return "";
    if (a.type === "add_rule") { await addRule(a.trigger, a.response, storeId); return `✅ تعلمت: «${a.trigger}»`; }
    if (a.type === "add_product") {
      await supabase.from("products").insert({ store_id: storeId, name: a.name, price: a.price || 0, description: a.description || "" });
      return `✅ أضفت المنتج ${a.name}`;
    }
    if (a.type === "add_channel") {
      await supabase.from("channels").insert({ store_id: storeId, platform: a.platform, label: a.label });
      return `✅ أضفت حساب ${a.label}`;
    }
    if (a.type === "go_tab") { onTab(a.tab); return ""; }
    return "";
  };

  const send = async (input?: string): Promise<void> => {
    const q = (input ?? text).trim();
    if (!q || !storeId || busy) return;
    const left = await spend(storeId, COSTS.brain, "عقل الملكة");
    if (left === null) { toast.error("رصيدك خلص — اشحن من محفظة الذهب 💰"); onTab("wallet"); return; }
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next); setText(""); setBusy(true);
    try {
      const res = await ask({ data: { history: next.slice(-16) } });
      const done: string[] = [];
      for (const a of res.actions as Action[]) { const r = await run(a); if (r) done.push(r); }
      if (done.length) window.dispatchEvent(new Event("data-changed"));
      setMsgs([...next, { role: "assistant", content: [res.reply, ...done].filter(Boolean).join("\n") }]);
    } catch (e) {
      setMsgs([...next, { role: "assistant", content: e instanceof Error ? e.message : "صار خطأ، جرب مرة ثانية" }]);
    }
    setBusy(false);
  };

  const listen = (): void => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error("متصفحك ما يدعم الصوت — جرب كروم"); return; }
    const r = new SR(); r.lang = "ar-SA"; r.interimResults = false;
    r.onresult = (e: any) => send(e.results[0][0].transcript);
    r.onend = () => setListening(false);
    setListening(true); r.start();
  };

  return (
    <>
      <button onClick={() => setOpen(!open)}
        className="fixed bottom-4 left-4 z-50 flex h-12 w-12 text-2xl sm:bottom-5 sm:left-5 sm:h-16 sm:w-16 sm:text-3xl items-center justify-center rounded-full bg-gold shadow-soft transition hover:scale-105"
        aria-label="عقل الملكة">👑</button>
      {open && (
        <>
        <div className="fixed inset-0 z-[60] bg-foreground/40 sm:hidden" onClick={() => setOpen(false)} />
        <div className="fixed inset-x-0 bottom-0 z-[61] flex h-[85dvh] flex-col overflow-hidden rounded-t-2xl border bg-card shadow-soft sm:inset-x-auto sm:bottom-24 sm:left-4 sm:h-[70vh] sm:w-[400px] sm:rounded-2xl">
          <div className="flex shrink-0 items-center gap-2 bg-royal px-4 py-3 text-primary-foreground">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg">👑 عقل الملكة</p>
              <p className="truncate text-xs opacity-80">تفهمك بالصوت والكتابة وتنفذ فوراً</p>
            </div>
            <button onClick={() => setOpen(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-foreground/20 text-lg" aria-label="إغلاق">✕</button>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 text-sm">
            {msgs.map((m, i) => (
              <div key={i} className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 ${m.role === "user" ? "mr-auto bg-primary text-primary-foreground" : "bg-secondary"}`}>{m.content.replace(/\*\*/g, "")}</div>
            ))}
            {busy && <div className="w-fit rounded-2xl bg-secondary px-3 py-2">تفكر… 🤔</div>}
            <div ref={endRef} />
          </div>
          <div className="flex shrink-0 items-center gap-2 border-t p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <button onClick={listen} className={`h-10 w-10 shrink-0 rounded-full ${listening ? "bg-destructive text-destructive-foreground" : "bg-secondary"}`} aria-label="تكلم">🎤</button>
            <input className="h-10 min-w-0 flex-1 rounded-full border bg-background px-3 text-sm outline-none" placeholder="اكتب أمرك…"
              value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
            <Button className="h-10 shrink-0 rounded-full px-4" disabled={busy} onClick={() => send()}>أرسل</Button>
          </div>
        </div>
        </>
      )}
    </>
  );
}
