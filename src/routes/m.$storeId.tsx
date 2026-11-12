import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { M_SECTIONS } from "@/lib/marriage";

export const Route = createFileRoute("/m/$storeId")({
  loader: ({ params }) => { if (!/^[0-9a-f-]{36}$/i.test(params.storeId)) throw notFound(); return null; },
  head: () => ({ meta: [
    { title: "استمارة طلب زواج — سرية تامة وثقة وأمان" },
    { name: "description", content: "استمارة طلب زواج شاملة بسرية تامة ومصداقية عالية، بياناتك الخاصة محمية ولا تُنشر." },
    { property: "og:title", content: "استمارة طلب زواج — سرية تامة" },
    { property: "og:description", content: "عبّ الاستمارة بخطوات بسيطة، وبياناتك الخاصة محمية." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" } ] }),
  notFoundComponent: () => <div dir="rtl" className="p-10 text-center">الرابط غير صحيح. <Link to="/" className="underline">الرئيسية</Link></div>,
  component: FormPage,
});

function FormPage() {
  const { storeId } = Route.useParams();
  const [step, setStep] = useState(0);
  const [gender, setGender] = useState<"male" | "female">("male");
  const [d, setD] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const sec = M_SECTIONS[step];
  const last = step === M_SECTIONS.length - 1;
  const set = (k: string, v: string) => setD((p) => ({ ...p, [k]: v.slice(0, 600) }));

  const next = async () => {
    const miss = sec.fields.find((f) => f.req && !d[f.k]?.trim());
    if (miss) { setErr(`فضلاً عبّ: ${miss.l}`); return; }
    if (sec.fields.some((f) => f.k === "phone") && !/^\+?\d{8,15}$/.test((d.phone ?? "").replace(/\s/g, ""))) { setErr("رقم التواصل غير صحيح"); return; }
    setErr("");
    if (!last) { setStep(step + 1); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("submit_marriage_form", { _store: storeId, _gender: gender, _data: d });
    setBusy(false);
    if (error) { setErr("ما قدرنا نرسل الطلب، حاول مرة ثانية"); return; }
    setCode(String(data));
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-secondary to-background px-3 py-6">
      <div className="mx-auto max-w-xl">
        <header className="rounded-3xl bg-royal p-6 text-center text-primary-foreground shadow-soft">
          <div className="text-4xl">👑💍</div>
          <h1 className="mt-2 font-display text-2xl">استمارة طلب زواج</h1>
          <p className="mt-1 text-sm opacity-90">سرية تامة • ثقة وأمان • مصداقية عالية</p>
        </header>

        {code ? (
          <div className="mt-6 rounded-3xl border bg-card p-6 text-center shadow-soft">
            <div className="text-5xl">🤍</div>
            <h2 className="mt-3 font-display text-xl">وصلنا طلبك بنجاح</h2>
            <p className="mt-2 text-sm text-muted-foreground">احتفظ بكود طلبك للمتابعة:</p>
            <div className="mx-auto mt-3 w-fit rounded-2xl bg-gold px-6 py-3 font-display text-2xl text-accent-foreground">{code}</div>
            <p className="mt-4 text-xs text-muted-foreground">بنتواصل معك قريب بإذن الله. بياناتك الخاصة ما تنشر أبداً.</p>
          </div>
        ) : (
          <div className="mt-5 rounded-3xl border bg-card p-4 shadow-soft sm:p-6">
            <div className="mb-4 flex gap-1">{M_SECTIONS.map((_, i) => <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />)}</div>
            {step === 0 && (
              <div className="mb-4 grid grid-cols-2 gap-2">
                {([["male", "🤵 أنا عريس"], ["female", "👰 أنا عروس"]] as const).map(([g, l]) => (
                  <button key={g} onClick={() => setGender(g)} className={`rounded-2xl border p-3 font-semibold transition ${gender === g ? "border-primary bg-primary text-primary-foreground" : "bg-secondary"}`}>{l}</button>
                ))}
              </div>
            )}
            <h2 className="mb-3 font-display text-lg text-primary">{sec.t}</h2>
            <div className="space-y-3">
              {sec.fields.map((f) => (
                <label key={f.k} className="block">
                  <span className="mb-1 block text-sm font-medium">{f.l}{f.req && <span className="text-destructive"> *</span>}{f.private && <span className="mr-1 text-[11px] text-muted-foreground">🔒 سري</span>}</span>
                  {f.opts ? (
                    <div className="flex flex-wrap gap-2">{f.opts.map((o) => (
                      <button type="button" key={o} onClick={() => set(f.k, o)} className={`rounded-full border px-3 py-1.5 text-sm ${d[f.k] === o ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>{o}</button>
                    ))}</div>
                  ) : f.long ? (
                    <textarea value={d[f.k] ?? ""} onChange={(e) => set(f.k, e.target.value)} rows={3} className="w-full rounded-xl border bg-background p-3 text-sm" />
                  ) : (
                    <input value={d[f.k] ?? ""} onChange={(e) => set(f.k, e.target.value)} inputMode={f.k === "phone" || f.k === "age" ? "tel" : undefined} className="w-full rounded-xl border bg-background p-3 text-sm" />
                  )}
                </label>
              ))}
            </div>
            {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
            <div className="mt-5 flex gap-2">
              {step > 0 && <button onClick={() => setStep(step - 1)} className="rounded-xl border px-4 py-3">السابق</button>}
              <button disabled={busy} onClick={() => void next()} className="flex-1 rounded-xl bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-60">{busy ? "جاري الإرسال…" : last ? "إرسال الطلب 🤍" : "التالي"}</button>
            </div>
          </div>
        )}
        <div className="mt-5 grid grid-cols-2 gap-2 text-center text-[11px] text-muted-foreground sm:grid-cols-4">
          {["🔒 خصوصيتك أمانة", "⚖️ سرية البيانات", "✅ التحقق قدر الإمكان", "🤝 تعامل بجدية واحترام"].map((t) => <div key={t} className="rounded-xl border bg-card p-2">{t}</div>)}
        </div>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">الخدمة مخصصة للبالغين بعمر 18 فأكثر</p>
      </div>
    </div>
  );
}
