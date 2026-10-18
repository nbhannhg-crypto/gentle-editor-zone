import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/* لوحة تحكم الموظفة اللحظية — الطابق الأول والرابع (إضافة فقط) */

export type Route = "speaker" | "ptt" | "text";
export type Cockpit = {
  fast: boolean; route: Route;
  brains: { mine: boolean; queen: boolean; clips: boolean; ai: boolean };
  extra: string[]; persona: string; banned: string[]; fixes: { from: string; to: string }[]; blocked: string[];
  match?: number; secs?: string[]; kbrains?: string[];
};
export const COCKPIT_KEY = "live_cockpit";
export const DEFAULT_COCKPIT: Cockpit = {
  fast: false, route: "speaker", brains: { mine: true, queen: false, clips: true, ai: true },
  extra: [], persona: "", banned: [], fixes: [], blocked: [], match: 0.6, secs: [], kbrains: [],
};
export function loadCockpit(): Cockpit {
  try { const v = JSON.parse(localStorage.getItem(COCKPIT_KEY) ?? "{}"); return { ...DEFAULT_COCKPIT, ...v, brains: { ...DEFAULT_COCKPIT.brains, ...(v.brains ?? {}) } }; }
  catch { return DEFAULT_COCKPIT; }
}
export const EXTRA_BRAINS = [["sales", "عقل المبيعات"], ["price", "عقل الأسعار"], ["objection", "عقل الاعتراضات"], ["ship", "عقل الشحن"]] as const;
export const EXTRA_HINT: Record<string, string> = {
  sales: "ركزي على إغلاق البيع بلطف واقترحي الطلب.",
  price: "دافعي عن السعر بالقيمة والضمان وقدمي عرضاً عند الحاجة.",
  objection: "تعاملي مع الاعتراضات بتفهم ثم حوّليها لميزة.",
  ship: "وضحي مدة الشحن والضمان بثقة.",
};
export const applyFixes = (t: string, c: Cockpit) => c.fixes.reduce((s, f) => (f.from ? s.split(f.from).join(f.to) : s), t);
export const hitBanned = (t: string, c: Cockpit) => c.banned.find((w) => w && t.includes(w));
export const isBlocked = (n: string, c: Cockpit) => { const d = n.replace(/\D/g, ""); return !!d && c.blocked.some((b) => b && d.endsWith(b.replace(/\D/g, ""))); };

type Acc = { name: string; label?: string; status: string; number?: string };

