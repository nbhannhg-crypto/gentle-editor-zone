import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/** Royal marriage-form card drawn on canvas (Saudi emblem, flag, crown). Pure client-side. */
type D = Record<string, string | undefined>;
const W = 1080, H = 2140;
const C = { navy: "#0b1f4d", royal: "#14337a", sky: "#e8efff", gold: "#d4a537", gold2: "#f3d27a", green: "#006c35", white: "#ffffff", ink: "#0b1f4d" };
const PRIVATE = new Set(["name", "phone", "phone2", "handle", "district", "tribe"]);

const SECTIONS: { t: string; f: [string, string][] }[] = [
  { t: "أولاً: البيانات الشخصية", f: [["name", "الاسم الكامل"], ["age", "العمر"], ["nationality", "الجنسية"], ["city", "بلد الإقامة والمدينة"], ["tribe", "العائلة / القبيلة"], ["marital", "الحالة الاجتماعية"], ["kids", "عدد الأطفال"], ["type", "نوع الزواج المطلوب"], ["prev", "هل سبق الزواج؟"], ["health", "الحالة الصحية"]] },
  { t: "ثانياً: المعلومات الشخصية والمعيشية", f: [["edu", "المؤهل التعليمي"], ["job", "الوظيفة / المهنة"], ["jobStatus", "الوضع الوظيفي"], ["height", "الطول"], ["weight", "الوزن"], ["skin", "لون البشرة"], ["religion", "الالتزام الديني"], ["hobbies", "الاهتمامات"], ["traits", "صفات الشخصية"], ["housing", "الاستقرار السكني"]] },
  { t: "ثالثاً: نبذة عن المتقدم / المتقدمة", f: [["about", "نبذة"]] },
  { t: "رابعاً: مواصفات شريك الحياة المطلوبة", f: [["pAge", "العمر المناسب"], ["pNationality", "الجنسية المطلوبة"], ["pCity", "المدينة / بلد الإقامة"], ["pMarital", "الحالة الاجتماعية"], ["pEdu", "المستوى التعليمي"], ["pLooks", "المواصفات الشكلية"], ["pTraits", "الصفات المطلوبة"], ["pTerms", "الشروط الأساسية"], ["pNo", "أمور لا تنازل عنها"]] },
  { t: "خامساً: معلومات إضافية مهمة", f: [["moveCity", "الانتقال لمدينة أخرى"], ["abroad", "الزواج من خارج البلد"], ["after", "السكن بعد الزواج"], ["when", "موعد الزواج المتوقع"], ["extra", "معلومات إضافية"]] },
  { t: "سادساً: بيانات التواصل", f: [["phone", "رقم التواصل"], ["callTime", "الوقت المناسب للتواصل"]] },
];

function rr(x: CanvasRenderingContext2D, a: number, b: number, w: number, h: number, r: number) { x.beginPath(); x.roundRect(a, b, w, h, r); }
function fit(x: CanvasRenderingContext2D, t: string, max: number) { if (x.measureText(t).width <= max) return t; let s = t; while (s.length > 1 && x.measureText(s + "…").width > max) s = s.slice(0, -1); return s + "…"; }

function emblem(x: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  x.save(); x.translate(cx, cy); x.scale(s, s); x.fillStyle = C.gold; x.strokeStyle = C.gold;
  // palm trunk
  x.fillRect(-3, -10, 6, 40);
  for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.45; x.beginPath(); x.ellipse(Math.cos(a) * 18, -12 + Math.sin(a) * 14, 20, 5, a, 0, Math.PI * 2); x.fill(); }
  // crossed swords
  x.lineWidth = 4; x.lineCap = "round";
  for (const d of [1, -1]) { x.beginPath(); x.moveTo(-30 * d, 30); x.quadraticCurveTo(0, 26, 32 * d, 6); x.stroke(); x.fillRect(-34 * d - 4, 26, 8, 10); }
  x.restore();
}
function flag(x: CanvasRenderingContext2D, a: number, b: number, w: number, h: number) {
  x.save(); rr(x, a, b, w, h, 6); x.fillStyle = C.green; x.fill(); x.fillStyle = C.white; x.textAlign = "center"; x.font = `700 ${h * 0.2}px Tajawal`;
  x.fillText("لا إله إلا الله محمد رسول الله", a + w / 2, b + h * 0.45, w * 0.86);
  x.fillRect(a + w * 0.2, b + h * 0.68, w * 0.6, 3); x.beginPath(); x.moveTo(a + w * 0.2, b + h * 0.68); x.lineTo(a + w * 0.15, b + h * 0.74); x.lineTo(a + w * 0.22, b + h * 0.72); x.fill();
  x.restore();
}
function crown(x: CanvasRenderingContext2D, cx: number, cy: number) {
  x.save(); x.fillStyle = C.gold; x.beginPath(); x.moveTo(cx - 70, cy + 30); x.lineTo(cx - 80, cy - 20); x.lineTo(cx - 40, cy + 5); x.lineTo(cx, cy - 35); x.lineTo(cx + 40, cy + 5); x.lineTo(cx + 80, cy - 20); x.lineTo(cx + 70, cy + 30); x.closePath(); x.fill();
  x.fillStyle = C.navy; for (const d of [-80, 0, 80]) { x.beginPath(); x.arc(cx + d, cy - (d ? 22 : 38), 7, 0, Math.PI * 2); x.fillStyle = C.gold2; x.fill(); }
  x.restore();
}

