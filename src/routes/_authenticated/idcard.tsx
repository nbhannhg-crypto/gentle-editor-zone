import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/idcard")({
  head: () => ({
    meta: [
      { title: "بطاقة توثيق الهوية — خطابة أم ندى" },
      { name: "description", content: "صمّم بطاقة توثيق هوية للمتقدمين بالتعبئة ورفع الصورة وتحميلها" },
      { property: "og:title", content: "بطاقة توثيق الهوية — خطابة أم ندى" },
      { property: "og:description", content: "تعبئة بيانات المتقدم وتوليد بطاقة توثيق فاخرة" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IdCardPage,
});

type F = { nameAr: string; nameEn: string; idNo: string; dobH: string; dobG: string; expH: string; expG: string; place: string; version: string; nationality: string };
const EMPTY: F = { nameAr: "", nameEn: "", idNo: "", dobH: "", dobG: "", expH: "", expG: "", place: "", version: "1", nationality: "سعودي" };
const LABELS: [keyof F, string, string][] = [
  ["nameAr", "الاسم بالعربي", "فيصل بن حامد بن سيف الأحمدي"],
  ["nameEn", "الاسم بالإنجليزي", "ALAHMADI, FAISAL HAMED S"],
  ["idNo", "رقم الهوية / الإقامة", "1029613369"],
  ["dobH", "تاريخ الميلاد هجري", "1402/11/21"],
  ["dobG", "تاريخ الميلاد ميلادي", "09/09/1982"],
  ["expH", "تاريخ الانتهاء هجري", "1452/10/06"],
  ["expG", "تاريخ الانتهاء ميلادي", "29/01/2031"],
  ["place", "مكان الميلاد", "جدة"],
  ["nationality", "الجنسية", "سعودي"],
  ["version", "رقم النسخة", "1"],
];
const AR = (s: string) => s.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d] ?? d);
const W = 1600, H = 1000;

function draw(c: HTMLCanvasElement, f: F, photo: HTMLImageElement | null) {
  const x = c.getContext("2d")!;
  c.width = W; c.height = H;
  // background
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, W, H);
  const card = { l: 40, t: 40, w: W - 80, h: H - 80 };
  x.save();
  x.beginPath(); x.roundRect(card.l, card.t, card.w, card.h, 40); x.clip();
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#eaf6ee"); g.addColorStop(0.5, "#f7fbf8"); g.addColorStop(1, "#e3f2e8");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // guilloche waves
  x.strokeStyle = "rgba(30,140,80,0.10)"; x.lineWidth = 1.5;
  for (let k = 0; k < 40; k++) {
    x.beginPath();
    for (let i = 0; i <= W; i += 10) {
      const y = 120 + k * 22 + Math.sin(i / 60 + k) * 12;
      i === 0 ? x.moveTo(i, y) : x.lineTo(i, y);
    }
    x.stroke();
  }
  // watermark palm + swords
  x.globalAlpha = 0.10; x.strokeStyle = "#1e7a46"; x.lineWidth = 6;
  for (const r of [260, 230, 120]) { x.beginPath(); x.arc(980, 640, r, 0, Math.PI * 2); x.stroke(); }
  x.fillStyle = "#1e7a46"; x.textAlign = "center";
  x.font = "300px serif"; x.fillText("🌴", 980, 720);
  x.globalAlpha = 1;
  // top band
  x.fillStyle = "rgba(30,140,80,0.08)"; x.fillRect(0, 40, W, 200);
  x.restore();
  x.strokeStyle = "#cfe5d6"; x.lineWidth = 3;
  x.beginPath(); x.roundRect(card.l, card.t, card.w, card.h, 40); x.stroke();

  x.direction = "rtl";
  // header right
  x.textAlign = "right"; x.fillStyle = "#1a7a43";
  x.font = "bold 46px 'Noto Kufi Arabic', Tahoma, sans-serif";
  x.fillText("أم ندى", W - 230, 130);
  x.font = "32px 'Noto Kufi Arabic', Tahoma, sans-serif"; x.fillStyle = "#3a6b4f";
  x.fillText("خطابة أم ندى", W - 230, 185);
  // emblem
  x.font = "120px serif"; x.textAlign = "center"; x.fillText("🌴", W - 140, 200);
  x.fillStyle = "#1a7a43"; x.font = "bold 34px serif"; x.fillText("⚔", W - 140, 225);
  // header left
  x.textAlign = "left"; x.direction = "rtl";
  x.font = "bold 58px 'Noto Kufi Arabic', Tahoma, sans-serif"; x.fillStyle = "#22a05a";
  x.textAlign = "right"; x.fillText("بطاقة الهوية", 640, 140);
  x.font = "32px 'Noto Kufi Arabic', Tahoma, sans-serif"; x.fillStyle = "#3a6b4f";
  x.fillText(`رقم النسخة   ${AR(f.version || "1")}`, 640, 195);
  // divider
  x.strokeStyle = "#cfe5d6"; x.lineWidth = 2; x.beginPath(); x.moveTo(80, 250); x.lineTo(W - 80, 250); x.stroke();

  // photo
  const px = 90, py = 290, pw = 320, ph = 400;
  x.fillStyle = "#ffffff"; x.fillRect(px, py, pw, ph);
  if (photo) {
    const r = Math.max(pw / photo.width, ph / photo.height);
    const sw = pw / r, sh = ph / r;
    x.drawImage(photo, (photo.width - sw) / 2, (photo.height - sh) / 2, sw, sh, px, py, pw, ph);
  } else {
    x.fillStyle = "#9bb5a5"; x.textAlign = "center"; x.direction = "rtl";
    x.font = "30px Tahoma"; x.fillText("الصورة الشخصية", px + pw / 2, py + ph / 2);
  }
  // QR-like box + text
  const qy = 720;
  x.fillStyle = "#ffffff"; x.fillRect(px, qy, 140, 140);
  let seed = [...(f.idNo || "0")].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7);
  x.fillStyle = "#111";
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const corner = (i < 3 && j < 3) || (i > 8 && j < 3) || (i < 3 && j > 8);
    if (corner || (seed >> 16) & 1) x.fillRect(px + 10 + i * 10, qy + 10 + j * 10, 10, 10);
  }
  x.fillStyle = "#1a3b2a"; x.font = "bold 24px Tahoma"; x.textAlign = "right"; x.direction = "rtl";
  ["تم التحقق من", "الهوية والجدية", "خطابة أم ندى"].forEach((t, i) => x.fillText(t, px + pw, qy + 40 + i * 36));
  // barcode
  for (let i = 0, bx = px; bx < px + pw; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const w = 2 + (seed % 4);
    if (i % 2 === 0) x.fillRect(bx, 880, w, 46);
    bx += w;
  }

  // name
  x.direction = "rtl"; x.textAlign = "right"; x.fillStyle = "#111";
  x.font = "bold 50px 'Noto Kufi Arabic', Tahoma, sans-serif";
  x.fillText(f.nameAr || "الاسم الكامل", W - 100, 340);
  x.direction = "ltr"; x.textAlign = "right"; x.font = "bold 34px Arial";
  x.fillText((f.nameEn || "FULL NAME").toUpperCase(), W - 100, 395);

  const rows: [string, string, string, string][] = [
    ["ID Number:", f.idNo, "رقم الهوية:", AR(f.idNo)],
    ["Date of Birth:", f.dobG, "تاريخ الميلاد:", AR(f.dobH)],
    ["Expiry Date:", f.expG, "تاريخ الانتهاء:", AR(f.expH)],
  ];
  rows.forEach(([le, lv, ra, rv], i) => {
    const y = 500 + i * 85;
    x.direction = "ltr"; x.textAlign = "left";
    x.font = "32px Arial"; x.fillStyle = "#555"; x.fillText(le, 460, y);
    x.font = "bold 34px Arial"; x.fillStyle = "#111"; x.fillText(lv || "—", 680, y);
    x.direction = "rtl"; x.textAlign = "right";
    x.font = "32px Tahoma"; x.fillStyle = "#555"; x.fillText(ra, W - 100, y);
    x.font = "bold 36px Tahoma"; x.fillStyle = "#111"; x.fillText(rv || "—", W - 340, y);
  });
  x.direction = "rtl"; x.textAlign = "right";
  x.font = "32px Tahoma"; x.fillStyle = "#555"; x.fillText("مكان الميلاد:", W - 100, 755);
  x.font = "bold 36px Tahoma"; x.fillStyle = "#111"; x.fillText(f.place || "—", W - 340, 755);
  x.font = "32px Tahoma"; x.fillStyle = "#555"; x.fillText("الجنسية:", W - 100, 840);
  x.font = "bold 36px Tahoma"; x.fillStyle = "#111"; x.fillText(f.nationality || "—", W - 340, 840);
  // footer note
  x.font = "22px Tahoma"; x.fillStyle = "#6b8a77";
  x.fillText("بطاقة توثيق داخلية لمنصة خطابة أم ندى — ليست وثيقة حكومية", W - 100, 915);
}

