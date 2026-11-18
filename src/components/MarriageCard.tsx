import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { siTiktok, siSnapchat, siInstagram, siX, siYoutube, siFacebook, siThreads, siTelegram, siWhatsapp, type SimpleIcon } from "simple-icons";
import roseUrl from "@/assets/card-rose.png";

/** Royal marriage-form card drawn on canvas (Saudi emblem, flag, crown). Pure client-side. */
type D = Record<string, string | undefined>;
const W = 1080;
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
function wrap(x: CanvasRenderingContext2D, t: string, max: number, lines: number) {
  const out: string[] = []; let cur = "";
  for (const w of t.split(/\s+/)) { const n = cur ? cur + " " + w : w; if (x.measureText(n).width > max && cur) { out.push(cur); cur = w; } else cur = n; }
  if (cur) out.push(cur);
  if (out.length > lines) { out.length = lines; out[lines - 1] = fit(x, out[lines - 1] + " …", max); }
  return out;
}

export type CardOpts = { terms?: boolean; socials?: boolean; tagline?: string; badge?: string; live?: string; footer?: string; handle?: string; whatsapp?: string; termsText?: string };
export const CARD_DEFAULTS: Required<CardOpts> = {
  terms: true, socials: true,
  tagline: "كل شيء بالحلال وبالتسهيل",
  badge: "خدمتنا لكم بكل ثقة",
  live: "نفتح بث مباشر يومياً على تيك توك 🔴 تابعنا",
  footer: "معاً نحو زواج ناجح وحياة أسرية سعيدة",
  handle: "a14141000",
  whatsapp: "966580158578",
  termsText: "لا دفع قبل إيجاد الطرف المناسب وقبول مبدئي من الطرفين\nعندها 500 ريال ضمان جدية فقط • و 1500 ريال بعد إتمام الزواج\nوإذا ما تم النصيب نبحث لك عن طرف آخر بإذن الله",
};
export function cardOpts(o?: CardOpts | null): Required<CardOpts> {
  const r = { ...CARD_DEFAULTS } as Record<string, unknown>;
  for (const [k, v] of Object.entries(o || {})) if (v !== undefined && v !== null && v !== "") r[k] = v;
  return r as Required<CardOpts>;
}

const ICON: Record<string, string> = {
  name: "👤", age: "📅", nationality: "🌐", city: "📍", tribe: "👨‍👩‍👧", marital: "💍", kids: "👶", type: "💞", prev: "✔️", health: "🩺",
  edu: "🎓", job: "💼", jobStatus: "🧑‍💼", height: "📏", weight: "⚖️", skin: "🎨", religion: "🕌", hobbies: "⭐", traits: "💙", housing: "🏠",
  about: "✍️", pAge: "📅", pNationality: "🌐", pCity: "📍", pMarital: "💍", pEdu: "🎓", pLooks: "👤", pTraits: "⭐", pTerms: "✅", pNo: "⛔",
  moveCity: "🚗", abroad: "✈️", after: "🏡", when: "🕰️", extra: "💬", phone: "📞", callTime: "⏰",
};
const SEC_ICON = ["👤", "🏠", "⭐", "💎", "➕", "📞"];

let roseImg: HTMLImageElement | null = null;
function loadRose() {
  if (roseImg?.complete) return Promise.resolve(roseImg);
  return new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.onload = () => { roseImg = i; res(i); }; i.onerror = () => res(null); i.src = roseUrl; });
}

