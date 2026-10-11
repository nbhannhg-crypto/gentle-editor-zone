import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CTRL_PREFIX, defaultCtrl, digits, parseCtrl, type WaCtrl } from "@/lib/wa-controls";
import { guessCategory } from "@/lib/rules";

type Brain = { id: string; name: string };

/** Real control panel for the live WhatsApp reply — every button saves and the reply server applies it. */
export function WaControls({ instance }: { instance: string }) {
  const key = CTRL_PREFIX + instance;
  const [rowId, setRowId] = useState<string | null>(null);
  const [c, setC] = useState<WaCtrl | null>(null);
  const [state, setState] = useState("");
  const [brains, setBrains] = useState<Brain[]>([]);
  const [teach, setTeach] = useState<{ n: string; t: string } | null>(null);
  const [ans, setAns] = useState("");
  const [pauseNum, setPauseNum] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = async () => {
    const { data } = await supabase.from("training_rules").select("id, response_text").eq("trigger_text", key).limit(1).maybeSingle();
    setRowId((data as any)?.id ?? null);
    setC(parseCtrl((data as any)?.response_text));
  };
  useEffect(() => {
    void load();
    (supabase.rpc as any)("kingdom_brains").then((r: any) => setBrains(((r.data ?? []) as any[]).map((b) => ({ id: b.id, name: b.name })))).catch(() => {});
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance]);

  const persist = async (next: WaCtrl) => {
    const body = JSON.stringify(next);
    try { localStorage.setItem(key, body); } catch { /* ignore */ }
    if (rowId) {
      const { error } = await supabase.from("training_rules").update({ response_text: body }).eq("id", rowId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from("training_rules").insert({ trigger_text: key, response_text: body, category: "settings", store_id: null } as any).select("id").single();
      if (error) throw error;
      setRowId((data as any).id);
    }
  };
  const update = (patch: Partial<WaCtrl>, now = false) => {
    const next = { ...(c ?? defaultCtrl()), ...patch };
    setC(next); setState("⏳ جاري الحفظ…");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try { await persist(next); setState("✅ انحفظ وصار يشتغل على الواتساب"); }
      catch (e) { setState(""); toast.error("ما انحفظ: " + (e as Error).message); }
    }, now ? 0 : 700);
  };

  if (!c) return null;
  const saveTeach = async () => {
    if (!teach || !ans.trim()) return;
    const { error } = await supabase.from("training_rules").insert({ trigger_text: teach.t.trim(), response_text: ans.trim(), category: guessCategory(teach.t), store_id: null });
    if (error) { toast.error(error.message); return; }
    toast.success("✅ انحفظ — المرة الجاية ترد فيه تلقائياً");
    update({ misses: c.misses.filter((m) => !(m.t === teach.t && m.n === teach.n)) }, true);
    setTeach(null); setAns("");
  };
  const togglePause = (n: string) => {
    const d = digits(n) || n;
    if (!d) return;
    update({ paused: c.paused.includes(d) ? c.paused.filter((x) => x !== d) : [...c.paused, d] }, true);
  };
  const pill = (on: boolean) => `rounded-full border px-2.5 py-1 text-xs ${on ? "bg-primary text-primary-foreground" : "bg-background"}`;

  return (
    <div className="w-full space-y-3 rounded-lg border-2 border-primary/40 bg-background p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">🎛️ أزرار التحكم الحقيقية (الرد الشغال الآن)</span>
        {state && <span className="text-xs text-muted-foreground">{state}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button className={pill(c.enabled)} onClick={() => update({ enabled: !c.enabled }, true)}>{c.enabled ? "🟢 الرد الآلي شغّال" : "🔴 الرد الآلي موقف"}</button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">ترد من:</span>
        {([["rules", "📘 ردودي بس"], ["smart", "🧠 ردودي + الذكاء"], ["ai", "✨ الذكاء بالكامل"]] as const).map(([k, l]) => (
          <button key={k} className={pill(c.source === k)} onClick={() => update({ source: k }, true)}>{l}</button>
        ))}
      </div>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">📚 العقول والمكتبات اللي تستعين فيها (بعد ردودك):</span>
        <div className="flex flex-wrap gap-1.5">
          <span className={pill(true)}>📘 مكتبتي (دايماً)</span>
          {brains.length === 0 && <span className="text-xs text-muted-foreground">ما فيه عقول متاحة حالياً</span>}
          {brains.map((b) => (
            <button key={b.id} className={pill(c.brains.includes(b.id))}
              onClick={() => update({ brains: c.brains.includes(b.id) ? c.brains.filter((x) => x !== b.id) : [...c.brains, b.id] }, true)}>
              🧠 {b.name}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">⏱️ التأخير:</span>
        {[0, 3, 5, 10, 20].map((s) => <button key={s} className={pill(c.delay === s)} onClick={() => update({ delay: s }, true)}>{s ? `${s} ث` : "فوري"}</button>)}
        <Input type="number" min={0} max={25} className="w-20" value={c.delay} onChange={(e) => update({ delay: Math.min(25, Math.max(0, Number(e.target.value) || 0)) })} />
      </div>
      <div>
        <span className="text-xs text-muted-foreground">📱 الأرقام المسموحة (فاضي = يرد على الكل)</span>
        <Textarea dir="ltr" rows={2} value={c.allowed} onChange={(e) => update({ allowed: e.target.value })} placeholder="967777777777, 966500000000" />
      </div>
      <div>
        <span className="text-xs text-muted-foreground">👩‍💼 شخصية الموظفة وتعليماتها (للذكاء فقط — ردودك تنرسل زي ما هي)</span>
        <Textarea rows={3} value={c.prompt} onChange={(e) => update({ prompt: e.target.value })} placeholder="مثال: ردي باختصار وبلهجة سعودية، ولا تعطي أسعار غير المكتوبة" />
      </div>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">⏸️ إيقاف مؤقت لرقم (لما تسولف معه بنفسك):</span>
        <div className="flex gap-2">
          <Input dir="ltr" value={pauseNum} onChange={(e) => setPauseNum(e.target.value)} placeholder="967712474671" />
          <Button size="sm" variant="outline" onClick={() => { togglePause(pauseNum); setPauseNum(""); }}>⏸️ أوقف</Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {c.paused.map((n) => <button key={n} className={pill(true)} onClick={() => togglePause(n)} dir="ltr">⏸️ +{n} ✕</button>)}
        </div>
      </div>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">💡 رسائل ما لقت لها رد — علّم الموظفة:</span>
        {c.misses.length === 0 && <p className="text-xs text-muted-foreground">ما فيه رسائل بدون رد 👌</p>}
        {[...c.misses].reverse().map((m, i) => (
          <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 p-2 text-sm">
            <div><span dir="ltr" className="text-xs text-muted-foreground">+{m.n}</span> قال: «{m.t}»</div>
            <div className="flex gap-1.5">
              <Button size="sm" onClick={() => { setTeach(m); setAns(""); }}>علّم الموظفة 💡</Button>
              <Button size="sm" variant="outline" onClick={() => togglePause(m.n)}>{c.paused.includes(digits(m.n) || m.n) ? "▶️ رجّع الرد" : "⏸️ أوقف عنه"}</Button>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={!!teach} onOpenChange={(o) => { if (!o) setTeach(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>💡 علّم الموظفة الرد</DialogTitle></DialogHeader>
          <p className="rounded-md bg-muted p-2 text-sm">الزبون قال: «{teach?.t}»</p>
          <Textarea rows={3} value={ans} onChange={(e) => setAns(e.target.value)} placeholder="اكتب الرد اللي تبيها ترد فيه" />
          <Button onClick={saveTeach} disabled={!ans.trim()}>حفظ واعتماد فوراً ✅</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Small "teach" button for inbox entries without a reply. */
export function TeachButton({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [ans, setAns] = useState("");
  const save = async () => {
    const { error } = await supabase.from("training_rules").insert({ trigger_text: text.trim(), response_text: ans.trim(), category: guessCategory(text), store_id: null });
    if (error) { toast.error(error.message); return; }
    toast.success("✅ انحفظ — المرة الجاية ترد فيه تلقائياً"); setOpen(false); setAns("");
  };
  return (
    <>
      <Button size="sm" variant="outline" className="mt-1" onClick={() => setOpen(true)}>علّم الموظفة الرد 💡</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>💡 علّم الموظفة الرد</DialogTitle></DialogHeader>
          <p className="rounded-md bg-muted p-2 text-sm">الزبون قال: «{text}»</p>
          <Textarea rows={3} value={ans} onChange={(e) => setAns(e.target.value)} placeholder="اكتب الرد" />
          <Button onClick={save} disabled={!ans.trim()}>حفظ واعتماد فوراً ✅</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
