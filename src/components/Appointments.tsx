import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type Appointment = {
  id: string;
  customer_name: string;
  phone: string;
  service: string;
  appointment_at: string;
  status: string;
  notes: string;
};

const STATUSES = ["قادم", "تم", "ملغي"] as const;

export function Appointments({ storeId }: { storeId?: string | undefined }) {
  const [items, setItems] = useState<Appointment[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [service, setService] = useState("");
  const [when, setWhen] = useState("");
  const [notes, setNotes] = useState("");

  const reload = async (): Promise<void> => {
    if (!storeId) { setItems([]); return; }
    const { data } = await supabase
      .from("appointments")
      .select("*")
      .eq("store_id", storeId)
      .order("appointment_at", { ascending: true });
    setItems((data as Appointment[] | null) ?? []);
  };
  useEffect(() => { reload(); }, [storeId]);

  const add = async (): Promise<void> => {
    if (!storeId) { toast.error("جاري تجهيز متجرك… جرب بعد ثانية"); return; }
    if (!name.trim() || !when) { toast.error("اكتب اسم الزبون ووقت الموعد"); return; }
    const { error } = await supabase.from("appointments").insert({
      store_id: storeId,
      customer_name: name.trim(),
      phone: phone.trim(),
      service: service.trim(),
      appointment_at: new Date(when).toISOString(),
      notes: notes.trim(),
    });
    if (error) { toast.error("تعذر حفظ الموعد"); return; }
    toast.success("انحجز الموعد ✅");
    setName(""); setPhone(""); setService(""); setWhen(""); setNotes("");
    reload();
  };

  const setStatus = async (id: string, status: string): Promise<void> => {
    await supabase.from("appointments").update({ status }).eq("id", id);
    reload();
  };

  const remove = async (id: string): Promise<void> => {
    await supabase.from("appointments").delete().eq("id", id);
    reload();
  };

  const upcoming = items.filter((a) => a.status === "قادم" && new Date(a.appointment_at) >= new Date());

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-card p-5 shadow-soft">
        <h2 className="font-display mb-1 text-lg text-primary">📅 مواعيد المملكة</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          سجّل مواعيد زبائنك (تصميم، دعم، استشارة، تركيب…) وخلّ كل شي مرتب قدامك — عندك {upcoming.length} موعد قادم.
        </p>
        <div className="grid gap-2 md:grid-cols-3">
          <Input placeholder="اسم الزبون" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="رقم الجوال" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input placeholder="الخدمة (تصميم شعار، دعم فني…)" value={service} onChange={(e) => setService(e.target.value)} />
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          <Input placeholder="ملاحظات" className="md:col-span-2" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <Button className="mt-3" onClick={add}>احجز الموعد</Button>
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-soft">
        <h2 className="font-display mb-3 text-lg text-primary">🗓️ المواعيد ({items.length})</h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">ما عندك مواعيد بعد — احجز أول موعد فوق.</p>
        ) : (
          <div className="space-y-2">
            {items.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm">
                <div className="flex-1 min-w-40">
                  <p className="font-semibold">
                    {a.customer_name} <span dir="ltr" className="text-xs text-muted-foreground">{a.phone}</span>
                  </p>
                  <p className="text-muted-foreground">
                    {a.service && <span>{a.service} — </span>}
                    {new Date(a.appointment_at).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                  {a.notes && <p className="text-xs text-muted-foreground">{a.notes}</p>}
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${a.status === "قادم" ? "bg-secondary" : a.status === "تم" ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"}`}>
                  {a.status}
                </span>
                {a.status === "قادم" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setStatus(a.id, "تم")}>✅ تم</Button>
                    <Button size="sm" variant="ghost" onClick={() => setStatus(a.id, "ملغي")}>إلغاء</Button>
                  </>
                )}
                <Button size="sm" variant="ghost" onClick={() => remove(a.id)}>🗑️</Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