export async function drawMarriageCard(cv: HTMLCanvasElement, o: { code: string; gender: string; data: D; mode: "public" | "private"; note?: string | undefined }) {
  try { await document.fonts.load("700 30px Tajawal"); await document.fonts.load("500 24px 'IBM Plex Sans Arabic'"); } catch { /* ignore */ }
  cv.width = W; cv.height = H; const x = cv.getContext("2d")!; x.direction = "rtl";
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#dfe8ff"); g.addColorStop(0.5, "#f6f9ff"); g.addColorStop(1, "#dfe8ff"); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = C.gold; x.lineWidth = 10; rr(x, 12, 12, W - 24, H - 24, 30); x.stroke(); x.lineWidth = 2; rr(x, 28, 28, W - 56, H - 56, 24); x.stroke();
  // header
  const hg = x.createLinearGradient(0, 40, 0, 330); hg.addColorStop(0, C.navy); hg.addColorStop(1, C.royal); rr(x, 40, 40, W - 80, 300, 26); x.fillStyle = hg; x.fill();
  emblem(x, W - 130, 130, 1.5); flag(x, 70, 75, 150, 100); crown(x, W / 2, 95);
  x.textAlign = "center"; x.fillStyle = C.white; x.font = "800 76px Tajawal"; x.fillText("خطابة أم ندى", W / 2, 205);
  rr(x, W / 2 - 150, 222, 300, 46, 23); x.fillStyle = C.gold; x.fill(); x.fillStyle = C.navy; x.font = "800 28px Tajawal"; x.fillText("♥ ثقة وأمان ♥", W / 2, 255);
  x.fillStyle = C.gold2; x.font = "700 22px Tajawal"; x.fillText("المملكة العربية السعودية • خدمة خطابة موثوقة بالحلال • كل شيء بالحلال وبالتسهيل", W / 2, 312, W - 140);
  // code bar
  rr(x, 140, 355, W - 280, 60, 30); x.fillStyle = C.navy; x.fill(); x.fillStyle = C.white; x.font = "800 30px Tajawal";
  x.fillText(`${o.gender === "female" ? "👰 عروس للزواج" : "🤵 عريس للزواج"}  •  رقم الطلب \u2066#${o.code}\u2069`, W / 2, 396, W - 320);
  x.fillStyle = C.ink; x.font = "700 22px Tajawal"; x.fillText("استمارة طلب زواج شاملة — سرية تامة ومصداقية عالية", W / 2, 445);
  // sections
  let y = 470; const pad = 50, colW = (W - pad * 2 - 20) / 2;
  for (const s of SECTIONS) {
    const items = s.f.filter(([k]) => !(o.mode === "public" && PRIVATE.has(k)));
    if (!items.length) continue;
    const isLong = s.f.length === 1;
    rr(x, W / 2 - 300, y, 600, 44, 22); x.fillStyle = C.navy; x.fill(); x.fillStyle = C.white; x.textAlign = "center"; x.font = "800 24px Tajawal"; x.fillText(s.t, W / 2, y + 31); y += 54;
    if (isLong) {
      rr(x, pad, y, W - pad * 2, 74, 18); x.fillStyle = C.white; x.fill(); x.strokeStyle = "#c9d6f5"; x.lineWidth = 2; x.stroke();
      x.textAlign = "right"; x.fillStyle = C.ink; x.font = "500 21px 'IBM Plex Sans Arabic'"; const t = (o.data[items[0]![0]] || "—").replace(/\s+/g, " ");
      const half = Math.ceil(t.length / 2); x.fillText(fit(x, t.slice(0, half > 70 ? 70 : t.length), W - pad * 2 - 30), W - pad - 16, y + 30); if (t.length > 70) x.fillText(fit(x, t.slice(70), W - pad * 2 - 30), W - pad - 16, y + 60);
      y += 86; continue;
    }
    const rows = Math.ceil(items.length / 2);
    items.forEach(([k, l], i) => {
      const col = i % 2, row = Math.floor(i / 2); const bx = col === 0 ? W - pad - colW : pad, by = y + row * 44;
      rr(x, bx, by, colW, 38, 19); x.fillStyle = C.white; x.fill(); x.strokeStyle = "#c9d6f5"; x.lineWidth = 2; x.stroke();
      x.textAlign = "right"; x.fillStyle = C.royal; x.font = "800 19px Tajawal"; const lab = `${l}:`; x.fillText(lab, bx + colW - 14, by + 26);
      const lw = x.measureText(lab).width; x.fillStyle = C.ink; x.font = "500 19px 'IBM Plex Sans Arabic'"; x.fillText(fit(x, o.data[k]?.trim() || "—", colW - lw - 40), bx + colW - 22 - lw, by + 26);
    });
    y += rows * 44 + 10;
  }
  // terms
  y += 6;
  rr(x, pad, y, W - pad * 2, 150, 20); x.fillStyle = C.navy; x.fill(); x.strokeStyle = C.gold; x.lineWidth = 3; x.stroke();
  x.textAlign = "center"; x.fillStyle = C.gold2; x.font = "800 24px Tajawal"; x.fillText("🤝 شروطنا الواضحة بالحلال", W / 2, y + 34);
  x.fillStyle = C.white; x.font = "600 19px 'IBM Plex Sans Arabic'";
  ["لا دفع قبل إيجاد الطرف المناسب وقبول مبدئي من الطرفين", "عندها 500 ريال ضمان جدية فقط • و 1500 ريال بعد إتمام الزواج", "وإذا ما تم النصيب نبحث لك عن طرف آخر بإذن الله"].forEach((t, i) => x.fillText(t, W / 2, y + 68 + i * 28, W - pad * 2 - 30));
  y += 162;
  const badges = ["🔞 للبالغين 18+", "🔒 سرية البيانات", "✅ التحقق والمصداقية", "🤲 جدية واحترام", "🚫 لا نطلب رموز OTP"]; const bw = (W - pad * 2 - 40) / 5;
  badges.forEach((b, i) => { const bx = W - pad - (i + 1) * bw - i * 10; rr(x, bx, y, bw, 48, 14); x.fillStyle = C.royal; x.fill(); x.fillStyle = C.white; x.font = "700 16px Tajawal"; x.fillText(b, bx + bw / 2, y + 30, bw - 10); });
  y += 60;
  if (o.note?.trim()) { x.fillStyle = C.ink; x.font = "700 19px Tajawal"; x.fillText(fit(x, o.note.trim(), W - 120), W / 2, y + 20); y += 32; }
  rr(x, 180, y, W - 360, 64, 32); const fg = x.createLinearGradient(180, 0, W - 180, 0); fg.addColorStop(0, C.gold); fg.addColorStop(1, C.gold2); x.fillStyle = fg; x.fill();
  x.fillStyle = C.navy; x.font = "800 28px Tajawal"; x.fillText("💬 واتساب: 966580158578", W / 2, y + 42);
  x.font = "700 20px Tajawal"; x.fillText(o.mode === "public" ? "🔒 البيانات الخاصة محجوبة • للتواصل أرسل رقم الطلب على الواتساب • حساباتنا a14141000@" : "نسخة خاصة بصاحب الطلب • حساباتنا الرسمية a14141000@", W / 2, y + 92, W - 120);
}

