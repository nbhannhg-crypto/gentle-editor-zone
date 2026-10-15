import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { kingdomTest } from "@/lib/kingdom-brains.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QueenMerchantBrains } from "@/components/QueenMerchantBrains";

type KB = { id: string; name: string; emoji: string; short_desc: string; reply_count: number };
type Ov = { id: string; mother_brain_id: string; type: string; content: string };
type Usage = Record<string, boolean>;

type Group = { key: string; title: string; items: (readonly [string, string])[] };
export const USE_GROUPS: Group[] = [
  { key: "use", title: "استخدمه في", items: [["auto_reply", "ردود تلقائية"], ["smart_reply", "ردود ذكية"], ["campaign", "حملات واتساب"], ["welcome", "رسائل ترحيب"], ["followup", "متابعة الزبائن"], ["appointments", "تذكير المواعيد"], ["calls", "مكالمة المملكة"]] },
  { key: "voice", title: "الصوت", items: [["brain_voice", "نفس صوت العقل"], ["my_voice", "صوتي المسجل"], ["text_only", "بدون صوت - نص فقط"]] },
  { key: "platform", title: "المنصات", items: [["whatsapp", "واتساب"], ["telegram", "تيليجرام"], ["instagram", "انستقرام"], ["site", "الموقع"], ["tiktok", "تيك توك"], ["facebook", "فيسبوك"], ["snap", "سناب"], ["x", "إكس"], ["sms", "رسائل SMS"], ["email", "الإيميل"]] },
];
const DEFAULTS = new Set(["use:auto_reply", "use:smart_reply", "voice:brain_voice", "platform:whatsapp"]);
const label = (k: string) => USE_GROUPS.flatMap((g) => g.items).find((x) => x[0] === k)?.[1] ?? k;

async function me() { return (await supabase.auth.getUser()).data.user?.id; }

/** Load all usage toggles for the merchant, keyed by toggle_key. */
export async function loadUsage(): Promise<Usage> {
  const { data } = await supabase.from("merchant_brain_usage").select("toggle_key, is_active");
  return Object.fromEntries((data ?? []).map((r) => [r.toggle_key, r.is_active]));
}
export const isOn = (u: Usage, brainId: string, g: string, v: string) => u[`${brainId}:${g}:${v}`] ?? DEFAULTS.has(`${g}:${v}`);

