import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type GuideItem = { id: string; t: string; d: string; hidden?: boolean };
const KEY = "site_guide_v1";

export const GUIDE_DEFAULTS: GuideItem[] = [
  { id: "g1", t: "🎧 مكالمة السلك", d: "اشبك السلك بين الجوالين ← افتح «مكالمة المملكة» ← شغّل زر 🎧 ← اضغط 📞 وخلها تسمع وترد." },
  { id: "g2", t: "🎤 استنساخ الصوت", d: "سجّل أو ارفع مقطع واضح 15-30 ثانية بدون إزعاج ← اختر عام أو خاص ← «استنساخ وحفظ» ← اضغط «اختر»." },
  { id: "g3", t: "📲 الواتساب", d: "افتح «لوحة الواتسابات» ← أضف رقم وصوّر الكود ← اضغط زر الرقم يفتح لوحته ← اختر الموظفة وشغّل الرد." },
  { id: "g4", t: "🎯 تعليم الموظفة", d: "اكتب كلام الزبون وردك بلهجتك ← حفظ ← تطبّقه في المكالمة والواتس فوراً وما تنساه." },
];

async function loadGuide(): Promise<GuideItem[]> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", KEY).maybeSingle();
  try { const v = JSON.parse(data?.value ?? ""); if (Array.isArray(v)) return v; } catch { /* default */ }
  return GUIDE_DEFAULTS;
}

/** زر مغلق يفتح تعليمات الموقع كاملة */
export function SiteGuideButton() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<GuideItem[]>(GUIDE_DEFAULTS);
  useEffect(() => { loadGuide().then(setItems); }, []);
  const shown = items.filter((i) => !i.hidden);
  return (
    <div>
      <Button variant="outline" className="w-full rounded-2xl py-6 text-base" onClick={() => setOpen((o) => !o)}>
        📖 تعليمات الموقع {open ? "▲" : "▼"}
      </Button>
      {open && (
        <div className="mt-3 grid gap-2 animate-in fade-in slide-in-from-top-2 sm:grid-cols-2">
          {shown.map((g, i) => (
            <div key={g.id} style={{ animationDelay: `${i * 60}ms` }}
              className="rounded-xl bg-secondary p-3 text-sm text-secondary-foreground animate-in fade-in zoom-in-95">
              <b className="block">{g.t}</b><span className="whitespace-pre-line text-xs leading-relaxed">{g.d}</span>
            </div>
          ))}
          {!shown.length && <p className="text-sm text-muted-foreground">لا توجد تعليمات حالياً.</p>}
        </div>
      )}
    </div>
  );
}

/** محرر التعليمات للملكة (الأدمن) */
export function SiteGuideEditor() {
  const [items, setItems] = useState<GuideItem[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { loadGuide().then(setItems); }, []);
  const up = (i: number, p: Partial<GuideItem>) => setItems((a) => a.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: number) => setItems((a) => {
    const b = [...a]; const j = i + d; if (j < 0 || j >= b.length) return a; const t = b[i]!; b[i] = b[j]!; b[j] = t; return b;
  });
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("app_settings").upsert({ key: KEY, value: JSON.stringify(items) }, { onConflict: "key" });
    setSaving(false);
    if (error) toast.error("تعذر الحفظ"); else toast.success("تم حفظ التعليمات للجميع ✅");
  };
  return (
    <div className="space-y-3">
      {items.map((g, i) => (
        <div key={g.id} className={`space-y-2 rounded-xl border p-3 ${g.hidden ? "opacity-50" : ""}`}>
          <Input value={g.t} onChange={(e) => up(i, { t: e.target.value })} placeholder="العنوان" />
          <Textarea value={g.d} onChange={(e) => up(i, { d: e.target.value })} placeholder="الشرح" rows={3} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => move(i, -1)}>⬆️</Button>
            <Button size="sm" variant="outline" onClick={() => move(i, 1)}>⬇️</Button>
            <Button size="sm" variant="outline" onClick={() => up(i, { hidden: !g.hidden })}>{g.hidden ? "👁️ إظهار" : "🙈 إخفاء"}</Button>
            <Button size="sm" variant="destructive" onClick={() => setItems((a) => a.filter((_, j) => j !== i))}>🗑️ حذف</Button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setItems((a) => [...a, { id: crypto.randomUUID(), t: "✨ تعليمة جديدة", d: "" }])}>➕ إضافة تعليمة</Button>
        <Button variant="outline" onClick={() => setItems(GUIDE_DEFAULTS)}>↩️ الافتراضي</Button>
        <Button onClick={save} disabled={saving}>{saving ? "..." : "💾 حفظ ونشر"}</Button>
      </div>
    </div>
  );
}
