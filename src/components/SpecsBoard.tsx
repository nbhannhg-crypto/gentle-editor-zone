import { useEffect, useState } from "react";
import { toast } from "sonner";
import { announceSpecs } from "@/lib/ai.functions";
import { loadPref, savePref } from "@/lib/ui-prefs";
import { fixSpeech } from "@/lib/saudi-num";
import { supabase } from "@/integrations/supabase/client";

type Spec = { id: string; n: number; gender: "bride" | "groom"; title: string; speech: string; raw: string; contact?: string; code?: string };
type FormRow = { id: string; code: string; gender: string; status: string; data: Record<string, string> };
const KEY = "live_specs";
const FIELDS: [string, string][] = [["age", "العمر"], ["city", "المدينة"], ["nationality", "الجنسية"], ["marital", "الحالة"], ["kids", "الأطفال"], ["type", "نوع الزواج"], ["height", "الطول"], ["weight", "الوزن"], ["edu", "التعليم"], ["job", "الوظيفة"], ["religion", "الالتزام"], ["traits", "الصفات"], ["about", "نبذة"], ["pAge", "العمر المطلوب"], ["pCity", "المدينة المطلوبة"], ["pTerms", "الشروط"], ["pNo", "لا يقبل"]];
const formText = (r: FormRow) => FIELDS.filter(([k]) => r.data?.[k]?.trim()).map(([k, l]) => `${l}: ${r.data[k]!.trim()}`).join("\n");