export function KingdomBrains({ admin, storeId }: { admin: boolean; storeId?: string | undefined }) {
  const [brains, setBrains] = useState<KB[]>([]);
  const [ovs, setOvs] = useState<Ov[]>([]);
  const [usage, setUsage] = useState<Usage>({});
  const [open, setOpen] = useState<string | null>(null);
  const load = async () => {
    const [{ data: b }, { data: o }, u] = await Promise.all([
      supabase.rpc("kingdom_brains"),
      supabase.from("merchant_brain_overrides").select("id, mother_brain_id, type, content").eq("merchant_id", (await me()) ?? "").order("created_at"),
      loadUsage(),
    ]);
    setBrains((b ?? []) as KB[]); setOvs((o ?? []) as Ov[]); setUsage(u);
  };
  useEffect(() => { load(); }, []);

  const toggle = async (brainId: string, g: string, v: string, replyId?: string) => {
    const uid = await me(); if (!uid) return;
    const key = replyId ? `r:${replyId}:${v}` : `${brainId}:${g}:${v}`;
    const next = replyId ? !usage[key] : !isOn(usage, brainId, g, v);
    setUsage((p) => ({ ...p, [key]: next }));
    const { error } = await supabase.from("merchant_brain_usage").upsert({
      merchant_id: uid, brain_id: brainId, reply_id: replyId ?? null, toggle_key: key, is_active: next,
      usage_type: g === "use" ? v : null, platform: g === "platform" ? v : null, voice_mode: g === "voice" ? v : null,
    }, { onConflict: "merchant_id,toggle_key" });
    if (error) { toast.error(error.message); return; }
    toast.success(next ? "✅ تفعّل" : "⭕ تعطّل", { duration: 900 });
    // Voice is a single choice: turning one on turns the others off
    if (g === "voice" && next && !replyId) for (const [o] of USE_GROUPS[1]!.items) if (o !== v && isOn(usage, brainId, g, o)) void toggle(brainId, g, o);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-gold p-5 text-accent-foreground shadow-soft">
        <h2 className="font-display text-2xl">👑 عقول المملكة الجاهزة</h2>
        <p className="text-sm opacity-80">عقول جاهزة من المملكة — اختبرها، وأضف لمستك الخاصة فوقها، واختر وين تشتغل.</p>
      </section>
      {!brains.length && <p className="rounded-xl bg-secondary p-4 text-center text-sm">ما فيه عقول مملكة منشورة بعد{admin ? " — انشر عقل من لوحة «كل عقول المنصة» تحت" : ""}.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {brains.map((b) => {
          const mine = ovs.filter((o) => o.mother_brain_id === b.id);
          return (
            <article key={b.id} className="rounded-2xl border bg-card p-4 shadow-soft">
              <h3 className="font-display text-lg text-primary">[{b.name} {b.emoji}👑]</h3>
              <p className="text-sm text-muted-foreground">{b.short_desc}</p>
              <ul className="mt-2 space-y-1 text-sm">
                <li>📚 {b.reply_count} رد جاهز من المملكة</li>
                <li>✨ إضافاتي: {mine.length} إضافة فوق الأم</li>
              </ul>
              <Button className="mt-3 w-full" variant={open === b.id ? "secondary" : "default"} onClick={() => setOpen(open === b.id ? null : b.id)}>اختبر العقل 🧪</Button>
              {open === b.id && <TestBox admin={admin} brain={b} overrides={mine} reload={load} usage={usage} toggle={toggle} />}
            </article>
          );
        })}
      </div>
      {admin && <AdminAll storeId={storeId} onDone={load} />}
      {admin && <QueenMerchantBrains storeId={storeId} />}
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${on ? "border-success bg-success text-success-foreground shadow-soft" : "border-border bg-muted text-muted-foreground"}`}>
      {on ? "✅" : "⭕"} {children}
    </button>
  );
}

function UsagePanel({ brainId, usage, toggle }: { brainId: string; usage: Usage; toggle: (b: string, g: string, v: string) => void }) {
  return (
    <div className="mt-4 space-y-3 rounded-xl bg-secondary/60 p-3">
      <p className="font-semibold">وين تستخدم هذا العقل؟ 👇</p>
      {USE_GROUPS.map((g) => (
        <div key={g.key}>
          <p className="mb-1 text-xs text-muted-foreground">{g.title}:</p>
          <div className="flex flex-wrap gap-1.5">
            {g.items.map(([v, l]) => <Toggle key={v} on={isOn(usage, brainId, g.key, v)} onClick={() => toggle(brainId, g.key, v)}>{l}</Toggle>)}
          </div>
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground">الحفظ فوري — كل ضغطة تنحفظ مباشرة.</p>
    </div>
  );
}

function TestBox({ brain, overrides, reload, usage, toggle, admin }: { admin: boolean; brain: KB; overrides: Ov[]; reload: () => void; usage: Usage; toggle: (b: string, g: string, v: string, r?: string) => void }) {
  const test = useServerFn(kingdomTest);
  const [msgs, setMsgs] = useState<{ me: boolean; t: string }[]>([]);
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false);
  const send = async () => {
    const m = text.trim(); if (!m || busy) return;
    setText(""); setMsgs((p) => [...p, { me: true, t: m }]); setBusy(true);
    try {
      const r = await test({ data: { brainId: brain.id, message: m } });
      setMsgs((p) => [...p, { me: false, t: r.reply }]);
      if (r.command) reload();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const del = async (id: string) => { await supabase.from("merchant_brain_overrides").delete().eq("id", id); reload(); };
  return (
    <div className="mt-3">
      <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl bg-muted p-3">
        {!msgs.length && <p className="text-center text-xs text-muted-foreground">اكتب كأنك زبون… مثلاً: «كم السعر؟»</p>}
        {msgs.map((m, i) => (
          <p key={i} className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm ${m.me ? "mr-auto bg-primary text-primary-foreground" : "ml-auto bg-card"}`}>{m.t}</p>
        ))}
        {busy && <p className="ml-auto w-fit rounded-2xl bg-card px-3 py-2 text-sm">…</p>}
      </div>
      <div className="mt-2 flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="رسالة الزبون أو أمر…" />
        <Button onClick={send} disabled={busy}>إرسال</Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">جرب العقل - اذا رد ما عجبك اكتب: احذف [الكلمة] أو أضف [معلومة] — أو: عدل الرد [كذا] إلى [كذا]</p>
      {admin && <p className="mt-1 rounded-lg bg-gold/20 p-2 text-xs">👑 أوامر الملكة: «أضف رد السعر = 99 ريال» يضيف للعقل الأم لكل التجار · «احذف رد السعر» يحذفه</p>}
      {!!overrides.length && (
        <div className="mt-3 space-y-1">
          <p className="text-sm font-semibold">✨ إضافاتي فوق الأم</p>
          {overrides.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-2 rounded-lg bg-card px-2 py-1 text-xs">
              <span>{o.type === "delete_keyword" ? "🗑️ حذف" : o.type === "add_info" ? "➕ معلومة" : o.type === "edit_response" ? "✏️ تعديل" : "💬 رد"}: {o.content.replace("||", " ← ")}</span>
              <button onClick={() => del(o.id)} className="text-destructive">✕</button>
            </div>
          ))}
        </div>
      )}
      <UsagePanel brainId={brain.id} usage={usage} toggle={toggle} />
      <ReplyLibrary brain={brain} overrides={overrides} reload={reload} usage={usage} toggle={toggle} />
    </div>
  );
}

