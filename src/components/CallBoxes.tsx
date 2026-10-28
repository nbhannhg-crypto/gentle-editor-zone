import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadCockpit, COCKPIT_KEY } from "@/components/LiveCockpit";

/** مربع قائمة: إضافة / تعديل / حذف — يحفظ في لوحة التحكم المشتركة مع المكالمة المباشرة */
function ListBox({ title, hint, items, onSave, tone }: { title: string; hint: string; items: string[]; onSave: (v: string[]) => void; tone: string }) {
  const [draft, setDraft] = useState("");
  const [edit, setEdit] = useState<number | null>(null);
  const [val, setVal] = useState("");
  const add = () => { const t = draft.trim(); if (!t) return; onSave([...items, t]); setDraft(""); toast.success("✅ انضاف وانحفظ"); };
  return (
    <details className={`rounded-2xl border p-3 ${tone}`}>
      <summary className="cursor-pointer text-sm font-semibold">{title} ({items.length})</summary>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
      <div className="mt-2 flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="اكتب واضغط ➕" onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <Button type="button" onClick={add}>➕</Button>
      </div>
      <ul className="mt-2 space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2 rounded-xl bg-secondary px-2 py-1.5 text-sm">
            {edit === i ? (
              <>
                <Input value={val} onChange={(e) => setVal(e.target.value)} className="h-8" autoFocus />
                <Button size="sm" onClick={() => { const n = [...items]; if (val.trim()) n[i] = val.trim(); onSave(n); setEdit(null); toast.success("✏️ انعدل"); }}>💾</Button>
              </>
            ) : (
              <>
                <span className="flex-1 break-words">{it}</span>
                <button type="button" aria-label="تعديل" onClick={() => { setEdit(i); setVal(it); }}>✏️</button>
                <button type="button" aria-label="حذف" onClick={() => { onSave(items.filter((_, j) => j !== i)); toast.success("🗑️ انحذف"); }}>🗑️</button>
              </>
            )}
          </li>
        ))}
        {!items.length && <li className="text-xs text-muted-foreground">فاضي للحين.</li>}
      </ul>
    </details>
  );
}

export function CallBoxes() {
  const [info, setInfo] = useState<string[]>([]);
  const [banned, setBanned] = useState<string[]>([]);
  useEffect(() => { const c = loadCockpit(); setInfo(c.persona.split("\n").map((s) => s.trim()).filter(Boolean)); setBanned(c.banned); }, []);
  const save = (o: { persona?: string; banned?: string[] }) => {
    const c = { ...loadCockpit(), ...o };
    localStorage.setItem(COCKPIT_KEY, JSON.stringify(c));
  };
  return (
    <section className="mt-4 grid gap-3">
      <ListBox title="💗 معلومات وقصة الموظفة (تنفذها حرفياً)" hint="كل سطر معلومة: اسمها، علاقتكم، طريقة دلعها… تلتزم فيها ولا تألف غيرها." tone="bg-card"
        items={info} onSave={(v) => { setInfo(v); save({ persona: v.join("\n") }); }} />
      <ListBox title="🚫 الكلام الممنوع" hint="أي كلمة أو عبارة هنا ما تقولها أبداً — ولو طلعت بالرد ينشال." tone="bg-card"
        items={banned} onSave={(v) => { setBanned(v); save({ banned: v }); }} />
    </section>
  );
}
