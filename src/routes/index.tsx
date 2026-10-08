import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "مملكة المبيعات — موظفة ذكاء اصطناعي تبيع عنك" },
      { name: "description", content: "منصة سعودية تتيح لكل تاجر تدريب موظفة مبيعات ذكية ترد على الزبائن بصوت سعودي، في واتساب وكل المنصات." },
      { property: "og:title", content: "مملكة المبيعات" },
      { property: "og:description", content: "درّب موظفة مبيعات ذكية ترد على زبائنك ٢٤ ساعة بصوت سعودي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: "🎓", title: "تدريب كأنك تعلّم موظفة", desc: "اكتب: إذا قال الزبون كذا، ردي كذا — وتتذكرها للأبد." },
  { icon: "🎙️", title: "صوت سعودي طبيعي", desc: "ترد على زبائنك بصوت أنثوي سعودي دافئ، بسرعة ونبرة تتحكم فيها." },
  { icon: "📡", title: "كل منصاتك في مكان واحد", desc: "واتساب، انستقرام، تيليقرام، ماسنجر — وأكثر من حساب لكل منصة." },
  { icon: "🧠", title: "تفهم العامية والأخطاء", desc: "تفهم قصد الزبون حتى لو كتب بعامية أو بصوت محوّل لنص." },
  { icon: "👥", title: "ذاكرة زبائن", desc: "كل زبون ينحفظ تلقائياً مع ملاحظاته ومشترياته." },
  { icon: "📊", title: "تقرير ذكي أسبوعي", desc: "تحليل: وش يسألون، وش يعترضون عليه، ووش يرفع مبيعاتك." },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="bg-royal text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <p className="font-display text-xl">👑 مملكة المبيعات</p>
          <Link to="/auth" className="rounded-full bg-gold px-5 py-2 text-sm font-semibold text-accent-foreground">دخول التجار</Link>
        </div>
      </header>

      <section className="bg-royal pb-20 pt-14 text-center text-primary-foreground">
        <div className="mx-auto max-w-3xl px-4">
          <h1 className="font-display text-4xl leading-snug md:text-6xl md:leading-tight">
            موظفة مبيعات ذكية<br />تبيع عنك <span className="text-gold">٢٤ ساعة</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg opacity-85">
            علّمها مرة مثل ما تعلّم موظفة حقيقية — وهي ترد على زبائنك في كل منصاتك، بصوت سعودي، وبأسلوبك أنت.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/auth" className="rounded-full bg-gold px-8 py-3 text-lg font-bold text-accent-foreground shadow-soft">ابدأ مجاناً كتاجر 🚀</Link>
          </div>
          <p className="mt-4 text-sm opacity-70">بدون بطاقة — سجل وابدأ التدريب خلال دقيقة</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="font-display mb-10 text-center text-3xl text-primary">ليش التجار يختارون المملكة؟</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border bg-card p-6 shadow-soft">
              <span className="text-3xl">{f.icon}</span>
              <h3 className="font-display mt-3 text-lg text-primary">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-royal py-14 text-center text-primary-foreground">
        <h2 className="font-display text-3xl">جاهز تبيع وأنت نايم؟ 👑</h2>
        <Link to="/auth" className="mt-6 inline-block rounded-full bg-gold px-8 py-3 text-lg font-bold text-accent-foreground">سجل متجرك الحين</Link>
      </section>

      <footer className="py-6 text-center text-sm text-muted-foreground">مملكة المبيعات — صنعت بفخر في السعودية 🇸🇦</footer>
    </div>
  );
}