function emblem(x: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  x.save(); x.translate(cx, cy); x.scale(s, s);
  const g = x.createLinearGradient(-30, -40, 30, 40); g.addColorStop(0, C.gold2); g.addColorStop(1, C.gold); x.fillStyle = g; x.strokeStyle = g;
  x.fillRect(-3, -10, 6, 40);
  for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.45; x.beginPath(); x.ellipse(Math.cos(a) * 18, -12 + Math.sin(a) * 14, 20, 5, a, 0, Math.PI * 2); x.fill(); }
  x.lineWidth = 4; x.lineCap = "round";
  for (const d of [1, -1]) { x.beginPath(); x.moveTo(-30 * d, 30); x.quadraticCurveTo(0, 26, 32 * d, 6); x.stroke(); x.fillRect(-34 * d - 4, 26, 8, 10); }
  x.restore();
}
function flag(x: CanvasRenderingContext2D, a: number, b: number, w: number, h: number) {
  x.save(); x.shadowColor = "rgba(0,0,0,.35)"; x.shadowBlur = 10; rr(x, a, b, w, h, 8); x.fillStyle = C.green; x.fill(); x.shadowBlur = 0;
  x.fillStyle = C.white; x.textAlign = "center"; x.font = `700 ${h * 0.2}px Amiri, Tajawal`;
  x.fillText("لا إله إلا الله محمد رسول الله", a + w / 2, b + h * 0.45, w * 0.86);
  x.fillRect(a + w * 0.2, b + h * 0.68, w * 0.6, 3); x.beginPath(); x.moveTo(a + w * 0.2, b + h * 0.68); x.lineTo(a + w * 0.15, b + h * 0.74); x.lineTo(a + w * 0.22, b + h * 0.72); x.fill();
  x.restore();
}
function crown(x: CanvasRenderingContext2D, cx: number, cy: number, s = 1) {
  x.save(); x.translate(cx, cy); x.scale(s, s);
  const g = x.createLinearGradient(0, -40, 0, 30); g.addColorStop(0, C.gold2); g.addColorStop(1, "#a87a1c");
  x.shadowColor = "rgba(0,0,0,.35)"; x.shadowBlur = 12; x.fillStyle = g; x.beginPath(); x.moveTo(-70, 30); x.lineTo(-80, -20); x.lineTo(-40, 5); x.lineTo(0, -35); x.lineTo(40, 5); x.lineTo(80, -20); x.lineTo(70, 30); x.closePath(); x.fill();
  x.shadowBlur = 0; x.fillStyle = C.royal; x.fillRect(-66, 18, 132, 8);
  for (const d of [-80, 0, 80]) { x.beginPath(); x.arc(d, d ? -22 : -38, 8, 0, Math.PI * 2); x.fillStyle = C.gold2; x.fill(); }
  for (const d of [-36, 0, 36]) { x.beginPath(); x.arc(d, 22, 4, 0, Math.PI * 2); x.fillStyle = "#3b82f6"; x.fill(); }
  x.restore();
}
function heart(x: CanvasRenderingContext2D, cx: number, cy: number, s: number, col: string) {
  x.save(); x.translate(cx, cy); x.scale(s, s); x.fillStyle = col; x.beginPath(); x.moveTo(0, 6); x.bezierCurveTo(-12, -4, -6, -14, 0, -7); x.bezierCurveTo(6, -14, 12, -4, 0, 6); x.fill(); x.restore();
}
function pill(x: CanvasRenderingContext2D, a: number, b: number, w: number, h: number) {
  x.save(); x.shadowColor = "rgba(11,31,77,.18)"; x.shadowBlur = 8; x.shadowOffsetY = 3; rr(x, a, b, w, h, h / 2);
  const g = x.createLinearGradient(0, b, 0, b + h); g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#eef3ff"); x.fillStyle = g; x.fill(); x.restore();
  rr(x, a, b, w, h, h / 2); x.strokeStyle = "#b9c9f0"; x.lineWidth = 1.5; x.stroke();
}
function navyBar(x: CanvasRenderingContext2D, a: number, b: number, w: number, h: number) {
  x.save(); x.shadowColor = "rgba(11,31,77,.35)"; x.shadowBlur = 10; x.shadowOffsetY = 3; rr(x, a, b, w, h, h / 2);
  const g = x.createLinearGradient(0, b, 0, b + h); g.addColorStop(0, C.royal); g.addColorStop(1, C.navy); x.fillStyle = g; x.fill(); x.restore();
  rr(x, a, b, w, h, h / 2); x.strokeStyle = C.gold; x.lineWidth = 2; x.stroke();
}
function iconDot(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, emo: string) {
  x.save(); const g = x.createLinearGradient(0, cy - r, 0, cy + r); g.addColorStop(0, C.royal); g.addColorStop(1, C.navy);
  x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fillStyle = g; x.fill(); x.strokeStyle = C.gold2; x.lineWidth = 1.5; x.stroke();
  x.textAlign = "center"; x.textBaseline = "middle"; x.font = `${r * 1.05}px 'Noto Color Emoji', sans-serif`; x.fillText(emo, cx, cy + 1); x.restore();
}

