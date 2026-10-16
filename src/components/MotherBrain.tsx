import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { loadSections, saveSections } from "@/lib/sections-cloud";
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
  const [libTag, setLibTag] = useState("");
  const load = async () => {
    if (!storeId) return;
    const { data } = await supabase.from("brains").select("*").eq("store_id", storeId).order("created_at");
    setBrains((data ?? []) as B[]);
  };
  useEffect(() => { load(); }, [storeId]);
  const [secCounts, setSecCounts] = useState<Record<string, number>>({});
  const [secs, setSecs] = useState<string[]>([]);
  const [rulesCount, setRulesCount] = useState(0);
  useEffect(() => {
    if (!storeId || view !== "brains") return;
    (async () => {
      const m: Record<string, number> = {};
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from("reply_library").select("tag").eq("store_id", storeId).range(from, from + 999);
        (data ?? []).forEach((x) => { m[x.tag] = (m[x.tag] ?? 0) + 1; });
        if (!data || data.length < 1000) break;
      }
      let extra: string[] = [];
      try { extra = await loadSections(storeId); } catch { /* ignore */ }
      setSecCounts(m); setSecs([...new Set([...Object.keys(m), ...extra])]);
      const { count } = await supabase.from("training_rules").select("id", { count: "exact", head: true }).eq("store_id", storeId).or(GENERAL_OR);
      setRulesCount(count ?? 0);
    })();
  }, [storeId, view]);
  const inner = brains.filter((b) => b.in_mother);

  const addBrain = async (name: string, emoji: string) => {
    if (!storeId || !name.trim()) return;
    if (inner.length >= MAX_BRAINS) { toast.error("الحد 10 عقول داخل العقل الأم"); return; }
    const { error } = await supabase.from("brains").insert({ store_id: storeId, name: name.slice(0, 60), emoji: emoji || "🧠", specialty: "عقل داخلي", source: "both", instructions: `أنت ${name}، ترد باللهجة السعودية باحتراف.`, knowledge: "", in_mother: true, scopes: ["sender"], voice_name: VOICES[0]!, library_tag: name.trim().slice(0, 40) } as any);
    if (error) { toast.error(error.message); return; }
    try { const l = await loadSections(storeId); await saveSections(storeId, [...l, name.trim().slice(0, 40)]); } catch { /* ignore */ }
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
            {inner.map((b) => <BrainCard key={b.id} b={b} sections={secs} counts={secCounts} rulesCount={rulesCount} onChange={(p) => update(b.id, p)} onOpenLib={(t) => { setLibTag(t); setView("library"); }} />)}
          </div>
          {!inner.length && <p className="rounded-xl bg-secondary p-4 text-center text-sm">ما فيه عقول داخل العقل الأم — أضف أول عقل (مبيعات، ردود، تصميم…)</p>}
        </>
      ) : <Library key={libTag} storeId={storeId} initialTag={libTag} />}
    </div>
  );
}

