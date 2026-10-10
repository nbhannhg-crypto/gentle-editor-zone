import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { waList, waCreate, waQr, waDelete, waAutoList, waAutoSet } from "@/lib/studio.functions";
import QRCode from "qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WaExtras } from "@/components/WaExtras";

export type Wa = { name: string; label: string; status: string; number: string };

/** نفس مكوّن «حسابات واتساب» من استوديو الأصوات — logic واحد بالضبط. */
export function WhatsApp({ was, reload }: { was: Wa[]; reload: () => Promise<void> }) {
  const create = useServerFn(waCreate);
  const qrFn = useServerFn(waQr);
  const delFn = useServerFn(waDelete);
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
    try { const r = await qrFn({ data: { name } }); if (!r.qr) { toast.success("الحساب مربوط ✅"); setQr(null); await reload(); } else setQr({ name, img: r.qr }); }
    catch (e) { toast.error((e as Error).message); }
  };
  useEffect(() => {
    if (!qr?.img) return;
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [qr?.img, qr?.name]);
  useEffect(() => { if (qr && left <= 0) void showQr(qr.name); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);
  const connected = was.filter((w) => w.status === "open");
  const checkStatus = async () => {
    await reload(); await loadAuto();
    toast(connected.length ? "متصل ✅" : "لسه ما انربط — امسح الكود وانتظر ثانيتين ثم حدّث");
  };
  return (
    <section className="space-y-4">
      <div className={`rounded-xl border p-3 text-sm font-semibold ${connected.length ? "border-primary text-primary" : "text-muted-foreground"}`}>
        {connected.length ? connected.map((w) => `متصل ✅ ${w.label.replace(/_/g, " ")}`).join(" • ") : "⚪ واتساب غير مربوط بعد"}
      </div>
      <div className="rounded-2xl border bg-card p-5">
        <h2 className="mb-2 font-semibold">➕ أضف حساب واتساب (تقدر تضيف أكثر من حساب)</h2>
        <div className="flex gap-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مثال: واتساب الأعمال" />
          <Button onClick={add}>+ أضف</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">افتح واتساب بجوالك ← الأجهزة المرتبطة ← ربط جهاز ← صوّر الكود.</p>
      </div>
      <Dialog open={!!qr} onOpenChange={(o) => { if (!o) setQr(null); }}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader><DialogTitle className="text-center">صوّر الكود من واتساب</DialogTitle></DialogHeader>
          {qr?.demo && <p className="rounded-lg bg-muted p-2 text-xs text-muted-foreground">🧪 كود تجريبي للعرض فقط — ما يربط فعلياً لأن سيرفر واتساب غير مربوط بعد.</p>}
          {qr?.img ? <img src={qr.img} alt="رمز ربط واتساب" className="mx-auto w-72 rounded-xl bg-background p-2" /> : <p className="py-16">جاري تجهيز الكود…</p>}
          <p className="text-sm">افتح واتساب بجوالك ← الأجهزة المرتبطة ← ربط جهاز ← صوّر الكود</p>
          {qr?.img && <p className="text-xs text-muted-foreground">يتحدث الكود بعد {Math.max(left, 0)} ثانية</p>}
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
          <div className="flex items-center justify-between">
            <div>
              <b>{w.label}</b> <span className="text-xs">{w.status === "open" ? "🟢 مربوط" : "⚪ غير مربوط"}</span>
              {w.number && <div dir="ltr" className="text-xs text-muted-foreground">+{w.number}</div>}
            </div>
            <div className="flex gap-2">
              {w.status !== "open" && <Button size="sm" onClick={() => showQr(w.name)}>QR / ربط</Button>}
              <Button size="sm" variant="ghost" onClick={async () => { try { await delFn({ data: { name: w.name } }); await reload(); } catch (e) { toast.error((e as Error).message); } }}>🗑️</Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 rounded-lg bg-muted/50 p-2 text-sm">
            <Button size="sm" variant={c?.enabled ? "default" : "outline"} onClick={() => setAuto(w.name, !c?.enabled, c?.voice ?? false)}>
              🤖 الموظفة ترد تلقائياً: {c?.enabled ? "شغّالة" : "مطفية"}
            </Button>
            <Button size="sm" variant={c?.voice ? "default" : "outline"} disabled={!c?.enabled} onClick={() => setAuto(w.name, true, !c?.voice)}>
              {c?.voice ? "🔊 ترد بفويس سعودي" : "💬 ترد بالكتابة"}
            </Button>
            {c?.enabled && (
              <div className="flex w-full flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">ترد من:</span>
                {([["smart", "🧠 ردودي + الذكاء"], ["rules", "📘 ردودي المكتوبة بس"], ["library", "📚 محفظة أصواتي"], ["ai", "✨ الذكاء بالكامل"]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setAuto(w.name, true, c.voice, k)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${(c.source ?? "smart") === k ? "bg-primary text-primary-foreground" : "bg-background"}`}>{l}</button>
                ))}
              </div>
            )}
            {c?.enabled && <WaExtras name={w.name} myNumber={w.number} />}
          </div>
        </div>
        );
      })}
      <Button variant="outline" onClick={checkStatus}>🔄 تحديث الحالة</Button>
      {auto.inbox.length > 0 && (
        <div className="rounded-2xl border bg-card p-4">
          <h3 className="mb-2 font-semibold">📥 آخر ردود الموظفة</h3>
          {auto.inbox.map((m) => (
            <div key={m.msg_id} className="border-b py-2 text-sm last:border-0">
              <div dir="ltr" className="text-xs text-muted-foreground">+{m.from_number} • {m.status === "done" ? "✅ انرد" : m.status === "skipped" ? `⚠️ ${m.error || "تخطّى"}` : m.status === "failed" ? "❌ تعذر الرد" : "⏳"}</div>
              <div>👤 {m.text}</div>
              {m.reply && <div className="text-primary">👩‍💼 {m.reply}</div>}
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">التكلفة: رد من قواعدك نقطة، رد ذكي نقطتين، والفويس +3 نقاط.</p>
    </section>
  );
}
