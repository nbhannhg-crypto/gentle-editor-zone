import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fetchCustomers, saveCustomer, deleteCustomer, type Customer } from "@/lib/channels";

export function Customers({ storeId }: { storeId?: string | undefined }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const reload = async (): Promise<void> => { setCustomers(await fetchCustomers(storeId)); };
  useEffect(() => { reload(); }, [storeId]);

  const save = async (): Promise<void> => {
    if (!name.trim() && !phone.trim()) { toast.error("اكتب اسم الزبون أو رقمه"); return; }
    const payload = editing
      ? { id: editing, name: name.trim(), phone: phone.trim(), notes: notes.trim() }
      : { name: name.trim(), phone: phone.trim(), notes: notes.trim(), channel: "manual" };
    const { error } = await saveCustomer(payload, storeId);
    if (error) { toast.error("تعذر الحفظ"); return; }
    toast.success(editing ? "تم التحديث ✅" : "انحفظ الزبون ✅");
    setName(""); setPhone(""); setNotes(""); setEditing(null);
    reload();
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-card p-5 shadow-soft">
        <h2 className="font-display mb-1 text-lg text-primary">👥 ذاكرة الزبائن</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          كل زبون يراسلك على أي قناة ينحفظ هنا تلقائياً — وتقدر تضيف زبائنك بنفسك وتكتب ملاحظات عنهم.
        </p>
        <div className="grid gap-2 md:grid-cols-3">
          <Input placeholder="اسم الزبون" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="رقم الجوال" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input placeholder="ملاحظات (وش يحب، وش اعترض عليه…)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="mt-3 flex gap-2">
          <Button onClick={save}>{editing ? "حدّث الزبون" : "أضف زبون"}</Button>
          {editing && <Button variant="ghost" onClick={() => { setEditing(null); setName(""); setPhone(""); setNotes(""); }}>إلغاء</Button>}
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-soft">
        <h2 className="font-display mb-3 text-lg text-primary">📇 الزبائن ({customers.length})</h2>
        {customers.length === 0 ? (
          <p className="text-sm text-muted-foreground">ما عندك زبائن محفوظين بعد.</p>
        ) : (
          <div className="space-y-2">
            {customers.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm">
                <div className="flex-1 min-w-40">
                  <p className="font-semibold">{c.name || "بدون اسم"} <span dir="ltr" className="text-xs text-muted-foreground">{c.phone}</span></p>
                  {c.notes && <p className="text-muted-foreground">{c.notes}</p>}
                  {c.last_message && <p className="text-xs text-muted-foreground">آخر رسالة: {c.last_message}</p>}
                </div>
                <span className="flex items-center gap-0.5" title="تقييم الزبون">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      onClick={async () => { await saveCustomer({ id: c.id, rating: s === c.rating ? 0 : s }); reload(); }}
                      className={`text-base transition ${s <= (c.rating ?? 0) ? "text-gold" : "text-muted-foreground/30 hover:text-gold/60"}`}
                    >★</button>
                  ))}
                </span>
                {(() => {
                  const days = c.created_at ? (Date.parse(c.last_seen) - Date.parse(c.created_at)) / 86400000 : 0;
                  return days > 1 ? (
                    <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs text-gold" title="رجع يراسلك بعد أول يوم">🔁 زبون راجع</span>
                  ) : (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs" title="أول تواصل معه">🆕 جديد</span>
                  );
                })()}
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{c.channel}</span>
                <Button size="sm" variant="outline" onClick={() => { setEditing(c.id); setName(c.name); setPhone(c.phone); setNotes(c.notes); }}>تعديل</Button>
                <Button size="sm" variant="ghost" onClick={async () => { await deleteCustomer(c.id); reload(); }}>🗑️</Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