const REPLY_USES = [["auto_reply", "ردود تلقائية"], ["campaign", "حملات"], ["welcome", "ترحيب"], ["voice", "صوت"]] as const;

function ReplyLibrary({ brain, overrides, reload, usage, toggle }: { brain: KB; overrides: Ov[]; reload: () => void; usage: Usage; toggle: (b: string, g: string, v: string, r?: string) => void }) {
  const [rows, setRows] = useState<{ id: string; trigger_text: string; reply_text: string }[]>([]);
  const [q, setQ] = useState(""); const [t, setT] = useState(""); const [r, setR] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  useEffect(() => { supabase.rpc("kingdom_replies", { _brain: brain.id }).then(({ data }) => setRows(data ?? [])); }, [brain.id]);
  const mine = overrides.filter((o) => o.type === "add_reply");
  const add = async () => {
    const uid = await me(); if (!uid || !t.trim() || !r.trim()) return;
    const { error } = await supabase.from("merchant_brain_overrides").insert({ merchant_id: uid, mother_brain_id: brain.id, type: "add_reply", content: `${t.trim()}||${r.trim()}`.slice(0, 2000) });
    if (error) toast.error(error.message); else { setT(""); setR(""); reload(); }
  };
  const shown = rows.filter((x) => !q || x.trigger_text.includes(q) || x.reply_text.includes(q)).slice(0, 50);
  return (
    <div className="mt-4 space-y-2 rounded-xl border p-3">
      <p className="font-semibold">📚 ردود المملكة (جاهزة) + ردودي الإضافية</p>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 ابحث في الردود" />
      <div className="max-h-64 space-y-1.5 overflow-y-auto">
        {shown.map((x) => (
          <div key={x.id} className="rounded-lg bg-muted p-2 text-xs">
            <p>🔒 <b>{x.trigger_text}</b> ← {x.reply_text}</p>
            <button onClick={() => setMenu(menu === x.id ? null : x.id)} className="mt-1 rounded-full bg-card px-2 py-0.5">استخدم هذا الرد في: ▼</button>
            {menu === x.id && (
              <div className="mt-1 flex flex-wrap gap-1">
                {REPLY_USES.map(([v, l]) => <Toggle key={v} on={!!usage[`r:${x.id}:${v}`]} onClick={() => toggle(brain.id, "reply", v, x.id)}>{l}</Toggle>)}
              </div>
            )}
          </div>
        ))}
        {!rows.length && <p className="text-xs text-muted-foreground">ما فيه ردود جاهزة لهذا العقل بعد.</p>}
      </div>
      <p className="pt-2 text-sm font-semibold">💬 ردودي الإضافية (تظهر لك أنت فقط)</p>
      {mine.map((o) => <p key={o.id} className="rounded-lg bg-success/15 p-2 text-xs">{o.content.replace("||", " ← ")}</p>)}
      <div className="flex flex-wrap gap-2">
        <Input className="flex-1" value={t} onChange={(e) => setT(e.target.value)} placeholder="لما الزبون يقول…" />
        <Input className="flex-1" value={r} onChange={(e) => setR(e.target.value)} placeholder="أرد عليه…" />
        <Button size="sm" onClick={add}>➕ أضف</Button>
      </div>
    </div>
  );
}

