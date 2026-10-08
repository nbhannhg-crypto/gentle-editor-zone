import { toast } from "sonner";
import { MicButton } from "@/components/MicButton";

const TABS: [RegExp, string][] = [
  [/مكتب|شكو/, "complaints"], [/مكتب|ملفات|اصوات|أصوات|تصاميم|فيديو/, "library"], [/محادث|واتس/, "inbox"],
  [/محفظ|رصيد|شحن/, "wallet"], [/زبائن|عملاء/, "customers"], [/حمل/, "campaigns"], [/موعد|مواعيد/, "appointments"],
  [/منتج/, "products"], [/مملكة|العقول/, "mother"], [/مصنع/, "brains"], [/قنوات/, "channels"], [/صوت/, "voice"],
];

/** Floating voice assistant: "افتح المحفظة", "راسلي 9665… قولي له …". */
export function VoiceAssistant({ onTab }: { onTab: (t: string) => void }) {
  const run = (t: string) => {
    const s = t.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    const m = s.match(/(?:راسل|ارسل|أرسل|كلم)\S*\s+(?:الرقم\s+|رقم\s+)?([\d\s+]{7,})\s*(?:قول\S*\s+(?:له|لها)?\s*)?(.*)/);
    if (m) {
      const n = m[1]!.replace(/\D/g, "");
      window.open(`https://wa.me/${n}?text=${encodeURIComponent(m[2] ?? "")}`, "_blank");
      toast.success(`فتحت محادثة ${n}`); return;
    }
    const hit = TABS.find(([r]) => r.test(s));
    if (hit) { onTab(hit[1]); toast.success(`فتحت: ${t}`); return; }
    toast.message(`سمعت: «${t}» — قولي مثلاً «افتح المحفظة» أو «راسلي 9665… قولي له هلا»`);
  };
  return <div className="fixed bottom-4 left-4 z-50 rounded-full shadow-lg"><MicButton onText={run} className="px-4 py-3 text-lg" /></div>;
}
