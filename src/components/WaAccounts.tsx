import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { waList, waCreate, waQr, waDelete, waAutoList, waAutoSet } from "@/lib/studio.functions";

export type Wa = { name: string; label: string; status: string; number: string };

/** نفس مكوّن «حسابات واتساب» من استوديو الأصوات — logic واحد بالضبط. */
export function WhatsApp({ was, reload }: { was: Wa[]; reload: () => Promise<void> }) {
  const create = useServerFn(waCreate);
  const qrFn = useServerFn(waQr);
  const delFn = useServerFn(waDelete);
  const autoList = useServerFn(waAutoList);
  const autoSet = useServerFn(waAutoSet);
  const [label, setLabel] = useState("");
  const [qr, setQr] = useState<{ name: string; img: string } | null>(null);
  const [auto, setAutoState] = useState<{ cfg: { instance: string; enabled: boolean; voice: boolean; source: string }[]; inbox: any[] }>({ cfg: [], inbox: [] });
  const loadAuto = async () => { try { setAutoState(await autoList()); } catch (e) { toast.error((e as Error).message); } };
  useEffect(() => { void loadAuto(); }, []);
  const setAuto = async (name: string, enabled: boolean, voice: boolean, source = auto.cfg.find((x) => x.instance === name)?.source ?? "smart"): Promise<void> => {
    try { await autoSet({ data: { name, enabled, voice, source: source as "smart", origin: window.location.origin } }); toast.success(enabled ? "✅ الموظفة صارت ترد على هالرقم" : "تم الإيقاف"); await loadAuto(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const add = async (): Promise<void> => {
    if (!label.trim()) { toast.error("اكتب اسم للحساب"); return; }
    try { const r = await create({ data: { label: label.trim().replace(/\s+/g, "_") } }); setQr({ name: r.name, img: r.qr }); setLabel(""); await reload(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const showQr = async (name: string) => {
    try { const r = await qrFn({ data: { name } }); if (!r.qr) toast.success("الحساب مربوط ✅"); else setQr({ name, img: r.qr }); }
    catch (e) { toast.error((e as Error).message); }
  };
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border bg-card p-5">
        <h2 className="mb-2 font-semibold">➕ أضف حساب واتساب (تقدر تضيف أكثر من حساب)</h2>
        <div className="flex gap-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مثال: واتساب الأعمال" />
          <Button onClick={add}>+ أضف</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">افتح واتساب بجوالك ← الأجهزة المرتبطة ← ربط جهاز ← صوّر الكود.</p>
      </div>
      {qr && (
        <div className="rounded-2xl border-2 border-primary bg-card p-5 text-center">
          <p className="mb-2 font-semibold">صوّر الكود من واتساب</p>
          {qr.img ? <img src={qr.img} alt="رمز ربط واتساب" className="mx-auto w-64 rounded-xl bg-white p-2" /> : <p>جاري تجهيز الكود…</p>}
          <div className="mt-3 flex justify-center gap-2">
            <Button size="sm" onClick={() => showQr(qr.name)}>🔄 تحديث الكود</Button>
            <Button size="sm" variant="secondary" onClick={async () => { setQr(null); await reload(); }}>تم الربط ✅</Button>
          </div>
        </div>
      )}
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
          </div>
        </div>
        );
      })}
      <Button variant="outline" onClick={async () => { await reload(); await loadAuto(); }}>🔄 تحديث الحالة</Button>
      {auto.inbox.length > 0 && (
        <div className="rounded-2xl border bg-card p-4">
          <h3 className="mb-2 font-semibold">📥 آخر ردود الموظفة</h3>
          {auto.inbox.map((m) => (
            <div key={m.msg_id} className="border-b py-2 text-sm last:border-0">
              <div dir="ltr" className="text-xs text-muted-foreground">+{m.from_number} • {m.status === "done" ? "✅ انرد" : m.status === "skipped" ? "⚠️ الرصيد ما يكفي" : m.status === "failed" ? "❌ تعذر الرد" : "⏳"}</div>
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
