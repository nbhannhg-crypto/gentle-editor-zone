import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { M_ALL, M_CORE, M_SECTIONS, M_SOURCE, M_STATUS, publicCardText } from "@/lib/marriage";
import { parseMarriageText } from "@/lib/marriage.functions";

type KD = { name?: string; age?: string; city?: string; pCity?: string; nationality?: string; pNationality?: string; type?: string; marital?: string; pMarital?: string; pAge?: string; phone?: string };
type Row = { id: string; code: string; gender: string; data: Record<string, string> & KD; status: string; notes: string; created_at: string };

export function MarriageForms({ storeId, admin }: { storeId?: string | undefined; admin?: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [g, setG] = useState("all");
  const [st, setSt] = useState("all");
  const [open, setOpen] = useState<Row | null>(null);
  const [card, setCard] = useState<Row | null>(null);
  const [all, setAll] = useState(false);
  const [paste, setPaste] = useState("");
  const [parsed, setParsed] = useState<{ gender: string; fields: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const runParse = async () => {
    if (paste.trim().length < 5) { toast.error("الصق رسالة العميل أول"); return; }
    setBusy(true);
    try {
      const r = await parseMarriageText({ data: { text: paste } });
      if (r.error) toast.error(r.error); else { setParsed({ gender: r.gender, fields: r.fields }); toast.success("تم الفرز، راجع البيانات واحفظ"); }
    } catch { toast.error("تعذر الفرز"); } finally { setBusy(false); }
  };
  const saveParsed = async () => {
    if (!parsed || !storeId) return;
    const { data: code, error } = await supabase.rpc("submit_marriage_form", { _store: storeId, _gender: parsed.gender, _data: { ...parsed.fields, source: "لصق من محادثة" } });
    if (error) { toast.error("ما انحفظ"); return; }
    toast.success(`انحفظ الطلب ${code ?? ""} 💍`); setParsed(null); setPaste(""); void load();
  };
  const link = typeof window !== "undefined" && storeId ? `${window.location.origin}/m/${storeId}` : "";

  const load = async () => {
    let qq = supabase.from("marriage_forms").select("*").order("created_at", { ascending: false }).limit(500);
    if (!(admin && all) && storeId) qq = qq.eq("store_id", storeId);
    const { data, error } = await qq;
    if (error) toast.error("تعذر جلب الطلبات"); else setRows((data ?? []) as unknown as Row[]);
  };
  useEffect(() => { void load(); }, [storeId, all]);

  const list = useMemo(() => rows.filter((r) => (g === "all" || r.gender === g) && (st === "all" || r.status === st) &&
    (!q || [r.code, ...Object.values(r.data ?? {})].join(" ").includes(q))), [rows, q, g, st]);

  const upd = async (r: Row, patch: Partial<Row>) => {
    const { error } = await supabase.from("marriage_forms").update(patch).eq("id", r.id);
    if (error) { toast.error("ما انحفظ"); return; }
    setRows((p) => p.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
    if (open?.id === r.id) setOpen({ ...r, ...patch });
  };
  const del = async (r: Row) => {
    if (!confirm(`حذف الطلب ${r.code}؟`)) return;
    const { error } = await supabase.from("marriage_forms").delete().eq("id", r.id);
    if (error) { toast.error("ما انحذف"); return; }
    setRows((p) => p.filter((x) => x.id !== r.id)); setOpen(null);
  };
  const matches = (r: Row) => rows.filter((x) => x.gender !== r.gender && x.status !== "archived").map((x) => {
    let s = 0; const a = r.data, b = x.data;
    if (a.pCity && b.city?.includes(a.pCity)) s += 30; else if (a.city && b.city && a.city === b.city) s += 20;
    if (a.pNationality && b.nationality?.includes(a.pNationality)) s += 20;
    if (a.type && b.type === a.type) s += 20;
    if (a.pMarital && b.marital?.includes(a.pMarital.slice(0, 3))) s += 15;
    const ar = (a.pAge ?? "").match(/\d+/g)?.map(Number); const age = Number(b.age);
    if (ar && age) s += (ar.length > 1 ? age >= (ar[0] ?? 0) && age <= (ar[1] ?? 99) : Math.abs(age - (ar[0] ?? 0)) <= 3) ? 15 : 0;
    return { x, s };
  }).filter((m) => m.s > 0).sort((p, q2) => q2.s - p.s).slice(0, 5);

  const copy = (t: string) => { void navigator.clipboard.writeText(t); toast.success("تم النسخ"); };
  const wa = (r: Row) => { const p = (r.data.phone ?? "").replace(/\D/g, ""); if (p) window.open(`https://wa.me/${p}?text=${encodeURIComponent(`هلا والله، معك خطابة بخصوص طلبك رقم ${r.code} 🤍`)}`, "_blank"); };

  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-royal p-5 text-primary-foreground shadow-soft">
        <h2 className="font-display text-xl">💍 استمارات الزواج والخطابة</h2>
        <p className="mt-1 text-sm opacity-90">حط الرابط في بايو تيك توك وسناب، والطلبات توصلك هنا بسرية تامة.</p>
        {link && <div className="mt-3 flex flex-wrap gap-2">
          <code className="min-w-0 flex-1 truncate rounded-xl bg-primary-foreground/10 px-3 py-2 text-xs" dir="ltr">{link}</code>
          <button onClick={() => copy(link)} className="rounded-xl bg-gold px-3 py-2 text-sm font-semibold text-accent-foreground">📋 نسخ الرابط</button>
          <a href={link} target="_blank" rel="noreferrer" className="rounded-xl border border-primary-foreground/30 px-3 py-2 text-sm">👁️ معاينة</a>
        </div>}
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["كل الطلبات", rows.length], ["عرسان", rows.filter((r) => r.gender === "male").length], ["عرائس", rows.filter((r) => r.gender === "female").length], ["جديد", rows.filter((r) => r.status === "new").length]].map(([l, n]) => (
          <div key={l as string} className="rounded-2xl border bg-card p-3 text-center"><b className="text-2xl text-primary">{n}</b><div className="text-xs text-muted-foreground">{l}</div></div>
        ))}
      </div>

      <details className="rounded-2xl border bg-card p-3">
        <summary className="cursor-pointer font-semibold">📥 لصق وفرز رسالة عميل (للي يخافون من الروابط)</summary>
        <p className="mt-1 text-xs text-muted-foreground">الصق كلام العميل كامل مثل ما أرسله بالواتساب أو تيك توك، والنظام يرتبه في الاستمارة.</p>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={5} placeholder="مثال: السلام عليكم انا عريس عمري 30 من الرياض موظف أبي زوجة من 22 إلى 28..." className="mt-2 w-full rounded-xl border bg-background p-2 text-sm" />
        <button disabled={busy} onClick={() => void runParse()} className="mt-2 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60">{busy ? "⏳ جاري الفرز..." : "✨ فرز تلقائي"}</button>
        {parsed && <div className="mt-3 space-y-2 rounded-xl border p-2">
          <select value={parsed.gender} onChange={(e) => setParsed({ ...parsed, gender: e.target.value })} className="rounded-lg border bg-background p-2 text-sm"><option value="male">🤵 عريس</option><option value="female">👰 عروس</option></select>
          {(() => {
            const has = M_CORE.filter((k) => parsed.fields[k]?.trim());
            const miss = M_CORE.filter((k) => !parsed.fields[k]?.trim());
            const lbl = (k: string) => M_ALL.find((f) => f.k === k)?.l ?? k;
            const ask = `هلا والله 🤍 وصلتني بياناتك وشكراً لك، باقي نكمل هذي المعلومات عشان نخدمك صح:\n${miss.map((k, i) => `${i + 1}- ${lbl(k)}`).join("\n")}\nوبياناتك بسرية تامة 🔒`;
            return <div className="space-y-2 rounded-xl bg-secondary p-2 text-xs">
              <div><b className="text-primary">🟢 الموجود ({has.length}/{M_CORE.length}):</b> <span className="flex flex-wrap gap-1 pt-1">{has.map((k) => <span key={k} className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5">{lbl(k)}</span>)}{!has.length && "ولا شي"}</span></div>
              <div><b className="text-destructive">🟡 الناقص ({miss.length}):</b> <span className="flex flex-wrap gap-1 pt-1">{miss.map((k) => <span key={k} className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5">{lbl(k)}</span>)}{!miss.length && "مكتمل ✅"}</span></div>
              {miss.length > 0 && <button onClick={() => copy(ask)} className="rounded-lg bg-primary px-3 py-1.5 text-primary-foreground">📋 نسخ رسالة النواقص للعميل</button>}
            </div>;
          })()}
          <div className="rounded-xl border border-gold p-2"><b className="text-xs">🧭 الخطابة والمصدر (داخلي — ما يظهر للعميل)</b>
            {M_SOURCE.map((f) => (
              <label key={f.k} className="mt-1 block text-xs"><span className="text-muted-foreground">{f.l}</span>
                {f.opts ? <select value={parsed.fields[f.k] ?? ""} onChange={(e) => setParsed({ ...parsed, fields: { ...parsed.fields, [f.k]: e.target.value } })} className="mt-0.5 w-full rounded-lg border bg-background p-1.5 text-sm"><option value="">—</option>{f.opts.map((o) => <option key={o}>{o}</option>)}</select>
                : <input value={parsed.fields[f.k] ?? ""} placeholder={f.ph} onChange={(e) => setParsed({ ...parsed, fields: { ...parsed.fields, [f.k]: e.target.value } })} className="mt-0.5 w-full rounded-lg border bg-background p-1.5 text-sm" />}
              </label>
            ))}
          </div>
          {M_ALL.filter((f) => f.k !== "phone2").map((f) => (
            <label key={f.k} className="block text-xs"><span className="text-muted-foreground">{f.l}</span>
              <input value={parsed.fields[f.k] ?? ""} onChange={(e) => setParsed({ ...parsed, fields: { ...parsed.fields, [f.k]: e.target.value } })} className="mt-0.5 w-full rounded-lg border bg-background p-1.5 text-sm" />
            </label>
          ))}
          <div className="flex gap-2"><button onClick={() => void saveParsed()} className="flex-1 rounded-xl bg-gold py-2 text-sm font-semibold text-accent-foreground">💾 حفظ كطلب جديد</button><button onClick={() => setParsed(null)} className="rounded-xl border px-3 text-sm">إلغاء</button></div>
        </div>}
      </details>

      <div className="rounded-2xl border bg-card p-3 text-sm">
        <b>💬 التسجيل بالواتساب بدون رابط</b>
        <p className="mt-1 text-xs text-muted-foreground">إذا كتب العميل لرقم الواتساب المربوط كلمة «تسجيل» أو «خطابة» أو «استمارة»، يسأله النظام سؤال سؤال، وأول ما يخلص ينحفظ طلبه هنا تلقائي ويوصله رقم طلبه. يكتب «تخطي» لأي سؤال أو «الغاء» للإيقاف.</p>
        <button onClick={() => copy("للتسجيل بسرية وبدون روابط، اكتب لنا بالواتساب كلمة: تسجيل 🤍")} className="mt-2 rounded-xl border px-3 py-1.5 text-xs">📋 نسخ رسالة دعوة العميل</button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 بحث بالكود أو المدينة أو أي كلمة" className="min-w-0 flex-1 rounded-xl border bg-background p-2.5 text-sm" />
        <select value={g} onChange={(e) => setG(e.target.value)} className="rounded-xl border bg-background p-2 text-sm"><option value="all">الكل</option><option value="male">🤵 عرسان</option><option value="female">👰 عرائس</option></select>
        <select value={st} onChange={(e) => setSt(e.target.value)} className="rounded-xl border bg-background p-2 text-sm"><option value="all">كل الحالات</option>{M_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {admin && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> 👑 كل المتاجر</label>}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((r) => (
          <button key={r.id} onClick={() => setOpen(r)} className="rounded-2xl border bg-card p-3 text-right shadow-soft transition hover:border-primary">
            <div className="flex items-center justify-between gap-2"><b>{r.gender === "female" ? "👰" : "🤵"} {r.code}</b><span className="text-[11px] text-muted-foreground">{M_STATUS.find((s) => s[0] === r.status)?.[1]}</span></div>
            <div className="mt-1 text-sm">{r.data.name} • {r.data.age} سنة • {r.data.city}</div>
            <div className="text-xs text-muted-foreground">{r.data.marital} {r.data.type && `• ${r.data.type}`} • {new Date(r.created_at).toLocaleDateString("ar")}</div>
            {(r.data.broker || r.data.brokerHandle || r.data.brokerPlatform) && <div className="mt-1 inline-block rounded-full bg-gold/20 px-2 py-0.5 text-[11px]">🧭 {[r.data.broker, r.data.brokerHandle, r.data.brokerPlatform].filter(Boolean).join(" • ")}</div>}
          </button>
        ))}
        {!list.length && <p className="col-span-full rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">ما فيه طلبات للحين. انسخ الرابط وحطه في حساباتك.</p>}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-2 sm:items-center" onClick={() => setOpen(null)}>
          <div dir="rtl" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-background p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="font-display text-lg">{open.gender === "female" ? "👰" : "🤵"} طلب {open.code}</h3><button onClick={() => setOpen(null)} className="text-xl">✕</button></div>
            <div className="mt-2 flex flex-wrap gap-1.5">{M_STATUS.map(([k, l]) => <button key={k} onClick={() => void upd(open, { status: k })} className={`rounded-full border px-2.5 py-1 text-xs ${open.status === k ? "border-primary bg-primary text-primary-foreground" : ""}`}>{l}</button>)}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => wa(open)} className="rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground">💬 واتساب</button>
              <a href={`tel:${open.data.phone ?? ""}`} className="rounded-xl border px-3 py-2 text-sm">📞 اتصال</a>
              <button onClick={() => setCard(open)} className="rounded-xl bg-gold px-3 py-2 text-sm text-accent-foreground">🪪 كرت للنشر</button>
              <button onClick={() => void del(open)} className="rounded-xl border border-destructive px-3 py-2 text-sm text-destructive">🗑️ حذف</button>
            </div>
            {M_SECTIONS.map((s) => (
              <div key={s.t} className="mt-3 rounded-2xl border p-3"><b className="text-sm text-primary">{s.t}</b>
                {s.fields.filter((f) => open.data[f.k]).map((f) => <div key={f.k} className="mt-1 text-sm"><span className="text-muted-foreground">{f.private ? "🔒 " : ""}{f.l}:</span> {open.data[f.k]}</div>)}
              </div>
            ))}
            <div className="mt-3 rounded-2xl border border-gold p-3"><b className="text-sm text-primary">🧭 الخطابة والمصدر (داخلي)</b>
              {M_SOURCE.map((f) => <label key={f.k} className="mt-1 block text-xs"><span className="text-muted-foreground">{f.l}</span>
                <input key={open.id + f.k} defaultValue={open.data[f.k] ?? ""} placeholder={f.ph ?? f.opts?.join(" / ")} onBlur={(e) => e.target.value !== (open.data[f.k] ?? "") && void upd(open, { data: { ...open.data, [f.k]: e.target.value } })} className="mt-0.5 w-full rounded-lg border bg-background p-1.5 text-sm" /></label>)}
            </div>
            <textarea defaultValue={open.notes} onBlur={(e) => e.target.value !== open.notes && void upd(open, { notes: e.target.value })} placeholder="📝 ملاحظاتك الخاصة (تنحفظ تلقائي)" rows={2} className="mt-3 w-full rounded-xl border bg-background p-2 text-sm" />
            <div className="mt-3 rounded-2xl border p-3"><b className="text-sm">💞 مطابقات مقترحة</b>
              {matches(open).map(({ x, s }) => <button key={x.id} onClick={() => setOpen(x)} className="mt-1 flex w-full justify-between rounded-xl bg-secondary p-2 text-sm"><span>{x.code} • {x.data.age} • {x.data.city}</span><b className="text-primary">{s}%</b></button>)}
              {!matches(open).length && <p className="mt-1 text-xs text-muted-foreground">ما فيه مطابقة واضحة للحين.</p>}
            </div>
          </div>
        </div>
      )}

      {card && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/50 p-3" onClick={() => setCard(null)}>
          <div dir="rtl" className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="rounded-3xl border-4 border-gold bg-royal p-5 text-primary-foreground shadow-soft">
              <div className="text-center text-3xl">👑</div>
              <h3 className="text-center font-display text-xl">{card.gender === "female" ? "عروس للزواج" : "عريس للزواج"}</h3>
              <div className="mx-auto mt-1 w-fit rounded-full bg-gold px-4 py-1 text-sm font-bold text-accent-foreground">#{card.code}</div>
              <div className="mt-3 space-y-1 rounded-2xl bg-primary-foreground/10 p-3 text-sm">
                {M_ALL.filter((f) => !f.private && card.data[f.k] && !f.long).slice(0, 14).map((f) => <div key={f.k}><span className="opacity-75">{f.l}:</span> {card.data[f.k]}</div>)}
              </div>
              <p className="mt-3 text-center text-xs opacity-90">🔒 البيانات الخاصة محجوبة • للتواصل أرسل الكود على الواتساب</p>
            </div>
            <div className="mt-2 flex gap-2">
              <button onClick={() => copy(publicCardText(card.code, card.gender, card.data))} className="flex-1 rounded-xl bg-primary py-2 text-sm text-primary-foreground">📋 نسخ نص النشر</button>
              <button onClick={() => setCard(null)} className="rounded-xl bg-background px-4 py-2 text-sm">إغلاق</button>
            </div>
            <p className="mt-1 text-center text-[11px] text-primary-foreground">صوّر الشاشة لحفظ الكرت كصورة</p>
          </div>
        </div>
      )}
    </div>
  );
}