export function MarriageCardView({ code, gender, data, note, allowPrivate = true, defaultMode = "public" }: { code: string; gender: string; data: D; note?: string | undefined; allowPrivate?: boolean; defaultMode?: "public" | "private" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<"public" | "private">(allowPrivate ? defaultMode : "public");
  useEffect(() => { if (ref.current) void drawMarriageCard(ref.current, { code, gender, data, mode, note }); }, [code, gender, data, mode, note]);
  const blob = () => new Promise<Blob>((res, rej) => ref.current!.toBlob((b) => (b ? res(b) : rej(new Error("x"))), "image/png"));
  const name = `ام-ندى-${code}-${mode === "public" ? "نشر" : "خاص"}.png`;
  const dl = async () => { const u = URL.createObjectURL(await blob()); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 3000); };
  const share = async () => { try { const f = new File([await blob()], name, { type: "image/png" }); if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], title: "خطابة أم ندى" }); else { await dl(); toast.message("انحفظ الكرت، أرسله من الصور"); } } catch { /* cancelled */ } };
  return (
    <div dir="rtl" className="space-y-2">
      {allowPrivate && <div className="grid grid-cols-2 gap-2">{([["public", "📢 نسخة النشر (محجوبة)"], ["private", "🔐 نسخة خاصة كاملة"]] as const).map(([m, l]) => <button key={m} onClick={() => setMode(m)} className={`rounded-xl border px-2 py-2 text-xs font-bold ${mode === m ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>{l}</button>)}</div>}
      <canvas ref={ref} className="h-auto w-full rounded-2xl shadow-soft" />
      <div className="flex gap-2"><button onClick={() => void dl()} className="flex-1 rounded-xl bg-primary py-2 text-sm font-bold text-primary-foreground">📥 حفظ الكرت كصورة</button><button onClick={() => void share()} className="flex-1 rounded-xl border-2 border-gold bg-background py-2 text-sm font-bold">📤 مشاركة</button></div>
    </div>
  );
}
