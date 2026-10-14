import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { brainChat } from "@/lib/brains.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";

export const SCOPES = [
  ["sender", "👤 المرسل فقط"], ["chosen", "📌 أرقام مختارة"], ["all", "📱 كل الأرقام"], ["last10", "🔟 آخر 10 أرقام"],
  ["whatsapp", "💚 واتساب فقط"], ["platforms", "🌐 المنصات فقط"], ["everywhere", "🌍 كل مكان"],
] as const;
const VOICES = ["صوت المملكة الأصلي", "صوت ناعم", "صوت رسمي", "بدون صوت"];
const MAX_BRAINS = 10;
const MAX_LIB = 100000;

type B = { id: string; name: string; emoji: string; specialty: string; source: string; instructions: string; knowledge: string; uses: number; scopes: string[]; voice_name: string; library_tag: string; in_mother: boolean };
type Row = { id: string; tag: string; trigger_text: string; reply_text: string };

export function MotherBrain({ storeId }: { storeId?: string | undefined }) {
  const [brains, setBrains] = useState<B[]>([]);
  const [view, setView] = useState<"brains" | "library">("brains");
  const load = async () => {
    if (!storeId) return;
    const { data } = await supabase.from("brains").select("*").eq("store_id", storeId).order("created_at");
    setBrains((data ?? []) as B[]);
  };
  useEffect(() => { load(); }, [storeId]);
  const inner = brains.filter((b) => b.in_mother);

  const addBrain = async (name: string, emoji: string) => {
    if (!storeId || !name.trim()) return;
    if (inner.length >= MAX_BRAINS) { toast.error("الحد 10 عقول داخل العقل الأم"); return; }
    const { error } = await supabase.from("brains").insert({ store_id: storeId, name: name.slice(0, 60), emoji: emoji || "🧠", specialty: "عقل داخلي", source: "both", instructions: `أنت ${name}، ترد باللهجة السعودية باحتراف.`, knowledge: "", in_mother: true, scopes: ["sender"], voice_name: VOICES[0]! });
    if (error) { toast.error(error.message); return; }
    toast.success("انضاف العقل 🧠"); load();
  };
  const update = async (id: string, patch: Partial<B>) => {
    setBrains((p) => p.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    const { error } = await supabase.from("brains").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-royal p-5 text-primary-foreground shadow-soft">
        <div className="flex items-center gap-3">
          <span className="animate-pulse text-5xl">🧠</span>
          <div>
            <h2 className="font-display text-2xl">مملكة العقول — العقل الأم</h2>
            <p className="text-sm opacity-80">{inner.length}/{MAX_BRAINS} عقول داخلية · كل عقل له مكتبة وصوت ومكان رد</p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          {([["brains", "🧠 العقول"], ["library", "📚 مكتبة الردود"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} className={`rounded-full px-4 py-1.5 text-sm ${view === k ? "bg-gold font-semibold text-accent-foreground" : "bg-primary-foreground/15"}`}>{l}</button>
          ))}
        </div>
      </section>
      {view === "brains" ? (
        <>
          <AddBrain onAdd={addBrain} existing={brains.filter((b) => !b.in_mother)} onAttach={(id) => inner.length >= MAX_BRAINS ? toast.error("الحد 10 عقول") : update(id, { in_mother: true })} />
          <div className="grid gap-3 md:grid-cols-2">
            {inner.map((b) => <BrainCard key={b.id} b={b} onChange={(p) => update(b.id, p)} />)}
          </div>
          {!inner.length && <p className="rounded-xl bg-secondary p-4 text-center text-sm">ما فيه عقول داخل العقل الأم — أضف أول عقل (مبيعات، ردود، تصميم…)</p>}
        </>
      ) : <Library storeId={storeId} />}
    </div>
  );
}

function AddBrain({ onAdd, existing, onAttach }: { onAdd: (n: string, e: string) => void; existing: B[]; onAttach: (id: string) => void }) {
  const [name, setName] = useState(""); const [emoji, setEmoji] = useState("🧠");
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-soft">
      <div className="flex flex-wrap gap-2">
        <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} className="w-16 text-center" />
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="سمّ العقل: عقل المبيعات، عقل الردود…" className="min-w-40 flex-1" />
        <Button onClick={() => { onAdd(name, emoji); setName(""); }}>➕ أضف</Button>
      </div>
      {existing.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="opacity-70">أو ضم عقل جاهز:</span>
          {existing.map((b) => <button key={b.id} onClick={() => onAttach(b.id)} className="rounded-full bg-secondary px-3 py-1">{b.emoji} {b.name}</button>)}
        </div>
      )}
    </section>
  );
}