function IdCardPage() {
  const [f, setF] = useState<F>(() => {
    if (typeof window === "undefined") return EMPTY;
    return EMPTY;
  });
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    try { const s = localStorage.getItem("idcard_draft"); if (s) setF({ ...EMPTY, ...JSON.parse(s) }); } catch { /* */ }
  }, []);
  useEffect(() => {
    localStorage.setItem("idcard_draft", JSON.stringify(f));
    if (ref.current) draw(ref.current, f, photo);
  }, [f, photo]);
  useEffect(() => { document.fonts?.ready.then(() => ref.current && draw(ref.current, f, photo)); }, []); // eslint-disable-line

  const onPhoto = (file?: File) => {
    if (!file) return;
    const img = new Image();
    img.onload = () => setPhoto(img);
    img.src = URL.createObjectURL(file);
  };
  const download = () => {
    const a = document.createElement("a");
    a.download = `هوية-${f.nameAr || "متقدم"}.png`;
    a.href = ref.current!.toDataURL("image/png");
    a.click();
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background p-3 md:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-foreground">🪪 بطاقة توثيق الهوية</h1>
          <Link to="/app" className="text-sm text-primary underline">رجوع للوحة</Link>
        </div>
        <canvas ref={ref} className="w-full rounded-xl border border-border shadow" />
        <div className="flex flex-wrap gap-2">
          <Button onClick={download}>📥 تحميل البطاقة</Button>
          <Button variant="outline" onClick={() => { setF(EMPTY); setPhoto(null); }}>🧹 تفريغ</Button>
        </div>
        <div className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-muted-foreground">📷 الصورة الشخصية</span>
            <Input type="file" accept="image/*" onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
          {LABELS.map(([k, label, ph]) => (
            <label key={k} className="space-y-1">
              <span className="text-sm text-muted-foreground">{label}</span>
              <Input value={f[k]} placeholder={`مثال: ${ph}`} dir={k === "nameEn" ? "ltr" : "rtl"}
                onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
