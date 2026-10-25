import { toast } from "sonner";

type Go = (tab: "image" | "video" | "tools" | "poster" | "gallery") => void;

const FLOWS: { icon: string; title: string; desc: string; tab: Parameters<Go>[0]; steps: string }[] = [
  { icon: "🧬", title: "تثبيت الشخصية", desc: "نفس الوجه بوضعيات وخلفيات مختلفة", tab: "image", steps: "ارفع صورة الشخص كمرجع ← اختر سيدريم 4.5 ← انسخ قالب جاهز من تحت" },
  { icon: "👗", title: "منسّق الأزياء", desc: "جرّب فساتين وأزياء على نفس الصورة", tab: "image", steps: "ارفع الصورة ← انسخ قالب الأزياء ← عدّل اسم اللبس" },
  { icon: "💎", title: "تحسين وجودة 4K", desc: "رفع الدقة وتفريغ الخلفية", tab: "tools", steps: "افتح الأدوات السريعة ← رفع الدقة ×4" },
  { icon: "🎥", title: "تحريك الصورة", desc: "صورة ثابتة ← فيديو سينمائي", tab: "video", steps: "ارفع الصورة كأول إطار ← اختر Kling ← اكتب الحركة" },
  { icon: "👄", title: "مزامنة الشفاه", desc: "خلّ الشخصية تنطق صوتك", tab: "tools", steps: "الأدوات السريعة ← مزامنة الشفاه ← فيديو + صوت" },
  { icon: "🗂️", title: "معرض الأعمال", desc: "تنزيل ومشاركة وحفظ بالمكتبة", tab: "gallery", steps: "كل أعمالك محفوظة هنا" },
];

const PRESETS: [string, string][] = [
  ["نفس الشخص بخلفية جديدة", "Keep the exact same person, identical face and features from Figure 1. Place them in a luxury cafe at golden hour, cinematic portrait, 85mm lens, soft bokeh, photorealistic"],
  ["وضعية جديدة", "Same person from Figure 1, identical face. New pose: standing, looking over the shoulder, natural smile, studio lighting, high detail, photorealistic"],
  ["تجربة فستان سهرة", "Same person from Figure 1, identical face and body pose. Change outfit to an elegant long evening gown, satin fabric, realistic folds, fashion editorial lighting"],
  ["لبس سعودي تقليدي", "Same person from Figure 1, identical face. Change outfit to traditional elegant Saudi attire, rich embroidery, warm lighting, photorealistic"],
  ["كاجوال عصري", "Same person from Figure 1, identical face. Change outfit to modern casual streetwear, urban background, natural daylight, photorealistic"],
  ["بورتريه سينمائي 4K", "Same person from Figure 1, identical face. Ultra detailed cinematic portrait, sharp eyes, refined skin texture, dramatic rim light, 4K"],
  ["حركة فيديو ناعمة", "Gentle smile, slow head turn toward camera, hair moving softly in the breeze, slow cinematic dolly-in"],
];

export function ProductionHub({ go }: { go: Go }) {
  const copy = async (t: string, tab: Parameters<Go>[0]) => {
    try { await navigator.clipboard.writeText(t); toast.success("انسخ القالب ✅ الصقه في خانة الوصف"); } catch { toast.message(t); }
    go(tab);
  };
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="font-display text-lg">🎬 استوديو الإنتاج</h3>
        <p className="text-sm text-muted-foreground">مسارات جاهزة توصلك لأقوى أدوات الاستوديو بخطوة وحدة.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {FLOWS.map((f) => (
          <button key={f.title} type="button" onClick={() => { go(f.tab); toast.message(f.steps); }}
            className="rounded-2xl border border-border bg-card p-3 text-right transition hover:border-primary hover:bg-muted">
            <div className="text-2xl">{f.icon}</div>
            <div className="mt-1 text-sm font-bold">{f.title}</div>
            <div className="text-[11px] text-muted-foreground">{f.desc}</div>
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">📋 قوالب احترافية (اضغط للنسخ والانتقال)</h4>
        {PRESETS.map(([l, p]) => (
          <button key={l} type="button" onClick={() => copy(p, l.includes("فيديو") ? "video" : "image")}
            className="block w-full rounded-xl border border-border bg-muted/40 p-3 text-right hover:border-primary">
            <div className="text-sm font-semibold">{l}</div>
            <div dir="ltr" className="line-clamp-2 text-left text-[11px] text-muted-foreground">{p}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