// 💍 شريط مواصفات العرسان: الصق ← (بذكاء أو بدون) ← زر محفوظ ينطق فوراً
export function SpecsBoard({ onSay }: { onSay: (text: string) => void }) {
  const [list, setList] = useState<Spec[]>([]);
  const [raw, setRaw] = useState("");
  const [contact, setContact] = useState("");
  const [gender, setGender] = useState<"bride" | "groom">("bride");
  const [useAi, setUseAi] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState("");
  const [editT, setEditT] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(true);
  const [forms, setForms] = useState<FormRow[] | null>(null);
  const [fg, setFg] = useState<"female" | "male">("female");
  const [seen, setSeen] = useState("");

  useEffect(() => { void loadPref<Spec[]>(KEY).then((v) => { if (Array.isArray(v)) setList(v); setLoaded(true); }); void loadPref<boolean>("live_specs_open").then((v) => { if (typeof v === "boolean") setOpen(v); }); }, []);
  const save = (v: Spec[]) => { setList(v); if (loaded) void savePref(KEY, v); };
  const toggle = () => { const v = !open; setOpen(v); void savePref("live_specs_open", v); };

  const create = async (g: "bride" | "groom", text: string, ai: boolean, extra: Partial<Spec> = {}) => {
    const who = g === "bride" ? "عروسة" : "عريس";
    let title = who, speech = text;
    if (ai) { const r = await announceSpecs({ data: { gender: g, raw: text } }); title = r.title; speech = r.speech; }
    else title = `${who} ${text.split(/\s+/).slice(0, 4).join(" ")}`.slice(0, 60);
    speech = fixSpeech(speech);
    const n = list.reduce((m, x) => Math.max(m, x.n), 0) + 1;
    const it: Spec = { id: crypto.randomUUID(), n, gender: g, title, speech, raw: text, ...extra };
    save([it, ...list]); onSay(speech); toast.success(`انحفظ طلب رقم ${n}`);
  };
  const make = async () => {
    if (raw.trim().length < 3) { toast.error("الصق المواصفات أول"); return; }
    setBusy(true);
    try { await create(gender, raw.trim(), useAi, contact.trim() ? { contact: contact.trim() } : {}); setRaw(""); setContact(""); } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };
  const cp = async (t: string, msg = "انسخ") => { await navigator.clipboard.writeText(t); toast.success(msg); };
  const del = (s: Spec) => { if (confirm(`حذف طلب رقم ${s.n}؟`)) save(list.filter((x) => x.id !== s.id)); };
  const saveEdit = () => { save(list.map((x) => x.id === editId ? { ...x, speech: fixSpeech(editT.trim()) || x.speech } : x)); setEditId(""); };
  const setC = (s: Spec, c: string) => save(list.map((x) => x.id === s.id ? { ...x, contact: c } : x));

  const openForms = async () => {
    if (forms) { setForms(null); return; }
    const { data, error } = await supabase.from("marriage_forms").select("id, code, gender, status, data").order("created_at", { ascending: false }).limit(300);
    if (error) { toast.error("تعذر جلب الاستمارات"); return; }
    setForms((data ?? []) as unknown as FormRow[]);
  };
  const addForm = async (r: FormRow) => {
    setBusy(true);
    try { await create(r.gender === "female" ? "bride" : "groom", formText(r) || "مواصفات", true, { code: r.code }); } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };

  return (
    <section className="rounded-xl border p-2 space-y-2">
      <div className="flex items-center gap-2">
        <button onClick={toggle} className="flex-1 text-right text-sm font-semibold">💍 مواصفات العرسان للبث <span className="text-[11px] text-muted-foreground">({list.length})</span></button>
        <button onClick={() => void openForms()} className="rounded-lg border px-2 py-1 text-[11px]">📋 الاستمارات</button>
        <button onClick={toggle} title={open ? "إغلاق" : "فتح"} className="rounded-lg border px-2 py-1 text-xs">{open ? "✕" : "▼"}</button>
      </div>
      {open && <>
        {forms && (
          <div className="space-y-1.5 rounded-lg border bg-muted/40 p-1.5">
            <div className="flex gap-1">
              <button onClick={() => setFg("female")} className={`flex-1 rounded border py-1 text-xs ${fg === "female" ? "bg-primary text-primary-foreground" : ""}`}>👰 عرائس ({forms.filter((f) => f.gender === "female").length})</button>
              <button onClick={() => setFg("male")} className={`flex-1 rounded border py-1 text-xs ${fg === "male" ? "bg-primary text-primary-foreground" : ""}`}>🤵 عرسان ({forms.filter((f) => f.gender === "male").length})</button>
              <button onClick={() => setForms(null)} className="rounded border px-2 text-xs">✕</button>
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {forms.filter((f) => f.gender === fg).map((r) => (
                <div key={r.id} className="rounded border bg-background p-1.5 text-[11px]">
                  <div className="flex items-center gap-1">
                    <button onClick={() => void cp(r.code, `انسخ الرقم ${r.code}`)} className="rounded bg-primary/10 px-1.5 font-bold">#{r.code}</button>
                    <button onClick={() => setSeen(seen === r.id ? "" : r.id)} className="flex-1 truncate text-right">{r.data?.["age"] ? `${r.data["age"]} سنة` : ""} · {r.data?.["city"] ?? ""} · {r.data?.["marital"] ?? ""}{seen !== r.id && r.status === "new" ? " 🆕" : ""}</button>
                    <button onClick={() => void cp(`#${r.code}\n${formText(r)}`)} title="نسخ الكتابة" className="px-1">📋</button>
                    <button onClick={() => void addForm(r)} disabled={busy} className="rounded bg-primary px-1.5 py-0.5 text-primary-foreground disabled:opacity-50">➕ أضف</button>
                  </div>
                  {seen === r.id && <pre className="mt-1 whitespace-pre-wrap font-sans text-muted-foreground">{formText(r) || "لا توجد تفاصيل"}</pre>}
                </div>))}
            </div>
          </div>
        )}
        <div className="flex gap-1">
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="اختياري: جوال أو يوزر (أي منصة)" className="flex-1 rounded-lg border bg-background px-2 py-1 text-xs" />
          <button onClick={() => contact.trim() && void cp(contact.trim())} className="rounded-lg border px-2 text-xs">📋</button>
        </div>
        <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={3} maxLength={4000} placeholder="الصق مواصفات العروسة أو العريس هنا" className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm" />
        <div className="flex gap-1.5">
          <button onClick={() => setGender("bride")} className={`flex-1 rounded-lg border py-1.5 text-xs ${gender === "bride" ? "bg-primary text-primary-foreground" : ""}`}>👰 عروسة</button>
          <button onClick={() => setGender("groom")} className={`flex-1 rounded-lg border py-1.5 text-xs ${gender === "groom" ? "bg-primary text-primary-foreground" : ""}`}>🤵 عريس</button>
          <button onClick={() => setUseAi(!useAi)} className="rounded-lg border px-2 py-1.5 text-[11px]">{useAi ? "✨ بذكاء" : "📝 بدون ذكاء"}</button>
        </div>
        <button onClick={() => void make()} disabled={busy} className="w-full rounded-lg bg-primary py-1.5 text-xs text-primary-foreground disabled:opacity-50">{busy ? "⏳ يجهز..." : useAi ? "✨ نظّم وانطق واحفظ" : "📝 انطق واحفظ مثل ما هي"}</button>
        {list.length === 0 ? <p className="text-[11px] text-muted-foreground">لا يوجد طلبات محفوظة بعد.</p> : (
          <div className="max-h-[17rem] space-y-1.5 overflow-y-auto overscroll-contain pe-1">{list.map((s) => (
            <div key={s.id} className="rounded-lg border p-1.5">
              <div className="flex items-center gap-1">
                <button onClick={() => onSay(s.speech)} className="flex-1 truncate text-right text-xs font-semibold">🔊 #{s.n} {s.gender === "bride" ? "👰" : "🤵"} {s.title}{s.code ? ` · ${s.code}` : ""}</button>
                <button onClick={() => { setEditId(s.id); setEditT(s.speech); }} title="تعديل" className="px-1 text-xs">✏️</button>
                <button onClick={() => void cp(`#${s.n} ${s.title}\n${s.speech}`)} title="نسخ" className="px-1 text-xs">📋</button>
                <button onClick={() => del(s)} title="حذف" className="px-1 text-xs">🗑️</button>
              </div>
              <div className="mt-1 flex gap-1">
                <input defaultValue={s.contact ?? ""} onBlur={(e) => e.target.value !== (s.contact ?? "") && setC(s, e.target.value.trim())} placeholder="جوال / يوزر (اختياري)" className="flex-1 rounded border bg-background px-1.5 py-0.5 text-[11px]" />
                <button onClick={() => s.contact && void cp(s.contact)} className="rounded border px-1.5 text-[11px]">📋</button>
              </div>
              {editId === s.id ? (
                <div className="mt-1 space-y-1"><textarea value={editT} onChange={(e) => setEditT(e.target.value)} rows={4} className="w-full rounded border bg-background px-2 py-1 text-xs" /><div className="flex gap-1"><button onClick={saveEdit} className="rounded bg-primary px-2 py-1 text-[11px] text-primary-foreground">💾 حفظ</button><button onClick={() => setEditId("")} className="rounded border px-2 py-1 text-[11px]">إلغاء</button></div></div>
              ) : <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{s.speech}</p>}
            </div>))}</div>
        )}
      </>}
    </section>
  );
}