const SOC: { k: string; ic: SimpleIcon; bg: string | string[]; fg?: string }[] = [
  { k: "tiktok", ic: siTiktok, bg: "#000000" },
  { k: "snap", ic: siSnapchat, bg: "#FFFC00", fg: "#000000" },
  { k: "insta", ic: siInstagram, bg: ["#feda75", "#fa7e1e", "#d62976", "#962fbf", "#4f5bd5"] },
  { k: "x", ic: siX, bg: "#000000" },
  { k: "yt", ic: siYoutube, bg: "#FF0000" },
  { k: "fb", ic: siFacebook, bg: "#1877F2" },
  { k: "threads", ic: siThreads, bg: "#000000" },
  { k: "tg", ic: siTelegram, bg: "#26A5E4" },
  { k: "wa", ic: siWhatsapp, bg: "#25D366" },
];
function socialTile(x: CanvasRenderingContext2D, a: number, b: number, s: number, it: (typeof SOC)[number]) {
  x.save(); x.shadowColor = "rgba(0,0,0,.3)"; x.shadowBlur = 8; x.shadowOffsetY = 3; rr(x, a, b, s, s, s * 0.24);
  if (Array.isArray(it.bg)) { const g = x.createLinearGradient(a, b + s, a + s, b); it.bg.forEach((c, i) => g.addColorStop(i / (it.bg.length - 1), c)); x.fillStyle = g; } else x.fillStyle = it.bg;
  x.fill(); x.restore();
  const p = new Path2D(it.ic.path); const sc = (s * 0.58) / 24, off = s * 0.21;
  const draw = (dx: number, dy: number, col: string) => { x.save(); x.translate(a + off + dx, b + off + dy); x.scale(sc, sc); x.fillStyle = col; x.fill(p); x.restore(); };
  if (it.k === "tiktok") { draw(-2, -1.5, "#25F4EE"); draw(2, 1.5, "#FE2C55"); draw(0, 0, "#ffffff"); }
  else draw(0, 0, it.fg || "#ffffff");
}

