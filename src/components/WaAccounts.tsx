import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { waList, waCreate, waQr, waDelete, waAutoList, waAutoSet, waHardReset } from "@/lib/studio.functions";
import QRCode from "qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WaControls, TeachButton } from "@/components/WaControls";

export type Wa = { name: string; label: string; status: string; number: string };

/** نفس مكوّن «حسابات واتساب» من استوديو الأصوات — logic واحد بالضبط. */
export function WhatsApp({ was, reload }: { was: Wa[]; reload: () => Promise<void> }) {
  const create = useServerFn(waCreate);
  const qrFn = useServerFn(waQr);
  const delFn = useServerFn(waDelete);
  const resetFn = useServerFn(waHardReset);
  const autoList = useServerFn(waAutoList);
  const autoSet = useServerFn(waAutoSet);
  const [label, setLabel] = useState("");
  const [qr, setQr] = useState<{ name: string; img: string; demo?: boolean } | null>(null);
  const [left, setLeft] = useState(20);
  const demoQr = (name: string) => QRCode.toDataURL(`DEMO-WA:${name}:${Date.now()}`, { width: 512, margin: 1 });
  const [auto, setAutoState] = useState<{ cfg: { instance: string; enabled: boolean; voice: boolean; source: string }[]; inbox: any[] }>({ cfg: [], inbox: [] });
  const loadAuto = async () => { try { setAutoState(await autoList()); } catch { /* الخدمة غير مربوطة */ } };
  useEffect(() => { void loadAuto(); }, []);
  const setAuto = async (name: string, enabled: boolean, voice: boolean, source = auto.cfg.find((x) => x.instance === name)?.source ?? "smart"): Promise<void> => {
    try { await autoSet({ data: { name, enabled, voice, source: source as "smart", origin: window.location.origin } }); toast.success(enabled ? "✅ الموظفة صارت ترد على هالرقم" : "تم الإيقاف"); await loadAuto(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const add = async (): Promise<void> => {
    if (!label.trim()) { toast.error("اكتب اسم للحساب"); return; }
    const clean = label.trim().replace(/\s+/g, "_");
    setQr({ name: clean, img: "" }); setLeft(20);
    try { const r = await create({ data: { label: clean } }); setQr({ name: r.name, img: r.qr }); setLabel(""); await reload(); }
    catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("غير مربوطة")) { setQr({ name: clean, img: await demoQr(clean), demo: true }); setLabel(""); }
      else { setQr(null); toast.error(msg); }
    }
  };
  const showQr = async (name: string) => {
    setLeft(20);
    if (qr?.demo) { setQr({ name, img: await demoQr(name), demo: true }); return; }
    try { const r = await qrFn({ data: { name } }); if (!r.qr) { toast("ما طلع كود — اضغط «🔌 فك الربط ومسح QR جديد»"); setQr(null); await reload(); } else setQr({ name, img: r.qr }); }
    catch (e) { toast.error((e as Error).message); }
  };
  const hardReset = async (name: string) => {
    if (!confirm("بنفك الربط القديم ونطلع لك كود جديد. متأكد؟")) return;
    setQr({ name, img: "" }); setLeft(20);
    try { const r = await resetFn({ data: { name } }); if (r.qr) setQr({ name, img: r.qr }); else await showQr(name); await reload(); }
    catch (e) { setQr(null); toast.error((e as Error).message); }
  };
  useEffect(() => {
    if (!qr?.img) return;
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [qr?.img, qr?.name]);
  useEffect(() => { if (qr && left <= 0 && !pair.code) void showQr(qr.name); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);
  // كود الاقتران (8 أرقام) بدل تصوير QR
  const [pair, setPair] = useState<{ phone: string; code: string; busy: boolean }>({ phone: "", code: "", busy: false });
  const getPairCode = async () => {
    if (!qr) return;
    const number = pair.phone.replace(/\D/g, "");
    if (number.length < 8) { toast.error("اكتب رقمك مع مفتاح الدولة، مثال 9665xxxxxxxx"); return; }
    setPair((p) => ({ ...p, busy: true, code: "" }));
    try {
      const r = await qrFn({ data: { name: qr.name, number } });
      if (r.code) setPair((p) => ({ ...p, code: r.code, busy: false }));
      else { setPair((p) => ({ ...p, busy: false })); toast.error("السيرفر ما أعطى كود — جرّب QR أو «فك الربط» ثم أعد المحاولة"); }
    } catch (e) { setPair((p) => ({ ...p, busy: false })); toast.error((e as Error).message); }
  };
  // فحص الحالة كل ثانيتين وإغلاق النافذة تلقائياً عند نجاح الربط
  const listFn = useServerFn(waList);
  useEffect(() => {
    if (!qr || qr.demo) return;
    const name = qr.name;
    const t = setInterval(async () => {
      try {
        const list = await listFn();
        const w = list.find((x) => x.name === name || x.name.endsWith(`_${name}`));
        if (w?.status === "open") {
          clearInterval(t); setQr(null); setPair({ phone: "", code: "", busy: false });
          toast.success(`✅ تم الربط${w.number ? ` بالرقم +${w.number}` : ""}`);
          await reload(); await loadAuto();
        }
      } catch { /* تجاهل */ }
    }, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qr?.name, qr?.demo]);
  const connected = was.filter((w) => w.status === "open");
  const checkStatus = async () => {
    await reload(); await loadAuto();
    toast(connected.length ? "متصل ✅" : "لسه ما انربط — امسح الكود وانتظر ثانيتين ثم حدّث");
  };
  return (
    <section className="space-y-4">
      <div className={`rounded-xl border p-3 text-sm font-semibold ${connected.length ? "border-primary text-primary" : "text-muted-foreground"}`}>
        {connected.length ? connected.map((w) => `🟢 متصل ✓✓ ${w.label.replace(/_/g, " ")}`).join(" • ") : "⚪ واتساب غير مربوط بعد"}
      </div>
      <div className="rounded-2xl border bg-card p-5">
        <h2 className="mb-2 font-semibold">➕ أضف حساب واتساب (تقدر تضيف أكثر من حساب)</h2>
        <div className="flex gap-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مثال: واتساب الأعمال" />
          <Button onClick={add}>+ أضف</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">افتح واتساب بجوالك ← الأجهزة المرتبطة ← ربط جهاز ← صوّر الكود.</p>
      </div>
      <Dialog open={!!qr} onOpenChange={(o) => { if (!o) { setQr(null); setPair({ phone: "", code: "", busy: false }); } }}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader><DialogTitle className="text-center">صوّر الكود من واتساب</DialogTitle></DialogHeader>
          {qr?.demo && <p className="rounded-lg bg-muted p-2 text-xs text-muted-foreground">🧪 كود تجريبي للعرض فقط — ما يربط فعلياً لأن سيرفر واتساب غير مربوط بعد.</p>}
          {qr?.img ? <img src={qr.img} alt="رمز ربط واتساب" className="mx-auto w-72 rounded-xl bg-background p-2" /> : <p className="py-16">جاري تجهيز الكود…</p>}
          <p className="text-sm">افتح واتساب بجوالك ← الأجهزة المرتبطة ← ربط جهاز ← صوّر الكود</p>
          {qr?.img && <p className="text-xs text-muted-foreground">يتحدث الكود بعد {Math.max(left, 0)} ثانية</p>}
          {!qr?.demo && (
            <div className="space-y-2 rounded-xl border p-3 text-sm">
              <p className="font-semibold">أو اربط برقم الجوال (كود 8 أرقام)</p>
              <div className="flex gap-2">
                <Input dir="ltr" inputMode="numeric" value={pair.phone} onChange={(e) => setPair((p) => ({ ...p, phone: e.target.value }))} placeholder="9665xxxxxxxx" />
                <Button size="sm" onClick={getPairCode} disabled={pair.busy}>{pair.busy ? "…" : "اطلب الكود"}</Button>
              </div>
              {pair.code && <p dir="ltr" className="text-2xl font-bold tracking-widest text-primary">{pair.code}</p>}
              {pair.code && <p className="text-xs text-muted-foreground">واتساب ← الأجهزة المرتبطة ← ربط جهاز ← الربط برقم الهاتف بدلاً من ذلك ← اكتب الكود</p>}
            </div>
          )}
          <p className="text-xs text-muted-foreground">⏱️ نفحص الربط كل ثانيتين وتنقفل النافذة تلقائياً أول ما ينربط</p>
          <div className="flex justify-center gap-2">
            <Button size="sm" onClick={() => qr && showQr(qr.name)}>🔄 تحديث الكود</Button>
            <Button size="sm" variant="secondary" onClick={async () => { setQr(null); await checkStatus(); }}>تم الربط ✅</Button>
          </div>
        </DialogContent>
      </Dialog>
      {was.map((w) => {
        const c = auto.cfg.find((x) => x.instance === w.name);
        return (
        <div key={w.name} className="space-y-2 rounded-xl border bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <b>{w.label}</b>{" "}
              <span className="text-xs">حالة الجلسة الحقيقية: {w.status === "open" ? <b className="text-primary">🟢 متصل ✓✓</b> : w.status === "connecting" ? "🟡 جاري الربط" : "🔴 غير متصل"}</span>
              <div dir="rtl" className="text-xs text-muted-foreground">الرقم المربوط فعلياً: <span dir="ltr">{w.number ? `+${w.number}` : "—"}</span></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => showQr(w.name)}>QR / ربط</Button>
              <Button size="sm" variant="destructive" onClick={() => hardReset(w.name)}>🔌 فك الربط ومسح QR جديد</Button>
              <Button size="sm" variant="ghost" onClick={async () => { try { await delFn({ data: { name: w.name } }); await reload(); } catch (e) { toast.error((e as Error).message); } }}>🗑️</Button>
            </div>
          </div>
          <WaControls instance={w.name} myNumber={w.number} />
          {c && (
            <button className="text-xs text-muted-foreground underline" onClick={() => setAuto(w.name, !c.enabled, c.voice)}>
              إعداد المتجر القديم: {c.enabled ? "شغّال (اضغط للإيقاف)" : "موقف"}
            </button>
          )}
        </div>
        );
      })}
      <Button variant="outline" onClick={checkStatus}>🔄 تحديث الحالة</Button>
      {auto.inbox.length > 0 && (
        <div className="rounded-2xl border bg-card p-4">
          <h3 className="mb-2 font-semibold">📥 آخر ردود الموظفة</h3>
          {auto.inbox.filter((m, i, a) => a.findIndex((x) => x.from_number === m.from_number && x.text === m.text) === i).map((m) => (
            <div key={m.msg_id} className="border-b py-2 text-sm last:border-0">
              <div dir="ltr" className="text-xs text-muted-foreground">+{m.from_number} • {m.status === "done" ? "✅ انرد" : m.status === "skipped" ? `⚠️ ${m.error || "تخطّى"}` : m.status === "failed" ? "❌ تعذر الرد" : "⏳"}</div>
              <div>👤 {m.text}</div>
              {m.reply && <div className="text-primary">👩‍💼 {m.reply}</div>}
              {!m.reply && m.status !== "done" && <TeachButton text={m.text} />}
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">التكلفة: رد من قواعدك نقطة، رد ذكي نقطتين، والفويس +3 نقاط.</p>
    </section>
  );
}
