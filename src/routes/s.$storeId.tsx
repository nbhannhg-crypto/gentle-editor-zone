import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { publicStore } from "@/lib/bots.functions";
import { BUSINESS_TYPES } from "@/lib/bots";

export const Route = createFileRoute("/s/$storeId")({
  loader: async ({ params }) => {
    if (!/^[0-9a-f-]{36}$/i.test(params.storeId)) throw notFound();
    const s = await publicStore({ data: { id: params.storeId } });
    if (!s) throw notFound();
    return s;
  },
  head: ({ loaderData }) => {
    const t = loaderData ? `${loaderData.name} — مملكة المبيعات` : "متجر — مملكة المبيعات";
    const d = loaderData?.bio || "تسوّقي واطلبي مباشرة على واتساب.";
    return { meta: [{ title: t }, { name: "description", content: d }, { property: "og:title", content: t }, { property: "og:description", content: d }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] };
  },
  errorComponent: () => <div dir="rtl" className="p-10 text-center">صار خطأ، حدّثي الصفحة.</div>,
  notFoundComponent: () => <div dir="rtl" className="p-10 text-center">المتجر غير موجود. <Link to="/" className="underline">الرئيسية</Link></div>,
  component: StorePage,
});

function StorePage() {
  const s = Route.useLoaderData();
  const type = BUSINESS_TYPES.find((t) => t[0] === s.business_type)?.[1] ?? "";
  const wa = (msg: string) => (s.whatsapp ? `https://wa.me/${s.whatsapp}?text=${encodeURIComponent(msg)}` : "");
  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-primary px-4 py-10 text-center text-primary-foreground">
        <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-gold text-4xl">👑</div>
        <h1 className="font-display text-3xl">{s.name}</h1>
        <p className="mt-1 text-sm opacity-80">{type}</p>
        {s.bio && <p className="mx-auto mt-3 max-w-xl text-sm">{s.bio}</p>}
        {s.whatsapp && <a href={wa("السلام عليكم، أبي أستفسر")} target="_blank" rel="noreferrer" className="mt-4 inline-block rounded-full bg-gold px-6 py-2 font-bold text-accent-foreground">🟢 تواصلي معنا واتساب</a>}
      </header>
      <main className="mx-auto grid max-w-4xl gap-3 px-4 py-8 sm:grid-cols-2">
        {s.products.length === 0 && <p className="text-center text-muted-foreground sm:col-span-2">المنتجات قريباً ✨</p>}
        {s.products.map((p) => (
          <div key={p.id} className="rounded-2xl border bg-card p-4">
            <h2 className="font-semibold">{p.name}</h2>
            {p.description && <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>}
            <div className="mt-3 flex items-center justify-between">
              <b className="text-primary">{Number(p.price)} ريال</b>
              {s.whatsapp && <a href={wa(`أبي أطلب: ${p.name}`)} target="_blank" rel="noreferrer" className="rounded-full bg-primary px-3 py-1 text-sm text-primary-foreground">اطلبي الحين</a>}
            </div>
          </div>
        ))}
      </main>
      <footer className="pb-8 text-center text-xs text-muted-foreground">بدعم من <Link to="/" className="underline">مملكة المبيعات</Link></footer>
    </div>
  );
}