function render(x: CanvasRenderingContext2D, H: number, o: { code: string; gender: string; data: D; mode: "public" | "private"; note?: string | undefined; opts: Required<CardOpts>; rose: HTMLImageElement | null }) {
  const op = o.opts; x.direction = "rtl"; x.textBaseline = "alphabetic";
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#d6e2ff"); g.addColorStop(0.35, "#f7faff"); g.addColorStop(0.7, "#e6eeff"); g.addColorStop(1, "#cfdcff"); x.fillStyle = g; x.fillRect(0, 0, W, H);
  // soft sparkles
  x.save(); for (let i = 0; i < 70; i++) { const px = (i * 397) % W, py = (i * 733) % H; x.globalAlpha = 0.25; x.fillStyle = "#ffffff"; x.beginPath(); x.arc(px, py, (i % 3) + 1, 0, Math.PI * 2); x.fill(); } x.restore();
  // frame
  x.strokeStyle = C.gold; x.lineWidth = 10; rr(x, 12, 12, W - 24, H - 24, 34); x.stroke(); x.strokeStyle = C.navy; x.lineWidth = 3; rr(x, 26, 26, W - 52, H - 52, 28); x.stroke();
  x.strokeStyle = C.gold2; x.lineWidth = 1.5; rr(x, 34, 34, W - 68, H - 68, 24); x.stroke();
  if (o.rose) {
    const rs = 250; x.drawImage(o.rose, 20, 120, rs, rs);
    x.save(); x.translate(W - 20, 120); x.scale(-1, 1); x.drawImage(o.rose, 0, 0, rs, rs); x.restore();
    x.save(); x.translate(20, H - 20); x.scale(1, -1); x.drawImage(o.rose, 0, 0, 220, 220); x.restore();
    x.save(); x.translate(W - 20, H - 20); x.scale(-1, -1); x.drawImage(o.rose, 0, 0, 220, 220); x.restore();
  }
  // header cloud
  crown(x, W / 2, 80, 1.05);
  x.save(); x.shadowColor = "rgba(11,31,77,.35)"; x.shadowBlur = 18; rr(x, 230, 118, W - 460, 150, 75); x.fillStyle = "#ffffff"; x.fill(); x.restore();
  rr(x, 230, 118, W - 460, 150, 75); x.strokeStyle = C.navy; x.lineWidth = 6; x.stroke(); rr(x, 240, 128, W - 480, 130, 65); x.strokeStyle = C.gold; x.lineWidth = 2; x.stroke();
  x.textAlign = "center"; const tg = x.createLinearGradient(0, 140, 0, 240); tg.addColorStop(0, C.royal); tg.addColorStop(1, C.navy); x.fillStyle = tg;
  x.font = "700 92px 'Reem Kufi', Tajawal"; x.fillText("خطابة أم ندى", W / 2, 228);
  navyBar(x, W / 2 - 150, 250, 300, 50); x.fillStyle = C.white; x.font = "800 30px Tajawal"; x.fillText("ثقة وأمان", W / 2, 286); heart(x, W / 2 - 110, 275, 1.1, C.white); heart(x, W / 2 + 110, 275, 1.1, C.white);
  // left ribbon (tagline) + right shield (badge)
  x.save(); x.translate(150, 85); x.rotate(-0.12); navyBar(x, -110, -38, 220, 76); x.fillStyle = C.white; x.font = "800 22px Tajawal";
  wrap(x, op.tagline, 190, 2).forEach((l, i, a) => x.fillText(l, 0, (a.length === 1 ? 8 : -4 + i * 26))); x.restore();
  x.save(); x.beginPath(); x.moveTo(W - 230, 40); x.lineTo(W - 70, 40); x.lineTo(W - 70, 120); x.quadraticCurveTo(W - 150, 175, W - 150, 175); x.quadraticCurveTo(W - 230, 120, W - 230, 120); x.closePath();
  const sg = x.createLinearGradient(0, 40, 0, 175); sg.addColorStop(0, C.royal); sg.addColorStop(1, C.navy); x.fillStyle = sg; x.shadowColor = "rgba(0,0,0,.3)"; x.shadowBlur = 10; x.fill(); x.shadowBlur = 0; x.strokeStyle = C.gold; x.lineWidth = 2.5; x.stroke();
  x.fillStyle = C.white; x.font = "800 20px Tajawal"; x.textAlign = "center"; x.fillText("💎", W - 150, 72); wrap(x, op.badge, 140, 2).forEach((l, i) => x.fillText(l, W - 150, 102 + i * 24)); x.restore();
  // flag + emblem small
  flag(x, 70, 180, 120, 80); emblem(x, W - 130, 225, 1.05);
  // handle + subtitle
  navyBar(x, W / 2 - 200, 315, 400, 58); x.fillStyle = C.white; x.font = "800 36px Tajawal"; x.textAlign = "center"; x.fillText(`\u2066${op.handle}\u2069`, W / 2, 357); iconDot(x, W / 2 + 165, 344, 20, "👤"); heart(x, W / 2 - 165, 346, 1.4, C.white);
  navyBar(x, 110, 388, W - 220, 54); x.fillStyle = C.white; x.font = "800 26px Tajawal"; x.fillText("استمارة طلب زواج شاملة – سرية تامة ومصداقية عالية", W / 2, 424, W - 260);
  // code
  x.fillStyle = C.navy; x.font = "800 26px Tajawal"; x.fillText(`${o.gender === "female" ? "👰 عروس للزواج" : "🤵 عريس للزواج"}   •   رقم الطلب \u2066#${o.code}\u2069`, W / 2, 478, W - 200);

  let y = 500; const pad = 56, gap = 16, colW = (W - pad * 2 - gap) / 2, rowH = 44;
  SECTIONS.forEach((s, si) => {
    const items = s.f.filter(([k]) => !(o.mode === "public" && PRIVATE.has(k)));
    if (!items.length) return;
    x.font = "800 27px Tajawal"; const tw = Math.min(W - 200, x.measureText(s.t).width + 110);
    navyBar(x, W / 2 - tw / 2, y, tw, 50); x.fillStyle = C.white; x.textAlign = "center"; x.fillText(s.t, W / 2 - 18, y + 35); iconDot(x, W / 2 + tw / 2 - 30, y + 25, 19, SEC_ICON[si] || "⭐"); y += 62;
    if (s.f.length === 1) {
      x.font = "500 21px 'IBM Plex Sans Arabic'"; const lines = wrap(x, (o.data[items[0]![0]] || "—").replace(/\s+/g, " "), W - pad * 2 - 110, 3); const h = 30 + lines.length * 30;
      pill(x, pad, y, W - pad * 2, h); iconDot(x, W - pad - 32, y + h / 2, 22, ICON[items[0]![0]] || "✍️");
      x.textAlign = "right"; x.fillStyle = C.ink; lines.forEach((l, i) => x.fillText(l, W - pad - 66, y + 36 + i * 30)); y += h + 14; return;
    }
    items.forEach(([k, l], i) => {
      const col = i % 2, row = Math.floor(i / 2); const bx = col === 0 ? W - pad - colW : pad, by = y + row * (rowH + 8);
      pill(x, bx, by, colW, rowH); iconDot(x, bx + colW - 24, by + rowH / 2, 17, ICON[k] || "⭐");
      x.textAlign = "right"; x.fillStyle = C.navy; x.font = "800 19px Tajawal"; const lab = `${l}:`; x.fillText(lab, bx + colW - 50, by + 29);
      const lw = x.measureText(lab).width; x.fillStyle = "#1f2f5c"; x.font = "500 19px 'IBM Plex Sans Arabic'"; x.fillText(fit(x, o.data[k]?.trim() || "—", colW - lw - 76), bx + colW - 58 - lw, by + 29);
    });
    y += Math.ceil(items.length / 2) * (rowH + 8) + 12;
  });

  // terms (optional)
  if (op.terms) {
    const tl = op.termsText.split("\n").map((t) => t.trim()).filter(Boolean).slice(0, 5); const h = 60 + tl.length * 32;
    navyBar(x, pad, y, W - pad * 2, h); x.textAlign = "center"; x.fillStyle = C.gold2; x.font = "800 26px Tajawal"; x.fillText("🤝 شروطنا الواضحة بالحلال", W / 2, y + 38);
    x.fillStyle = C.white; x.font = "600 20px 'IBM Plex Sans Arabic'"; tl.forEach((t, i) => x.fillText(t, W / 2, y + 74 + i * 32, W - pad * 2 - 50)); y += h + 16;
  }
  // badges
  const badges: [string, string][] = [["👥", "الخدمة مخصصة للبالغين بعمر 18 فأكثر"], ["⚖️", "سرية البيانات وعدم نشرها"], ["✅", "التحقق من المعلومات قدر الإمكان"], ["🤝", "التعامل بجدية واحترام"], ["🔒", "خصوصيتك أمانة لدينا"]];
  const bw = (W - pad * 2 - 4 * 10) / 5;
  badges.forEach(([e, t], i) => { const bx = W - pad - (i + 1) * bw - i * 10; x.save(); x.shadowColor = "rgba(0,0,0,.3)"; x.shadowBlur = 8; rr(x, bx, y, bw, 108, 18); const bg = x.createLinearGradient(0, y, 0, y + 108); bg.addColorStop(0, C.royal); bg.addColorStop(1, C.navy); x.fillStyle = bg; x.fill(); x.restore();
    x.textAlign = "center"; x.font = "30px 'Noto Color Emoji', sans-serif"; x.fillText(e, bx + bw / 2, y + 40); x.fillStyle = C.white; x.font = "700 16px Tajawal"; wrap(x, t, bw - 16, 2).forEach((l, j) => x.fillText(l, bx + bw / 2, y + 70 + j * 20)); });
  y += 124;
  // live / custom line
  if (op.live.trim()) { navyBar(x, pad + 60, y, W - pad * 2 - 120, 52); x.fillStyle = C.gold2; x.font = "800 24px Tajawal"; x.textAlign = "center"; x.fillText(fit(x, op.live.trim(), W - pad * 2 - 170), W / 2, y + 35); y += 64; }
  if (o.note?.trim()) { x.fillStyle = C.navy; x.font = "700 21px Tajawal"; x.textAlign = "center"; x.fillText(fit(x, o.note.trim(), W - 140), W / 2, y + 22); y += 38; }
  // footer row: slogan | whatsapp | brand seal
  const fy = y; x.save(); x.shadowColor = "rgba(0,0,0,.25)"; x.shadowBlur = 10; rr(x, 60, fy + 10, 250, 110, 26); x.fillStyle = "#fffaf0"; x.fill(); x.restore(); rr(x, 60, fy + 10, 250, 110, 26); x.strokeStyle = C.gold; x.lineWidth = 3; x.stroke();
  x.fillStyle = C.navy; x.font = "700 24px 'Reem Kufi', Tajawal"; x.textAlign = "center"; wrap(x, op.footer, 220, 2).forEach((l, i) => x.fillText(l, 185, fy + 58 + i * 34));
  navyBar(x, 325, fy, 430, 130); socialTile(x, 345, fy + 30, 70, SOC.find((s) => s.k === "wa")!);
  x.fillStyle = C.white; x.font = "700 20px Tajawal"; x.textAlign = "center"; x.fillText("للتواصل والاستفسار عبر الواتساب", 580, fy + 48); x.font = "800 40px Tajawal"; x.fillText(`\u2066${op.whatsapp}\u2069`, 580, fy + 98, 300);
  navyBar(x, 770, fy, 250, 130); crown(x, 895, fy + 28, 0.32); x.fillStyle = C.gold2; x.font = "700 28px 'Reem Kufi', Tajawal"; x.fillText("خطابة أم ندى", 895, fy + 82); x.font = "800 22px Tajawal"; x.fillText("ثقة وأمان", 895, fy + 112);
  y = fy + 148;
  // socials
  if (op.socials) {
    navyBar(x, 150, y, W - 300, 54); x.fillStyle = C.white; x.font = "800 24px Tajawal"; x.textAlign = "center"; x.fillText(`جميع حساباتنا في مواقع التواصل  \u2066@${op.handle}\u2069`, W / 2, y + 36, W - 340); y += 68;
    const list = SOC.filter((s) => s.k !== "wa").concat(SOC.filter((s) => s.k === "wa")); const ts = 64, tg2 = 18, total = list.length * ts + (list.length - 1) * tg2; let sx = (W - total) / 2;
    for (const it of list) { socialTile(x, sx, y, ts, it); sx += ts + tg2; }
    y += ts + 14; x.fillStyle = C.navy; x.font = "700 18px Tajawal"; x.fillText("تيك توك • سناب شات • إنستغرام • إكس • يوتيوب • فيسبوك • ثريدز • تيليجرام • واتساب", W / 2, y + 12, W - 140); y += 26;
  }
  x.fillStyle = C.royal; x.font = "700 18px Tajawal"; x.textAlign = "center";
  x.fillText(o.mode === "public" ? "🔒 البيانات الخاصة محجوبة • للتواصل أرسل رقم الطلب على الواتساب" : "🔐 نسخة خاصة بصاحب الطلب — لا تُنشر", W / 2, y + 22, W - 140);
  return y + 60;
}

