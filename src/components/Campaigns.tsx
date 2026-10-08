import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PinnedReplies } from "@/components/KingdomBrains";
import { fetchCustomers, type Customer } from "@/lib/channels";
import { campaignPolish, campaignSend, waList } from "@/lib/studio.functions";

export function Campaigns({ storeId }: { storeId?: string | undefined }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [instances, setInstances] = useState<{ name: string; label: string; status: string }[]>([]);
  const [instance, setInstance] = useState("");
  const [busy, setBusy] = useState(false);
  const [polishing, setPolishing] = useState(false);

  useEffect(() => {
    fetchCustomers(storeId).then((cs) => setCustomers(cs.filter((c) => c.phone)));
    waList().then((l) => {
      const open = l.filter((i) => i.status === "open");
      setInstances(open);
      if (open[0]) setInstance(open[0].name);
    }).catch(() => {});
  }, [storeId]);

  const withPhone = customers.filter((c) => /^\+?\d{8,15}$/.test(c.phone.replace(/\s/g, "")));
  const selected = withPhone.filter((c) => picked.has(c.id));

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) { n.delete(id); } else { n.add(id); } return n; });

  const polish = async () => {
    if (!text.trim()) { toast.error("اكتب رسالتك أولاً"); return; }
    setPolishing(true);
    try {
      const r = await campaignPolish({ data: { text } });
      setText(r.text);
      toast.success("حسّنت رسالتك ✨");
    } catch (e) { toast.error(e instanceof Error ? e.message : "تعذر التحسين"); }
    setPolishing(false);
  };

  const send = async () => {
    if (!instance) { toast.error("اربط رقم واتساب أولاً من استوديو الأصوات"); return; }
    if (!text.trim()) { toast.error("اكتب رسالة الحملة"); return; }
    if (selected.length === 0) { toast.error("اختر زبون واحد على الأقل"); return; }
    setBusy(true);
    try {
      const r = await campaignSend({ data: { name: instance, numbers: selected.map((c) => c.phone.replace(/\s/g, "")), text } });
      toast.success(`انرسلت الحملة لـ ${r.sent} زبون ✅ (التكلفة ${r.cost} نقطة)`);
      if (r.failed > 0) toast.error(`${r.failed} رسائل ما وصلت`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "تعذر الإرسال"); }
    setBusy(false);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-card p-5 shadow-soft">
        <h2 className="font-display mb-1 text-lg text-primary">📣 حملات المملكة</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          أرسل عرضك أو رسالتك لكل زبائنك على واتساب بضغطة واحدة — والذكاء يحسّن صياغتها قبل الإرسال. كل رسالة = نقطة واحدة.
        </p>
        {instances.length === 0 ? (
          <p className="rounded-xl bg-secondary p-3 text-sm">⚠️ ما عندك رقم واتساب مربوط — روح 🎤 استوديو الأصوات واربط رقمك بتصوير الكود أولاً.</p>
        ) : (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span>ترسل من رقم:</span>
            {instances.map((i) => (
              <button key={i.name} onClick={() => setInstance(i.name)}
                className={`rounded-full px-3 py-1 text-xs ${instance === i.name ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{i.label}</button>
            ))}
          </div>
        )}
        <Textarea rows={4} placeholder="اكتب رسالة حملتك… مثال: عروض نهاية الأسبوع، خصم 30% على كل شي!" value={text} onChange={(e) => setText(e.target.value)} />
        <PinnedReplies use="campaign" onPick={setText} />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="outline" onClick={polish} disabled={polishing}>{polishing ? "يحسّن…" : "✨ حسّنها بالذكاء"}</Button>
          <Button onClick={send} disabled={busy || instances.length === 0}>{busy ? "يرسل…" : `🚀 أرسل لـ ${selected.length} زبون`}</Button>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-primary">👥 اختر الزبائن ({selected.length}/{withPhone.length})</h3>
          <Button size="sm" variant="ghost" onClick={() => setPicked(picked.size === withPhone.length ? new Set() : new Set(withPhone.map((c) => c.id)))}>
            {picked.size === withPhone.length ? "ألغِ الكل" : "اختر الكل"}
          </Button>
        </div>
        {withPhone.length === 0 ? (
          <p className="text-sm text-muted-foreground">ما عندك زبائن بأرقام جوال — أضفهم من تبويب 👥 الزبائن.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {withPhone.map((c) => (
              <label key={c.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${picked.has(c.id) ? "border-primary bg-secondary/60" : ""}`}>
                <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                <div className="flex-1">
                  <p className="font-semibold">{c.name || "بدون اسم"}</p>
                  <p className="text-xs text-muted-foreground" dir="ltr">{c.phone}</p>
                </div>
              </label>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
