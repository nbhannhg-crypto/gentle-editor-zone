import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isAdmin } from "@/lib/stores";
import FactoryLab from "@/components/FactoryLab";
import { getBranding, setBranding } from "@/lib/branding.functions";
import { BRAND_DEFAULTS, type BrandNames } from "@/lib/branding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "لوحة تحكم المالك — مملكة المبيعات" },
      { name: "description", content: "إدارة متاجر التجار والمشتركين في منصة مملكة المبيعات" },
      { property: "og:title", content: "لوحة تحكم المالك" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

type StoreRow = { id: string; name: string; owner_id: string; active: boolean; plan: string; created_at: string };

function AdminPage() {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [stats, setStats] = useState({ rules: 0, customers: 0, messages: 0 });

  useEffect(() => {
    isAdmin().then((ok) => {
      setAllowed(ok);
      if (!ok) return;
      supabase.from("stores").select("*").order("created_at", { ascending: false }).then(({ data }) => setStores((data ?? []) as StoreRow[]));
      Promise.all([
        supabase.from("training_rules").select("id", { count: "exact", head: true }),
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("channel_messages").select("id", { count: "exact", head: true }),
      ]).then(([r, c, m]) => setStats({ rules: r.count ?? 0, customers: c.count ?? 0, messages: m.count ?? 0 }));
    });
  }, []);

  if (allowed === null) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">لحظات…</div>;
  if (!allowed) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <p className="text-xl">🚫 هذه اللوحة لمالك المنصة فقط</p>
      <Button onClick={() => navigate({ to: "/app" })}>ارجع لمتجري</Button>
    </div>
  );

  const toggleStore = async (s: StoreRow, active: boolean) => {
    const { error } = await supabase.from("stores").update({ active }).eq("id", s.id);
    if (error) { toast.error("تعذر التحديث"); return; }
    setStores(stores.map((x) => x.id === s.id ? { ...x, active } : x));
  };

  const setPlan = async (s: StoreRow, plan: string) => {
    await supabase.from("stores").update({ plan }).eq("id", s.id);
    setStores(stores.map((x) => x.id === s.id ? { ...x, plan } : x));
    toast.success("تم تحديث الباقة");
  };

  return (
    <div className="min-h-screen">
      <header className="bg-royal text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
          <h1 className="font-display text-2xl">🛠️ لوحة تحكم المالك</h1>
          <div className="flex gap-2">
            <Button className="bg-gold text-accent-foreground" onClick={() => navigate({ to: "/admin/kingdom" })}>👑 مملكة الأم</Button>
            <Button variant="outline" className="text-foreground" onClick={() => navigate({ to: "/app" })}>متجري</Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="grid gap-4 sm:grid-cols-4">
          {([["متاجر مسجلة", stores.length], ["قواعد مدربة", stats.rules], ["زبائن محفوظين", stats.customers], ["رسائل القنوات", stats.messages]] as const).map(([l, v]) => (
            <section key={l} className="rounded-2xl border bg-card p-5 shadow-soft">
              <p className="text-sm text-muted-foreground">{l}</p>
              <p className="font-display text-4xl text-primary">{v}</p>
            </section>
          ))}
        </div>

        <section className="rounded-2xl border bg-card p-5 shadow-soft">
          <h2 className="font-display mb-4 text-lg text-primary">🏪 المتاجر</h2>
          {stores.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد متاجر بعد.</p> : (
            <div className="space-y-2">
              {stores.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm">
                  <div className="flex-1 min-w-40">
                    <p className="font-semibold">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString("ar-SA")}</p>
                  </div>
                  <select
                    className="rounded-lg border bg-background px-2 py-1 text-sm"
                    value={s.plan}
                    onChange={(e) => setPlan(s, e.target.value)}
                  >
                    <option value="free">مجاني</option>
                    <option value="pro">احترافي</option>
                    <option value="enterprise">مؤسسات</option>
                  </select>
                  <div className="flex items-center gap-2">
                    <span className="text-xs">{s.active ? "فعّال ✅" : "موقف ⛔"}</span>
                    <Switch checked={s.active} onCheckedChange={(v) => toggleStore(s, v)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <AdminWallet />
        <BrandNamesCard />
        <AdminBrains />
        <FactoryLab />
      </main>
    </div>
  );
}

type Topup = { id: string; store_id: string; points: number; amount_sar: number; reference: string; status: string; created_at: string };

function AdminWallet() {
  const [reqs, setReqs] = useState<Topup[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.from("topup_requests").select("*").order("created_at", { ascending: false }).limit(30);
    setReqs((data as Topup[] | null) ?? []);
  };
  useEffect(() => { load(); }, []);

  const review = async (id: string, approve: boolean) => {
    setBusy(id);
    const { error } = await supabase.rpc("review_topup", { _id: id, _approve: approve });
    if (error) toast.error(error.message);
    else toast.success(approve ? "تم الاعتماد وشحن الرصيد ✅" : "تم الرفض");
    setBusy(null);
    load();
  };

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-soft">
      <h2 className="font-display mb-4 text-lg text-primary">💰 طلبات شحن الرصيد</h2>
      {reqs.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد طلبات شحن بعد.</p>
      ) : (
        <div className="space-y-2">
          {reqs.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
              <div>
                <span className="font-semibold">{r.points} نقطة</span>
                <span className="mx-2 text-muted-foreground">مقابل {r.amount_sar} ر.س</span>
                {r.reference && <span className="text-xs text-muted-foreground">مرجع: {r.reference}</span>}
              </div>
              <div className="flex items-center gap-2">
                {r.status === "pending" ? (
                  <>
                    <Button size="sm" disabled={busy === r.id} onClick={() => review(r.id, true)}>اعتماد ✅</Button>
                    <Button size="sm" variant="destructive" disabled={busy === r.id} onClick={() => review(r.id, false)}>رفض</Button>
                  </>
                ) : (
                  <span className={`text-xs ${r.status === "approved" ? "text-emerald-600" : "text-rose-600"}`}>
                    {r.status === "approved" ? "معتمد ✅" : "مرفوض ❌"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

type Svc = { id: string; name: string; emoji: string; guide: string; price_points: number; active: boolean };
function AdminBrains() {
  const [list, setList] = useState<Svc[]>([]);
  const [f, setF] = useState({ name: "", emoji: "✨", guide: "", price_points: 2 });
  const load = () => supabase.from("brain_services").select("*").order("created_at", { ascending: false }).then(({ data }) => setList((data ?? []) as Svc[]));
  useEffect(() => { load(); }, []);
  const add = async () => {
    if (!f.name.trim() || !f.guide.trim()) { toast.error("اكتب الاسم والشرح"); return; }
    const { error } = await supabase.from("brain_services").insert(f);
    if (error) { toast.error(error.message); return; }
    toast.success("انضافت الخدمة لكل التجار"); setF({ name: "", emoji: "✨", guide: "", price_points: 2 }); load();
  };
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-soft">
      <h2 className="font-display mb-1 text-lg text-primary">🧠 عقول وخدمات المنصة</h2>
      <p className="mb-4 text-sm text-muted-foreground">أي خدمة تضيفها هنا تصير يعرفها مصنع العقول عند كل التجار مباشرة.</p>
      <div className="grid gap-2 sm:grid-cols-[70px_1fr_100px]">
        <input className="rounded-lg border bg-background px-2 py-2" value={f.emoji} onChange={(e) => setF({ ...f, emoji: e.target.value })} aria-label="رمز" />
        <input className="rounded-lg border bg-background px-3 py-2" placeholder="اسم الخدمة (مثال: عقل التصوير)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input type="number" min={0} className="rounded-lg border bg-background px-2 py-2" value={f.price_points} onChange={(e) => setF({ ...f, price_points: Number(e.target.value) })} aria-label="نقاط" />
      </div>
      <textarea className="mt-2 w-full rounded-lg border bg-background px-3 py-2" rows={3} placeholder="وش يسوي العقل؟ كيف يعلم التاجر؟ روابط أو أسعار…" value={f.guide} onChange={(e) => setF({ ...f, guide: e.target.value })} />
      <Button className="mt-2" onClick={add}>➕ أضف الخدمة</Button>
      <div className="mt-4 space-y-2">
        {list.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-xl border p-3 text-sm">
            <span className="text-2xl">{s.emoji}</span>
            <div className="flex-1"><b>{s.name}</b> • {s.price_points} نقطة<p className="text-muted-foreground">{s.guide}</p></div>
            <Switch checked={s.active} onCheckedChange={async (v) => { await supabase.from("brain_services").update({ active: v }).eq("id", s.id); load(); }} />
            <button className="text-destructive" onClick={async () => { await supabase.from("brain_services").delete().eq("id", s.id); load(); }} aria-label="حذف">🗑️</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function BrandNamesCard() {
  const getNames = useServerFn(getBranding);
  const saveNames = useServerFn(setBranding);
  const [f, setF] = useState<BrandNames | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getNames().then(setF).catch(() => setF({ ...BRAND_DEFAULTS }));
  }, [getNames]);

  if (!f) return null;

  const submit = async () => {
    setBusy(true);
    try {
      await saveNames({ data: f });
      toast.success("تم حفظ الأسماء المحمية ✅");
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-soft">
      <h2 className="font-display mb-1 text-lg text-primary">🏷️ الأسماء المحمية</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        الأسماء التي تظهر للمستخدمين بدل أسماء الخدمات الخارجية. غيّرها لأي اسم تبي، وما يظهر الاسم الحقيقي في الموقع ولا حتى برسائل الخطأ.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="text-sm font-medium">🎙️ مختبر الأصوات</label>
          <Input className="mt-1" value={f.voice} maxLength={40} onChange={(e) => setF({ ...f, voice: e.target.value })} />
        </div>
        <div>
          <label className="text-sm font-medium">🧠 العقل الذكي</label>
          <Input className="mt-1" value={f.ai} maxLength={40} onChange={(e) => setF({ ...f, ai: e.target.value })} />
        </div>
        <div>
          <label className="text-sm font-medium">💬 مركز المحادثات</label>
          <Input className="mt-1" value={f.chat} maxLength={40} onChange={(e) => setF({ ...f, chat: e.target.value })} />
        </div>
      </div>
      <Button className="mt-4" onClick={submit} disabled={busy || !f.voice.trim() || !f.ai.trim() || !f.chat.trim()}>
        {busy ? "…" : "💾 احفظ الأسماء"}
      </Button>
    </section>
  );
}