export async function drawMarriageCard(cv: HTMLCanvasElement, o: { code: string; gender: string; data: D; mode: "public" | "private"; note?: string | undefined; opts?: CardOpts | null | undefined }) {
  try { await Promise.all(["700 30px Tajawal", "800 30px Tajawal", "500 24px 'IBM Plex Sans Arabic'", "700 40px 'Reem Kufi'", "700 20px Amiri"].map((f) => document.fonts.load(f))); } catch { /* ignore */ }
  const rose = await loadRose(); const opts = cardOpts(o.opts);
  const tmp = document.createElement("canvas"); tmp.width = W; tmp.height = 4000;
  const h = Math.ceil(render(tmp.getContext("2d")!, 4000, { ...o, opts, rose }));
  cv.width = W; cv.height = h; render(cv.getContext("2d")!, h, { ...o, opts, rose });
}

export function MarriageCardView({ code, gender, data, note, opts, allowPrivate = true, defaultMode = "public" }: { code: string; gender: string; data: D; note?: string | undefined; opts?: CardOpts | null | undefined; allowPrivate?: boolean; defaultMode?: "public" | "private" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<"public" | "private">(allowPrivate ? defaultMode : "public");
  useEffect(() => { if (ref.current) void drawMarriageCard(ref.current, { code, gender, data, mode, note, opts }); }, [code, gender, data, mode, note, opts]);
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
