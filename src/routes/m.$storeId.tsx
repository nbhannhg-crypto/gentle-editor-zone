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
  const [agree, setAgree] = useState(false);
  const sec = M_SECTIONS[step] ?? M_SECTIONS[0]!;
  const last = step === M_SECTIONS.length - 1;
  const set = (k: string, v: string) => setD((p) => ({ ...p, [k]: v.slice(0, 600) }));

  const next = async () => {
    const miss = sec.fields.find((f) => f.req && !d[f.k]?.trim());
    if (miss) { setErr(`فضلاً عبّ: ${miss.l}`); return; }
    if (sec.fields.some((f) => f.k === "phone") && !/^\+?\d{8,15}$/.test((d["phone"] ?? "").replace(/\s/g, ""))) { setErr("رقم التواصل غير صحيح"); return; }
    if (sec.fields.some((f) => f.k === "handle")) {
      const h = (d["handle"] ?? "").trim();
      if (!/^@?[A-Za-z0-9._]{2,30}$/.test(h)) { setErr("اليوزر غير صحيح — حروف إنجليزية وأرقام و . _ فقط"); return; }
      if ((d["phone"] ?? "").replace(/\s/g, "") !== (d["phone2"] ?? "").replace(/\s/g, "")) { setErr("رقم الجوال وتأكيده غير متطابقين"); return; }
      if (!agree) { setErr("فضلاً أكّد صحة بياناتك والموافقة على الشروط"); return; }
    }
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
        <header className="relative overflow-hidden rounded-3xl border-2 border-gold bg-royal p-6 text-center text-primary-foreground shadow-soft">
          <div className="absolute right-3 top-3 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-accent-foreground">💎 خدمتنا لكم بكل ثقة</div>
          <div className="absolute left-3 top-3 rounded-full border border-gold/60 px-2 py-0.5 text-[10px]">كل شيء بالحلال 🤍</div>
          <div className="mt-5 text-5xl drop-shadow">👑</div>
          <h1 className="mt-1 font-display text-3xl">خطابة أم ندى</h1>
          <div className="mx-auto mt-2 w-fit rounded-full bg-gold px-4 py-1 text-sm font-bold text-accent-foreground">♥ ثقة وأمان ♥</div>
          <p className="mt-3 text-sm opacity-90">استمارة طلب زواج شاملة — سرية تامة ومصداقية عالية</p>
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
            {sec.fields.some((f) => f.k === "handle") && (
              <div className="mt-4 space-y-2 rounded-2xl border border-gold bg-secondary p-3 text-xs leading-6">
                <p className="font-bold text-primary">🛡️ توثيق الطلب وحمايتك</p>
                <p>• اليوزر ورقم الجوال سريّة ولا تنشر أبداً، تستخدم فقط للتحقق والتواصل معك.</p>
                <p>• بيتم التواصل معك من الرقم الرسمي فقط، ولن نطلب منك أي مبالغ أو رموز تحقق (OTP).</p>
                <p>• البيانات غير الصحيحة أو المكررة تُلغى تلقائياً.</p>
                <label className="flex items-start gap-2 pt-1 font-semibold"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 h-4 w-4 accent-primary" />أقرّ بأن عمري 18 فأكثر، وأن جميع بياناتي صحيحة، وأوافق على التواصل للتحقق.</label>
              </div>
            )}
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
        <a href="https://wa.me/966580158578" target="_blank" rel="noreferrer" className="mt-4 flex items-center justify-center gap-2 rounded-2xl border-2 border-gold bg-royal p-3 text-primary-foreground shadow-soft"><span className="text-2xl">💬</span><span><span className="block text-[11px] opacity-90">للتواصل والاستفسار عبر الواتساب</span><span className="font-display text-lg" dir="ltr">966580158578</span></span></a>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">الخدمة مخصصة للبالغين بعمر 18 فأكثر • حساباتنا الرسمية: a14141000@</p>
      </div>
    </div>
  );
}