function QuickAdd({ b, onChange, onOpenLib }: { b: B; onChange: (p: Partial<B>) => void; onOpenLib: (tag: string) => void }) {
  const [open, setOpen] = useState(false); const [k, setK] = useState(""); const [r, setR] = useState(""); const [busy, setBusy] = useState(false);
  const tag = b.library_tag || b.name.slice(0, 40);
  const save = async () => {
    if (!k.trim() || !r.trim()) { toast.error("اكتب السؤال والرد"); return; }
    setBusy(true);
    const { data: br } = await supabase.from("brains").select("store_id").eq("id", b.id).single();
    const { error } = await supabase.from("reply_library").insert({ store_id: (br as any)?.store_id, tag, trigger_text: k.trim().slice(0, 500), reply_text: r.trim().slice(0, 2000) } as any);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (!b.library_tag) onChange({ library_tag: tag });
    toast.success("✅ انضاف الرد للعقل"); setK(""); setR("");
  };
  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-2">
        <button onClick={() => setOpen(!open)} className="rounded-full bg-secondary px-3 py-1">➕ أضف رد لهذا العقل</button>
        <button onClick={() => { if (!b.library_tag) onChange({ library_tag: tag }); onOpenLib(tag); }} className="rounded-full bg-secondary px-3 py-1">📥 استيراد إكسل لهذا العقل</button>
      </div>
      {open && <div className="space-y-1">
        <Input value={k} onChange={(e) => setK(e.target.value)} placeholder="سؤال الزبون" />
        <Input value={r} onChange={(e) => setR(e.target.value)} placeholder="الرد" />
        <Button size="sm" disabled={busy} onClick={save}>حفظ</Button>
      </div>}
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

function BrainCard({ b, onChange, onOpenLib, sections, counts, rulesCount }: { b: B; onChange: (p: Partial<B>) => void; onOpenLib: (tag: string) => void; sections: string[]; counts: Record<string, number>; rulesCount: number }) {
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
      <div className="rounded-xl bg-secondary/60 p-2 text-xs">
        <label className="block">📁 اربط العقل بقسم:
          <select value={b.library_tag} onChange={(e) => { onChange({ library_tag: e.target.value }); toast.success(e.target.value ? "✅ انربط العقل بالقسم" : "انفك الربط"); }} className="mt-1 w-full rounded-md border bg-background p-2 text-sm">
            <option value="">— ما تحدد —</option>
            <option value="__rules__">📘 قواعد المتجر (علّم الموظفة) — {rulesCount.toLocaleString()} رد</option>
            {[...new Set([...sections, ...(b.library_tag && b.library_tag !== "__rules__" ? [b.library_tag] : [])])].map((s) => <option key={s} value={s}>📁 {s} — {(counts[s] ?? 0).toLocaleString()} رد</option>)}
          </select>
        </label>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span>{b.library_tag ? <>مربوط بـ <b>{b.library_tag === "__rules__" ? "قواعد المتجر" : b.library_tag}</b> · {(b.library_tag === "__rules__" ? rulesCount : counts[b.library_tag] ?? 0).toLocaleString()} رد</> : "غير مربوط"}</span>
          {b.library_tag !== "__rules__" && <button onClick={() => { const t = b.library_tag || b.name.slice(0, 40); if (!b.library_tag) onChange({ library_tag: t }); onOpenLib(t); }} className="rounded-full bg-gold px-3 py-1 font-semibold text-accent-foreground">{b.library_tag ? "📚 افتح ردوده" : "➕ أنشئ قسمه"}</button>}
        </div>
        {b.library_tag !== "__rules__" && <QuickAdd b={b} onChange={onChange} onOpenLib={onOpenLib} />}
      </div>
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
  useEffect(() => { setExtra([]); if (storeId) loadSections(storeId).then(setExtra).catch(() => {}); }, [storeId]);
  const saveExtra = (l: string[]) => { setExtra(l); if (storeId) saveSections(storeId, l).catch((e) => toast.error("ما انحفظ القسم: " + (e as Error).message)); };

  const load = async () => {
    if (!storeId) return;
    let q = supabase.from("reply_library").select("id, tag, trigger_text, reply_text", { count: "exact" }).eq("store_id", storeId).order("created_at", { ascending: false }).limit(100);
    if (tag) q = q.eq("tag", tag);
    const s = search.trim().replace(/[%_,()]/g, "");
    if (s) q = q.or(`trigger_text.ilike.%${s}%,reply_text.ilike.%${s}%`);
    const { data, count: c } = await q;
    let shown = (data ?? []) as Row[];
    // Also show replies of the chosen section saved in store rules (category = section name)
    if (tag) {
      let q2 = supabase.from("training_rules").select("id, category, trigger_text, response_text").eq("store_id", storeId).eq("category", tag).order("created_at", { ascending: false }).limit(100);
      if (s) q2 = q2.or(`trigger_text.ilike.%${s}%,response_text.ilike.%${s}%`);
      const { data: d2 } = await q2;
      shown = [...shown, ...((d2 ?? []) as any[]).map((r) => ({ id: r.id, tag: r.category, trigger_text: r.trigger_text, reply_text: r.response_text, _rule: true } as any))];
    }
    setRows(shown);
    if (!s && !tag) setCount(c ?? 0);
    const { data: t } = await supabase.from("reply_library").select("tag").eq("store_id", storeId).limit(20000);
    const m: Record<string, number> = {};
    (t ?? []).forEach((x) => { m[x.tag] = (m[x.tag] ?? 0) + 1; });
    // Exact library counts per section (no 20k cap) + replies saved in store rules under the section name
    try {
      const secs = [...new Set([...Object.keys(m), ...extra, ...(tag ? [tag] : [])])];
      let ruleTotal = 0;
      await Promise.all(secs.map(async (sec) => {
        const [{ count: lc }, { count: rc }] = await Promise.all([
          supabase.from("reply_library").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("tag", sec),
          supabase.from("training_rules").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("category", sec),
        ]);
        ruleTotal += rc ?? 0;
        const n = (lc ?? 0) + (rc ?? 0);
        if (n) m[sec] = n;
      }));
      if (!s && !tag) setCount((c ?? 0) + ruleTotal);
    } catch { /* keep library counts */ }
    // Also count replies saved in the WhatsApp cloud copies of this store's sections (read-only)
    try {
      const pre = "k" + storeId.replace(/-/g, "").slice(0, 10);
      const snap: Record<string, Record<string, number>> = {};
      for (let from = 0; ; from += 50) {
        const { data: sr } = await supabase.from("training_rules").select("trigger_text, response_text").like("trigger_text", `__wa_settings__:lib:${pre}%`).range(from, from + 49);
        (sr ?? []).forEach((r: any) => {
          const inst = String(r.trigger_text).split("#")[0]!;
          try { const o = JSON.parse(r.response_text || "{}"); for (const [k, v] of Object.entries(o)) { if (!k.startsWith("lib:") || !Array.isArray(v)) continue; const s = k.slice(4); (snap[inst] ??= {})[s] = (snap[inst][s] ?? 0) + v.length; } } catch { /* skip */ }
        });
        if (!sr || sr.length < 50) break;
      }
      for (const per of Object.values(snap)) for (const [s, n] of Object.entries(per)) if ((m[s] ?? 0) < n) m[s] = n;
    } catch { /* keep library counts */ }
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
    const t = newTag.trim().slice(0, 40) || "عام";
    setProgress(0);
    let overflow = false; let moved = 0;
    for (let i = 0; i < items.length; i += 500) {
      const chunk = items.slice(i, i + 500);
      let error = overflow ? { message: "library full" } as { message: string } : (await supabase.from("reply_library").insert(chunk.map((r) => ({ ...r, store_id: storeId, tag: t })))).error;
      // When the old DB cap blocks the library, save the rest into store rules (no cap there)
      if (error && /library full/i.test(error.message)) {
        overflow = true;
        ({ error } = await supabase.from("training_rules").insert(chunk.map((r) => ({ trigger_text: r.trigger_text, response_text: r.reply_text, category: t, store_id: storeId }))));
        if (!error) moved += chunk.length;
      }
      if (error) { setProgress(null); toast.error(`ما انرفع (انحفظ ${i.toLocaleString()} من ${items.length.toLocaleString()}): ${error.message}`); load(); return; }
      setProgress(Math.round(((i + 500) / items.length) * 100));
    }
    if (moved) toast.success(`${moved.toLocaleString()} رد انحفظ في قواعد المتجر (المكتبة وصلت سقفها القديم)`);
    setProgress(null); setPaste(""); toast.success(`انحفظ ${items.length.toLocaleString()} رد 📚`); load();
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    if (/\.xlsx?$/i.test(f.name)) {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer());
      const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0] ?? ""]!, { header: 1 });
      upload(rows.filter((r) => r[0] && r[1] && !/^(السؤال|سؤال|question)$/i.test(String(r[0]).trim())).map((r) => `${String(r[0]).replace(/\|/g, " ")} | ${String(r[1])}`).join("\n"));
    } else upload(await f.text());
  };
  const del = async (id: string) => { const isRule = (rows.find((x) => x.id === id) as any)?._rule; await (isRule ? supabase.from("training_rules").delete().eq("id", id) : supabase.from("reply_library").delete().eq("id", id)); setRows((p) => p.filter((r) => r.id !== id)); setCount((c) => c - 1); };
  const editRow = async (r: Row) => {
    const q = prompt("السؤال", r.trigger_text)?.trim(); if (q === undefined || !q) return;
    const a = prompt("الرد", r.reply_text)?.trim(); if (a === undefined || !a) return;
    const { error } = (r as any)._rule ? await supabase.from("training_rules").update({ trigger_text: q.slice(0, 500), response_text: a.slice(0, 2000) }).eq("id", r.id) : await supabase.from("reply_library").update({ trigger_text: q.slice(0, 500), reply_text: a.slice(0, 2000) }).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    setRows((p) => p.map((x) => (x.id === r.id ? { ...x, trigger_text: q, reply_text: a } : x))); toast.success("تعدّلت القاعدة ✏️");
  };
  // Remove duplicate questions in a section (or all sections), keeping the newest copy
  const dedupe = async (s?: string) => {
    if (!storeId || !confirm(`تحذف المكرر من ${s ? `قسم «${s}»` : "كل الأقسام"}؟ (تبقى نسخة وحدة من كل سؤال)`)) return;
    const all: { id: string; tag: string; trigger_text: string }[] = [];
    for (let from = 0; ; from += 1000) {
      let q = supabase.from("reply_library").select("id, tag, trigger_text").eq("store_id", storeId).order("created_at", { ascending: false }).range(from, from + 999);
      if (s) q = q.eq("tag", s);
      const { data } = await q; all.push(...((data ?? []) as any[])); if (!data || data.length < 1000) break;
    }
    const seen = new Set<string>(); const ids: string[] = [];
    for (const r of all) { const k = r.tag + "|" + r.trigger_text.replace(/\s+/g, " ").trim().toLowerCase(); if (seen.has(k)) ids.push(r.id); else seen.add(k); }
    if (!ids.length) { toast.success("ما فيه مكرر ✅"); return; }
    for (let i = 0; i < ids.length; i += 200) await supabase.from("reply_library").delete().in("id", ids.slice(i, i + 200));
    toast.success(`انحذف ${ids.length.toLocaleString()} مكرر 🧹`); load();
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-card p-4 shadow-soft space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-primary">📁 أقسام العقل الأم ({sections.length} قسم)</h3>
          <div className="flex gap-1">
            <button onClick={() => dedupe()} className="rounded-full bg-secondary px-3 py-1 text-xs">🧹 حذف المكرر للكل</button>
            <button onClick={() => pick("")} className={`rounded-full px-3 py-1 text-xs ${!tag ? "bg-gold font-semibold text-accent-foreground" : "bg-secondary"}`}>كل الردود</button>
          </div>
        </div>
        <div className="flex gap-2">
          <Input value={newSec} onChange={(e) => setNewSec(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSection()} placeholder="اسم القسم: الترحيب، الأسعار والشحن، الاعتراضات…" className="flex-1" />
          <Button onClick={addSection}>➕ أنشئ قسم</Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {sections.map((s) => (
            <div key={s} className={`rounded-xl border p-3 ${tag === s ? "border-primary bg-secondary" : "bg-background"}`}>
              <button onClick={() => pick(s)} className="w-full text-right">
                <b>📁 {s}</b> <span className="text-xs opacity-70">— {(counts[s] ?? 0).toLocaleString()} رد</span>
              </button>
              <div className="mt-2 flex flex-wrap gap-1 text-xs">
                <button onClick={() => pick(s)} className="rounded-full bg-secondary px-2 py-0.5">📚 الردود</button>
                <button onClick={() => exportSection(s)} className="rounded-full bg-secondary px-2 py-0.5">📤 Excel</button>
                <button onClick={() => dedupe(s)} className="rounded-full bg-secondary px-2 py-0.5">🧹 حذف المكرر</button>
                <button onClick={() => renameSection(s)} className="rounded-full bg-secondary px-2 py-0.5">✏️</button>
                <button onClick={() => deleteSection(s)} className="rounded-full bg-secondary px-2 py-0.5">🗑️</button>
              </div>
            </div>
          ))}
          {!sections.length && <p className="text-sm opacity-60">ما فيه أقسام — أنشئ أول قسم.</p>}
        </div>
      </section>
      <section className="rounded-2xl border bg-card p-4 shadow-soft space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-primary">📚 {tag ? `ردود قسم «${tag}»` : "مكتبة الردود العملاقة"}</h3>
          <span className="text-xs">{count.toLocaleString()} رد · بدون حد</span>
        </div>
        <Progress value={100} />
        <Textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={5} placeholder={"كل سطر: السؤال | الرد\nكم السعر | السعر 99 ريال والتوصيل مجاني"} />
        <div className="flex flex-wrap gap-2">
          <select value={newTag} onChange={(e) => setNewTag(e.target.value)} className="rounded-md border bg-background p-2 text-sm">
            {[...new Set(["عام", ...sections])].map((s) => <option key={s}>{s}</option>)}
          </select>
          <Button onClick={() => upload(paste)} disabled={progress !== null}>💾 احفظ في القسم</Button>
          <label className="cursor-pointer rounded-md bg-secondary px-3 py-2 text-sm">📂 ملف Excel/csv/txt
            <input type="file" accept=".txt,.csv,.tsv,.xlsx,.xls" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </div>
        {progress !== null && <Progress value={Math.min(progress, 100)} />}
      </section>
      <section className="rounded-2xl border bg-card p-4 shadow-soft space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 ابحث في الردود" className="min-w-40 flex-1" />
          <select value={tag} onChange={(e) => pick(e.target.value)} className="rounded-md border bg-background p-2 text-sm">
            <option value="">كل الأقسام</option>
            {sections.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <ul className="divide-y text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-2 py-2">
              <div><b>{r.trigger_text}</b> ← {r.reply_text} <span className="mr-1 rounded bg-secondary px-1.5 text-[10px]">{r.tag}</span></div>
              <span className="flex shrink-0 gap-2"><button onClick={() => editRow(r)} className="text-xs opacity-60">✏️</button><button onClick={() => del(r.id)} className="text-xs opacity-60">🗑️</button></span>
            </li>
          ))}
          {!rows.length && <li className="py-4 text-center opacity-60">ما فيه ردود</li>}
        </ul>
        <p className="text-[11px] opacity-60">يعرض أول 100 نتيجة — استخدم البحث للوصول لأي رد.</p>
      </section>
    </div>
  );
}