function BrainCard({ b, onChange }: { b: B; onChange: (p: Partial<B>) => void }) {
  const chat = useServerFn(brainChat);
  const [q, setQ] = useState(""); const [ans, setAns] = useState(""); const [busy, setBusy] = useState(false);
  const toggle = (s: string) => {
    const has = b.scopes.includes(s);
    if (!has && b.scopes.length >= 20) { toast.error("الحد 20 خيار"); return; }
    onChange({ scopes: has ? b.scopes.filter((x) => x !== s) : [...b.scopes, s] });
  };
  const run = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try { const r = await chat({ data: { history: [{ role: "user", content: q }], brainId: b.id } }); setAns(r.reply); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-soft space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-lg text-primary">{b.emoji} {b.name}</h3>
        <button onClick={() => onChange({ in_mother: false })} className="text-xs opacity-60">إخراج</button>
      </div>
      <label className="block text-xs">📚 المكتبة المربوطة
        <Input value={b.library_tag} onChange={(e) => onChange({ library_tag: e.target.value.slice(0, 40) })} placeholder="اسم قسم المكتبة (مثلاً: عطور)" />
      </label>
      <label className="block text-xs">🎙️ الصوت
        <select value={b.voice_name} onChange={(e) => onChange({ voice_name: e.target.value })} className="mt-1 w-full rounded-md border bg-background p-2 text-sm">
          {VOICES.map((v) => <option key={v}>{v}</option>)}
        </select>
      </label>
      <div className="text-xs">💬 وين يرد
        <div className="mt-1 flex flex-wrap gap-1">
          {SCOPES.map(([k, l]) => (
            <button key={k} onClick={() => toggle(k)} className={`rounded-full px-2.5 py-1 ${b.scopes.includes(k) ? "bg-gold font-semibold text-accent-foreground" : "bg-secondary"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جرّب: زبون يسأل عن السعر" />
        <Button onClick={run} disabled={busy}>{busy ? "…" : "▶️ شغّل"}</Button>
      </div>
      {ans && <p className="whitespace-pre-wrap rounded-xl bg-secondary p-3 text-sm">{ans}</p>}
      <p className="text-[11px] opacity-60">استخدم {b.uses} مرة · التشغيل 2 نقطة</p>
    </section>
  );
}

function Library({ storeId, initialTag = "" }: { storeId?: string | undefined; initialTag?: string }) {
  const [rows, setRows] = useState<Row[]>([]); const [count, setCount] = useState(0);
  const [search, setSearch] = useState(""); const [tag, setTag] = useState(initialTag); const [tags, setTags] = useState<string[]>([]);
  const [paste, setPaste] = useState(""); const [newTag, setNewTag] = useState(initialTag || "عام"); const [progress, setProgress] = useState<number | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [extra, setExtra] = useState<string[]>([]);
  const [newSec, setNewSec] = useState("");
  const secKey = `mb_sections_${storeId ?? ""}`;
  useEffect(() => { try { setExtra(JSON.parse(localStorage.getItem(secKey) || "[]")); } catch { setExtra([]); } }, [secKey]);
  const saveExtra = (l: string[]) => { setExtra(l); localStorage.setItem(secKey, JSON.stringify(l)); };

  const load = async () => {
    if (!storeId) return;
    let q = supabase.from("reply_library").select("id, tag, trigger_text, reply_text", { count: "exact" }).eq("store_id", storeId).order("created_at", { ascending: false }).limit(100);
    if (tag) q = q.eq("tag", tag);
    const s = search.trim().replace(/[%_,()]/g, "");
    if (s) q = q.or(`trigger_text.ilike.%${s}%,reply_text.ilike.%${s}%`);
    const { data, count: c } = await q;
    setRows((data ?? []) as Row[]);
    if (!s && !tag) setCount(c ?? 0);
    const { data: t } = await supabase.from("reply_library").select("tag").eq("store_id", storeId).limit(20000);
    const m: Record<string, number> = {};
    (t ?? []).forEach((x) => { m[x.tag] = (m[x.tag] ?? 0) + 1; });
    setCounts(m); setTags(Object.keys(m));
  };
  useEffect(() => { const h = setTimeout(load, 300); return () => clearTimeout(h); }, [storeId, search, tag]);

  const sections = [...new Set([...tags, ...extra])];
  const pick = (s: string) => { setTag(s); if (s) setNewTag(s); };
  const addSection = () => {
    const n = newSec.trim().slice(0, 40); if (!n) return;
    if (sections.includes(n)) { toast.error("القسم موجود"); return; }
    saveExtra([...extra, n]); setNewSec(""); pick(n); toast.success(`انضاف قسم «${n}» 📁`);
  };
  const renameSection = async (s: string) => {
    const n = prompt("الاسم الجديد للقسم", s)?.trim().slice(0, 40);
    if (!n || n === s || !storeId) return;
    const { error } = await supabase.from("reply_library").update({ tag: n }).eq("store_id", storeId).eq("tag", s);
    if (error) { toast.error(error.message); return; }
    saveExtra(extra.map((x) => (x === s ? n : x))); pick(n); toast.success("تغيّر اسم القسم ✏️"); load();
  };
  const deleteSection = async (s: string) => {
    if (!storeId || !confirm(`تحذف قسم «${s}» وكل ردوده (${counts[s] ?? 0})؟`)) return;
    const { error } = await supabase.from("reply_library").delete().eq("store_id", storeId).eq("tag", s);
    if (error) { toast.error(error.message); return; }
    saveExtra(extra.filter((x) => x !== s)); pick(""); toast.success("انحذف القسم 🗑️"); load();
  };
  const exportSection = async (s: string) => {
    if (!storeId) return;
    const all: { trigger_text: string; reply_text: string }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from("reply_library").select("trigger_text, reply_text").eq("store_id", storeId).eq("tag", s).range(from, from + 999);
      all.push(...(data ?? [])); if (!data || data.length < 1000) break;
    }
    if (!all.length) { toast.error("القسم فاضي"); return; }
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([["السؤال", "الرد"], ...all.map((r) => [r.trigger_text, r.reply_text])]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "ردود");
    XLSX.writeFile(wb, `${s}-${all.length}.xlsx`);
  };

  const parse = (text: string) => text.split(/\r?\n/).map((l) => {
    const m = l.split(/\s*(?:\||\t|=>|←|:)\s*/);
    return m.length >= 2 ? { trigger_text: (m[0] ?? "").trim().slice(0, 500), reply_text: m.slice(1).join(" ").trim().slice(0, 2000) } : null;
  }).filter((x): x is { trigger_text: string; reply_text: string } => !!x && !!x.trigger_text && !!x.reply_text);

  const upload = async (text: string) => {
    if (!storeId) return;
    const items = parse(text);
    if (!items.length) { toast.error("اكتب كل سطر: السؤال | الرد"); return; }
    if (count + items.length > MAX_LIB) { toast.error(`الحد ${MAX_LIB.toLocaleString()} سطر`); return; }
    const t = newTag.trim().slice(0, 40) || "عام";
    setProgress(0);
    for (let i = 0; i < items.length; i += 500) {
      const { error } = await supabase.from("reply_library").insert(items.slice(i, i + 500).map((r) => ({ ...r, store_id: storeId, tag: t })));
      if (error) { setProgress(null); toast.error(error.message.includes("full") ? "المكتبة ممتلئة" : error.message); return; }
      setProgress(Math.round(((i + 500) / items.length) * 100));
    }
    setProgress(null); setPaste(""); toast.success(`انحفظ ${items.length.toLocaleString()} رد 📚`); load();
  };
  const onFile = async (f?: File) => { if (f) upload(await f.text()); };
  const del = async (id: string) => { await supabase.from("reply_library").delete().eq("id", id); setRows((p) => p.filter((r) => r.id !== id)); setCount((c) => c - 1); };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-card p-4 shadow-soft space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-primary">📚 مكتبة الردود العملاقة</h3>
          <span className="text-xs">{count.toLocaleString()} / {MAX_LIB.toLocaleString()}</span>
        </div>
        <Progress value={(count / MAX_LIB) * 100} />
        <Textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={5} placeholder={"كل سطر: السؤال | الرد\nكم السعر | السعر 99 ريال والتوصيل مجاني"} />
        <div className="flex flex-wrap gap-2">
          <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="القسم" className="w-32" />
          <Button onClick={() => upload(paste)} disabled={progress !== null}>💾 احفظ</Button>
          <label className="cursor-pointer rounded-md bg-secondary px-3 py-2 text-sm">📂 ملف txt/csv
            <input type="file" accept=".txt,.csv,.tsv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </div>
        {progress !== null && <Progress value={Math.min(progress, 100)} />}
      </section>
      <section className="rounded-2xl border bg-card p-4 shadow-soft space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 ابحث في الردود" className="min-w-40 flex-1" />
          <select value={tag} onChange={(e) => setTag(e.target.value)} className="rounded-md border bg-background p-2 text-sm">
            <option value="">كل الأقسام</option>
            {tags.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <ul className="divide-y text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-2 py-2">
              <div><b>{r.trigger_text}</b> ← {r.reply_text} <span className="mr-1 rounded bg-secondary px-1.5 text-[10px]">{r.tag}</span></div>
              <button onClick={() => del(r.id)} className="text-xs opacity-60">🗑️</button>
            </li>
          ))}
          {!rows.length && <li className="py-4 text-center opacity-60">ما فيه ردود</li>}
        </ul>
        <p className="text-[11px] opacity-60">يعرض أول 100 نتيجة — استخدم البحث للوصول لأي رد.</p>
      </section>
    </div>
  );
}
