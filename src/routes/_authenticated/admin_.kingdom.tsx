import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isAdmin } from "@/lib/stores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/admin_/kingdom")({
  head: () => ({
    meta: [
      { title: "مملكة الأم — التحكم بالأسعار" },
      { name: "description", content: "تحكم المالك بأسعار الخدمات والضمار والأرباح بالنقاط" },
      { property: "og:title", content: "مملكة الأم — التحكم بالأسعار" },
      { property: "og:description", content: "أسعار الخدمات والأرباح في مملكة المبيعات" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KingdomPage,
});

type Row = { id: string; service_name: string; supplier_name: string; supplier_cost_points: number; overhead_points: number; profit_multiplier: number; dammar: number; profit: number; selling_price: number };
const blank = { id: "", service_name: "", supplier_name: "", supplier_cost_points: 0, overhead_points: 500, profit_multiplier: 2 };
const n = (v: number) => `${Number(v).toLocaleString("ar-SA")} 💎`;

function KingdomPage() {
  const navigate = useNavigate();
  const [ok, setOk] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [merchants, setMerchants] = useState(0);
  const [edit, setEdit] = useState<typeof blank | null>(null);

  const load = async () => {
    const { data } = await supabase.from("kingdom_pricing").select("*").order("created_at");
    setRows((data ?? []) as Row[]);
  };
  useEffect(() => {
    isAdmin().then((a) => {
      setOk(a);
      if (!a) return;
      load();
      supabase.from("stores").select("id", { count: "exact", head: true }).then(({ count }) => setMerchants(count ?? 0));
    });
    const ch = supabase.channel("pricing").on("postgres_changes", { event: "*", schema: "public", table: "kingdom_pricing" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const save = async () => {
    if (!edit) return;
    if (!edit.service_name.trim()) { toast.error("اكتب اسم الخدمة"); return; }
    const payload = {
      service_name: edit.service_name.trim().slice(0, 80), supplier_name: edit.supplier_name.trim().slice(0, 80),
      supplier_cost_points: Math.max(0, Math.floor(edit.supplier_cost_points)), overhead_points: Math.max(0, Math.floor(edit.overhead_points)),
      profit_multiplier: Math.max(0, Number(edit.profit_multiplier)),
    };
    const { error } = edit.id ? await supabase.from("kingdom_pricing").update(payload).eq("id", edit.id) : await supabase.from("kingdom_pricing").insert(payload);
    if (error) { toast.error("تعذر الحفظ"); return; }
    toast.success("انحفظ السعر وتحدث في كل الموقع ✅");
    setEdit(null); load();
  };
  const del = async (id: string) => { await supabase.from("kingdom_pricing").delete().eq("id", id); load(); };

  if (ok === null) return <p className="p-8 text-center">...</p>;
  if (!ok) return <p className="p-8 text-center">هذي الصفحة للمالك فقط.</p>;
  const totalD = rows.reduce((s, r) => s + r.dammar, 0);
  const totalP = rows.reduce((s, r) => s + r.profit, 0);

  return (
    <div className="min-h-screen">
      <header className="bg-royal text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
          <h1 className="font-display text-2xl">👑 مملكة الأم - التحكم بالأسعار</h1>
          <Button variant="outline" className="text-foreground" onClick={() => navigate({ to: "/admin" })}>لوحة المالك</Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {([["إجمالي الضمار", n(totalD)], ["الأرباح المتوقعة", n(totalP)], ["التجار المسجلين", merchants.toLocaleString("ar-SA")]] as const).map(([l, v]) => (
            <section key={l} className="rounded-2xl border bg-card p-5 shadow-soft">
              <p className="text-sm text-muted-foreground">{l}</p>
              <p className="font-display text-3xl text-primary">{v}</p>
            </section>
          ))}
        </div>
        <section className="rounded-2xl border bg-card p-5 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg text-primary">الخدمات</h2>
            <Button onClick={() => setEdit({ ...blank })}>+ خدمة جديدة</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-muted-foreground">
                {["اسم الخدمة", "تكلفة المزود", "الضمار", "الربح", "سعر البيع", ""].map((h) => <th key={h} className="p-2 text-right">{h}</th>)}
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="p-2 font-semibold">{r.service_name}<div className="text-xs text-muted-foreground">{r.supplier_name}</div></td>
                    <td className="p-2">{n(r.supplier_cost_points)}</td>
                    <td className="p-2">{n(r.dammar)}</td>
                    <td className="p-2">{n(r.profit)} <span className="text-xs text-muted-foreground">×{r.profit_multiplier}</span></td>
                    <td className="p-2 font-bold text-primary">{n(r.selling_price)}</td>
                    <td className="space-x-1 p-2 whitespace-nowrap">
                      <Button size="sm" variant="outline" onClick={() => setEdit({ ...r })}>تعديل</Button>
                      <Button size="sm" variant="ghost" onClick={() => del(r.id)}>🗑️</Button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">أضف أول خدمة.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" onClick={() => setEdit(null)}>
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-card p-5 shadow-soft" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg text-primary">{edit.id ? "تعديل الخدمة" : "خدمة جديدة"}</h3>
            <Input placeholder="اسم الخدمة (صوت، تعليق...)" value={edit.service_name} onChange={(e) => setEdit({ ...edit, service_name: e.target.value })} />
            <Input placeholder="اسم المزود" value={edit.supplier_name} onChange={(e) => setEdit({ ...edit, supplier_name: e.target.value })} />
            <label className="block text-sm">تكلفة المزود (نقاط)<Input type="number" value={edit.supplier_cost_points} onChange={(e) => setEdit({ ...edit, supplier_cost_points: Number(e.target.value) })} /></label>
            <label className="block text-sm">مصاريف التشغيل (نقاط)<Input type="number" value={edit.overhead_points} onChange={(e) => setEdit({ ...edit, overhead_points: Number(e.target.value) })} /></label>
            <div className="text-sm">نسبة الربح:
              <div className="mt-1 flex flex-wrap gap-2">
                {[1, 1.5, 2, 2.5, 3].map((m) => (
                  <button key={m} onClick={() => setEdit({ ...edit, profit_multiplier: m })}
                    className={`rounded-full border px-3 py-1 ${Number(edit.profit_multiplier) === m ? "bg-primary text-primary-foreground" : ""}`}>
                    {m === 1 ? "مثل الضمار" : m === 1.5 ? "ضعف ونص" : m === 2 ? "ضعف" : `×${m}`}
                  </button>
                ))}
              </div>
            </div>
            {(() => { const d = Math.floor(edit.supplier_cost_points) + Math.floor(edit.overhead_points); const p = Math.floor(d * Number(edit.profit_multiplier)); return (
              <p className="rounded-xl bg-secondary p-3 text-sm">الضمار {n(d)} • الربح {n(p)} • البيع <b>{n(d + p)}</b></p>
            ); })()}
            <div className="flex gap-2"><Button className="flex-1" onClick={save}>حفظ</Button><Button variant="outline" onClick={() => setEdit(null)}>إلغاء</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}
