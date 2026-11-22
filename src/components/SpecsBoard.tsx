import { useEffect, useState } from "react";
import { toast } from "sonner";
import { announceSpecs } from "@/lib/ai.functions";
import { loadPref, savePref } from "@/lib/ui-prefs";

type Spec = { id: string; n: number; gender: "bride" | "groom"; title: string; speech: string; raw: string };
const KEY = "live_specs";

// 💍 شريط مواصفات العرسان: الصق ← الذكاء ينظم ← زر محفوظ ينطق فوراً
export function SpecsBoard({ onSay }: { onSay: (text: string) => void }) {
  const [list, setList] = useState<Spec[]>([]);
  const [raw, setRaw] = useState("");
  const [gender, setGender] = useState<"bride" | "groom">("bride");
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState("");
  const [editT, setEditT] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { void loadPref<Spec[]>(KEY).then((v) => { if (Array.isArray(v)) setList(v); setLoaded(true); }); }, []);
  const save = (v: Spec[]) => { setList(v); if (loaded) void savePref(KEY, v); };

  const make = async () => {
    if (raw.trim().length < 3) { toast.error("الصق المواصفات أول"); return; }
    setBusy(true);
    try {
      const r = await announceSpecs({ data: { gender, raw: raw.trim() } });
      const n = list.reduce((m, x) => Math.max(m, x.n), 0) + 1;
      const it: Spec = { id: crypto.randomUUID(), n, gender, title: r.title, speech: r.speech, raw: raw.trim() };
      save([it, ...list]); setRaw("");
      onSay(r.speech); // ينطقها أول مرة وتنحفظ بالخزينة
      toast.success(`انحفظ طلب رقم ${n}`);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };
  const copy = async (s: Spec) => { await navigator.clipboard.writeText(`#${s.n} ${s.title}\n${s.speech}`); toast.success("انسخ"); };
  const del = (s: Spec) => { if (confirm(`حذف طلب رقم ${s.n}؟`)) save(list.filter((x) => x.id !== s.id)); };
  const saveEdit = () => { save(list.map((x) => x.id === editId ? { ...x, speech: editT.trim() || x.speech } : x)); setEditId(""); };

  return (
    <section className="rounded-xl border p-2 space-y-2">
      <div className="text-sm font-semibold">💍 مواصفات العرسان للبث</div>
      <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={3} maxLength={4000} placeholder="الصق مواصفات العروسة أو العريس هنا والذكاء ينظمها" className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm" />
      <div className="flex gap-2">
        <button onClick={() => setGender("bride")} className={`flex-1 rounded-lg border py-1.5 text-xs ${gender === "bride" ? "bg-primary text-primary-foreground" : ""}`}>👰 عروسة</button>
        <button onClick={() => setGender("groom")} className={`flex-1 rounded-lg border py-1.5 text-xs ${gender === "groom" ? "bg-primary text-primary-foreground" : ""}`}>🤵 عريس</button>
        <button onClick={() => void make()} disabled={busy} className="flex-1 rounded-lg bg-primary py-1.5 text-xs text-primary-foreground disabled:opacity-50">{busy ? "⏳ ينظم..." : "✨ نظّم وانطق واحفظ"}</button>
      </div>
      {list.length === 0 ? <p className="text-[11px] text-muted-foreground">لا يوجد طلبات محفوظة بعد.</p> : (
        <div className="space-y-1.5">{list.map((s) => (
          <div key={s.id} className="rounded-lg border p-1.5">
            <div className="flex items-center gap-1">
              <button onClick={() => onSay(s.speech)} className="flex-1 truncate text-right text-xs font-semibold">🔊 #{s.n} {s.gender === "bride" ? "👰" : "🤵"} {s.title}</button>
              <button onClick={() => { setEditId(s.id); setEditT(s.speech); }} title="تعديل" className="px-1 text-xs">✏️</button>
              <button onClick={() => void copy(s)} title="نسخ" className="px-1 text-xs">📋</button>
              <button onClick={() => del(s)} title="حذف" className="px-1 text-xs">🗑️</button>
            </div>
            {editId === s.id ? (
              <div className="mt-1 space-y-1"><textarea value={editT} onChange={(e) => setEditT(e.target.value)} rows={4} className="w-full rounded border bg-background px-2 py-1 text-xs" /><div className="flex gap-1"><button onClick={saveEdit} className="rounded bg-primary px-2 py-1 text-[11px] text-primary-foreground">💾 حفظ</button><button onClick={() => setEditId("")} className="rounded border px-2 py-1 text-[11px]">إلغاء</button></div></div>
            ) : <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{s.speech}</p>}
          </div>))}</div>
      )}
    </section>
  );
}