type AnyBrain = { id: string; name: string; emoji: string; specialty: string; instructions: string; knowledge: string; library_tag: string; is_kingdom: boolean; short_desc: string; store_id: string; stores: { name: string } | null };

/** Owner only: every brain on the platform; publish to the Mother Kingdom. */
function AdminAll({ storeId, onDone }: { storeId?: string | undefined; onDone: () => void }) {
  const [all, setAll] = useState<AnyBrain[]>([]);
  const [stats, setStats] = useState({ ov: 0, use: 0 });
  const load = async () => {
    const [{ data }, ov, us] = await Promise.all([
      supabase.from("brains").select("id, name, emoji, specialty, instructions, knowledge, library_tag, is_kingdom, short_desc, store_id, stores(name)").order("created_at", { ascending: false }).limit(300),
      supabase.from("merchant_brain_overrides").select("id", { count: "exact", head: true }),
      supabase.from("merchant_brain_usage").select("id", { count: "exact", head: true }),
    ]);
    setAll((data ?? []) as unknown as AnyBrain[]); setStats({ ov: ov.count ?? 0, use: us.count ?? 0 });
  };
  useEffect(() => { load(); }, []);
  const publish = async (b: AnyBrain, on: boolean) => {
    if (!storeId) return;
    const desc = b.short_desc || b.specialty;
    const tag = b.library_tag || b.name.slice(0, 40);
    const res = b.store_id === storeId
      ? await supabase.from("brains").update({ is_kingdom: on, short_desc: desc, library_tag: tag }).eq("id", b.id)
      : await supabase.from("brains").insert({ store_id: storeId, name: b.name, emoji: b.emoji, specialty: b.specialty, source: "both", instructions: b.instructions, knowledge: b.knowledge, library_tag: tag, is_kingdom: true, short_desc: desc });
    if (res.error) toast.error(res.error.message); else { toast.success(on ? "👑 انضاف لعقل الأم" : "انشال من المملكة"); load(); onDone(); }
  };
  const setDesc = async (id: string, v: string) => { await supabase.from("brains").update({ short_desc: v.slice(0, 200) }).eq("id", id); };
  return (
    <section className="rounded-2xl border-2 border-gold bg-card p-4 shadow-soft">
      <h3 className="font-display text-lg text-primary">👸 كل عقول المنصة (للملكة فقط)</h3>
      <p className="text-xs text-muted-foreground">{all.length} عقل · {stats.ov} إضافة من التجار · {stats.use} إعداد استخدام</p>
      <div className="mt-3 max-h-[60vh] space-y-2 overflow-y-auto">
        {all.map((b) => (
          <div key={b.id} className="rounded-xl bg-muted p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{b.emoji} <b>{b.name}</b> · <span className="text-xs text-muted-foreground">{b.store_id === storeId ? "عقلك" : b.stores?.name ?? "تاجر"}</span> {b.is_kingdom && "👑"}</span>
              {b.store_id === storeId && b.is_kingdom
                ? <Button size="sm" variant="outline" onClick={() => publish(b, false)}>إخفاء من المملكة</Button>
                : <Button size="sm" onClick={() => publish(b, true)}>👑 أضف لعقل الأم</Button>}
            </div>
            <details className="mt-1 text-xs"><summary className="cursor-pointer">داخل العقل (للملكة فقط)</summary><p className="whitespace-pre-line pt-1">{b.instructions}</p>{b.library_tag && <p>📚 قسم المكتبة: {b.library_tag}</p>}</details>
            {b.store_id === storeId && <Input className="mt-2 h-8 text-xs" defaultValue={b.short_desc} onBlur={(e) => setDesc(b.id, e.target.value)} placeholder="وصف قصير يظهر للتجار" />}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Quick dashboard: where each brain is active. */
export function BrainUsageSummary() {
  const [rows, setRows] = useState<{ name: string; emoji: string; on: string[] }[]>([]);
  useEffect(() => {
    (async () => {
      const [{ data: kb }, u] = await Promise.all([supabase.rpc("kingdom_brains"), loadUsage()]);
      setRows((kb ?? []).map((b) => ({ name: b.name, emoji: b.emoji, on: USE_GROUPS.filter((g) => g.key !== "voice").flatMap((g) => g.items.filter(([v]) => isOn(u, b.id, g.key, v)).map(([v]) => label(v))) })));
    })();
  }, []);
  if (!rows.length) return null;
  return (
    <section className="rounded-2xl border bg-card p-3 shadow-soft lg:col-span-2">
      <p className="mb-2 text-sm font-semibold">⚡ لوحة تشغيل عقولك</p>
      <div className="flex flex-wrap gap-2">
        {rows.map((r) => (
          <span key={r.name} className="rounded-full bg-secondary px-3 py-1 text-xs">{r.emoji} {r.name}: يعمل في ({r.on.join(" + ") || "لا شي"}) {r.on.length ? "🟢" : "⚪"}</span>
        ))}
      </div>
    </section>
  );
}

/** Kingdom replies the merchant pinned for a given use (e.g. campaign) — click to insert. */
export function PinnedReplies({ use, onPick }: { use: string; onPick: (t: string) => void }) {
  const [list, setList] = useState<{ id: string; t: string; r: string }[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("merchant_brain_usage").select("brain_id, reply_id").eq("is_active", true).like("toggle_key", `r:%:${use}`);
      const byBrain = [...new Set((data ?? []).map((d) => d.brain_id).filter(Boolean))] as string[];
      const ids = new Set((data ?? []).map((d) => d.reply_id));
      const out: { id: string; t: string; r: string }[] = [];
      for (const b of byBrain) {
        const { data: rows } = await supabase.rpc("kingdom_replies", { _brain: b });
        for (const x of rows ?? []) if (ids.has(x.id)) out.push({ id: x.id, t: x.trigger_text, r: x.reply_text });
      }
      setList(out);
    })();
  }, [use]);
  if (!list.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <span className="text-xs text-muted-foreground">👑 ردود المملكة المختارة:</span>
      {list.map((x) => <button key={x.id} onClick={() => onPick(x.r)} className="rounded-full bg-success/15 px-2 py-0.5 text-xs">{x.t}</button>)}
    </div>
  );
}