export function LiveCockpit(p: {
  cfg: Cockpit; setCfg: (c: Cockpit) => void; live: boolean; onToggle: () => void;
  accounts: Acc[]; accErr: string; reloadAcc: () => void;
  waFrom: string; setWaFrom: (v: string) => void; waTo: string; setWaTo: (v: string) => void;
  customers: { name: string; phone: string }[];
}) {
  const { cfg } = p;
  const set = (o: Partial<Cockpit>) => p.setCfg({ ...cfg, ...o });
  const [pop, setPop] = useState<"" | "persona" | "banned" | "fixes" | "blocked">("");
  const [draft, setDraft] = useState("");
  const [showExtra, setShowExtra] = useState(false);
  const [search, setSearch] = useState("");
  const [openSearch, setOpenSearch] = useState(false);

  const openPop = (k: typeof pop) => {
    setPop(k);
    setDraft(k === "persona" ? cfg.persona : k === "banned" ? cfg.banned.join("\n") : k === "blocked" ? cfg.blocked.join("\n") : k === "fixes" ? cfg.fixes.map((f) => `${f.from} = ${f.to}`).join("\n") : "");
  };
  const savePop = () => {
    const lines = draft.split("\n").map((l) => l.trim()).filter(Boolean);
    if (pop === "persona") set({ persona: draft.trim() });
    if (pop === "banned") set({ banned: lines });
    if (pop === "blocked") set({ blocked: lines.map((l) => l.replace(/\D/g, "")).filter(Boolean) });
    if (pop === "fixes") set({ fixes: lines.map((l) => { const [a, ...b] = l.split("="); return { from: (a ?? "").trim(), to: b.join("=").trim() }; }).filter((f) => f.from) });
    setPop("");
  };
  const pill = (on: boolean) => `rounded-full px-3 py-1.5 text-xs font-medium transition border ${on ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground hover:bg-secondary"}`;
  const found = search.trim() ? p.customers.filter((c) => c.name.includes(search) || c.phone.includes(search)).slice(0, 6) : p.customers.slice(0, 6);
  const POPS = [["persona", "👗 شخصية الموظفة", cfg.persona ? 1 : 0], ["banned", "🚫 كلمات ممنوعة", cfg.banned.length], ["fixes", "⚠️ تصحيح النطق", cfg.fixes.length], ["blocked", "📞 استثناء أرقام", cfg.blocked.length]] as const;

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-soft lg:col-span-3">
      <h3 className="font-display mb-3 text-lg">🎛️ لوحة تحكم الموظفة اللحظية</h3>

      <div className="flex flex-wrap gap-2">
        <button className={pill(p.live)} onClick={p.onToggle}>{p.live ? "🟢 المكالمة شغّالة" : "⚪ متوقفة — اضغط للتشغيل"}</button>
        <button className={pill(cfg.fast)} onClick={() => set({ fast: !cfg.fast })}>{cfg.fast ? "⚡ رد آلي مباشر" : "🛡️ استشارتي أولاً (3 ثوانٍ)"}</button>
        {([["speaker", "🎙️ صوت وسماعة"], ["ptt", "🚀 فويس واتساب PTT"], ["text", "💬 نص على الشاشة"]] as const).map(([k, l]) => (
          <button key={k} className={pill(cfg.route === k)} onClick={() => set({ route: k })}>{l}</button>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">مصادر الرد (تقدر تشغّل أكثر من واحد):</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {([["mine", "💖 ردودي بس"], ["queen", "🧠 عقل الملكة"], ["clips", "📚 بنك المقاطع الموزونة"], ["ai", "✨ الذكاء الاصطناعي"]] as const).map(([k, l]) => (
          <button key={k} className={pill(cfg.brains[k])} onClick={() => set({ brains: { ...cfg.brains, [k]: !cfg.brains[k] } })}>{cfg.brains[k] ? "✓ " : ""}{l}</button>
        ))}
        <button className={pill(cfg.extra.length > 0)} onClick={() => setShowExtra(!showExtra)}>🧩 دمج عقول إضافية{cfg.extra.length ? ` (${cfg.extra.length})` : ""} ▾</button>
      </div>
      {showExtra && (
        <div className="mt-2 flex flex-wrap gap-2 rounded-xl bg-secondary p-2">
          {EXTRA_BRAINS.map(([k, l]) => {
            const on = cfg.extra.includes(k);
            return <button key={k} className={pill(on)} onClick={() => set({ extra: on ? cfg.extra.filter((x) => x !== k) : [...cfg.extra, k] })}>{on ? "✓ " : ""}{l}</button>;
          })}
          <button className={pill(false)} onClick={() => set({ extra: EXTRA_BRAINS.slice(0, 3).map(([k]) => k) })}>المبيعات + الأسعار + الاعتراضات دفعة وحدة</button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {POPS.map(([k, l, n]) => <Button key={k} size="sm" variant="outline" onClick={() => openPop(k)}>{l}{n ? ` (${n})` : ""}</Button>)}
      </div>

      {pop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" onClick={() => setPop("")}>
          <div className="w-full max-w-md rounded-2xl bg-card p-4 shadow-soft" onClick={(e) => e.stopPropagation()}>
            <h4 className="font-display mb-1">{POPS.find(([k]) => k === pop)?.[1]}</h4>
            <p className="mb-2 text-xs text-muted-foreground">
              {pop === "persona" && "اكتب وصف شخصيتها وأسلوبها — الذكاء يلتزم فيه."}
              {pop === "banned" && "كل كلمة في سطر — أي رد فيه وحدة منها ما تنطقه الموظفة."}
              {pop === "fixes" && "كل سطر: الكلمة = طريقة نطقها. مثل: ريال = ريـال"}
              {pop === "blocked" && "كل رقم في سطر — ما ترسل له الموظفة أي شي."}
            </p>
            <Textarea rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} dir={pop === "blocked" ? "ltr" : "rtl"} />
            <div className="mt-3 flex gap-2"><Button onClick={savePop}>💾 حفظ</Button><Button variant="secondary" onClick={() => setPop("")}>إلغاء</Button></div>
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-2 rounded-xl bg-secondary p-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">حساب الإرسال:</label>
          <select value={p.waFrom} onChange={(e) => p.setWaFrom(e.target.value)} className="w-full rounded-md border bg-background px-2 py-2 text-sm" aria-label="حساب الإرسال">
            <option value="">تلقائي (أول رقم متصل)</option>
            {p.accounts.map((a) => <option key={a.name} value={a.name}>{a.status === "open" ? "🟢" : "🔴"} {a.label || a.name}{a.number ? ` — ${a.number}` : ""}</option>)}
          </select>
          {p.accErr ? (
            <p className="mt-1 text-xs text-destructive">⚠️ ما قدرنا نجيب أرقامك من السيرفر: {p.accErr} <button className="underline" onClick={p.reloadAcc}>إعادة المحاولة</button></p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">{p.accounts.filter((a) => a.status === "open").length} متصل من {p.accounts.length} <button className="underline" onClick={p.reloadAcc}>تحديث</button></p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">رقم العميل المستهدف:</label>
          <div className="flex gap-1">
            <Input value={p.waTo} onChange={(e) => p.setWaTo(e.target.value)} placeholder="9665xxxxxxxx" dir="ltr" />
            <Button variant="outline" onClick={() => setOpenSearch(!openSearch)}>🔍 سجل الزبائن</Button>
          </div>
          {isBlocked(p.waTo, cfg) && <p className="mt-1 text-xs text-destructive">📞 هذا الرقم مستثنى — ما راح ينرسل له.</p>}
        </div>
        {openSearch && (
          <div className="sm:col-span-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالاسم أو الرقم" />
            {found.map((c) => (
              <button key={c.phone} onClick={() => { p.setWaTo(c.phone); setOpenSearch(false); setSearch(""); }} className="mt-1 block w-full rounded-lg bg-background px-3 py-1 text-right text-sm">{c.name} — <span dir="ltr">{c.phone}</span></button>
            ))}
            {!found.length && <p className="mt-1 text-xs text-muted-foreground">ما فيه زبائن.</p>}
          </div>
        )}
      </div>
    </section>
  );
}
