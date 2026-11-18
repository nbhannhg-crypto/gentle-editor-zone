import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/card-editor")({
  head: () => ({
    meta: [
      { title: "محرر الكروت — خطابة أم ندى" },
      { name: "description", content: "ارفع أي كرت واضغط على الكلام لتحذفه وتكتب بداله" },
      { property: "og:title", content: "محرر الكروت — خطابة أم ندى" },
      { property: "og:description", content: "تعديل كتابة الكروت بضغطة" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CardEditor,
});

type Box = { id: string; x: number; y: number; w: number; h: number; text: string; color: string; bg: string; size: number; erase: boolean };
const FONT = "Tajawal, Cairo, sans-serif";

function CardEditor() {
  const [src, setSrc] = useState<string>("");
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const viewRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; bx: number; by: number } | null>(null);
  const moved = useRef(false);

  const [view, setView] = useState<string>("");
  const cur = boxes.find((b) => b.id === sel);
  const eraseKey = boxes.filter((b) => b.erase).map((b) => [b.x, b.y, b.w, b.h].map((n) => n.toFixed(3)).join(",")).join("|");
  useEffect(() => {
    if (!src) return;
    const t = setTimeout(() => { const c = compose(); if (c) setView(c.toDataURL("image/png")); }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, eraseKey]);

  /** Draw the original image and seamlessly fill erased areas from surrounding pixels (no flat patches). */
  function compose() {
    const img = imgRef.current; if (!img || !img.naturalWidth) return null;
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0);
    for (const b of boxes) if (b.erase) inpaint(ctx, W, H, b);
    return c;
  }
  const upd = (p: Partial<Box>) => setBoxes((bs) => bs.map((b) => (b.id === sel ? { ...b, ...p } : b)));

  function sample(fx: number, fy: number) {
    const img = imgRef.current!;
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0);
    const px = Math.max(0, Math.min(c.width - 1, Math.round(fx * c.width)));
    const py = Math.max(0, Math.min(c.height - 1, Math.round(fy * c.height)));
    const d = Array.from(ctx.getImageData(px, py, 1, 1).data) as number[]; const [r0 = 0, g0 = 0, b0 = 0] = d;
    // pick text color as contrast
    const lum = 0.299 * r0 + 0.587 * g0 + 0.114 * b0;
    return { bg: `rgb(${r0},${g0},${b0})`, color: lum > 140 ? "#1a1a1a" : "#ffffff" };
  }

  function onImgClick(e: React.MouseEvent) {
    if (moved.current) { moved.current = false; return; }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    const w = 0.4, h = 0.07;
    const x = Math.max(0, Math.min(1 - w, fx - w / 2)), y = Math.max(0, Math.min(1 - h, fy - h / 2));
    const s = sample(x > 0.02 ? x - 0.01 : x + w + 0.005, fy);
    const tc = textColor(imgRef.current!, x, y, w, h, s.bg); if (tc) s.color = tc;
    const b: Box = { id: crypto.randomUUID(), x, y, w, h, text: "", bg: s.bg, color: s.color, size: 3.5, erase: true };
    setBoxes((bs) => [...bs, b]); setSel(b.id);
  }

  function onDown(e: React.PointerEvent, b: Box) {
    e.stopPropagation(); setSel(b.id);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: b.id, sx: e.clientX, sy: e.clientY, bx: b.x, by: b.y };
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current; if (!d || !viewRef.current) return;
    const r = viewRef.current.getBoundingClientRect();
    const dx = (e.clientX - d.sx) / r.width, dy = (e.clientY - d.sy) / r.height;
    if (Math.abs(dx) + Math.abs(dy) > 0.005) moved.current = true;
    setBoxes((bs) => bs.map((b) => (b.id === d.id ? { ...b, x: d.bx + dx, y: d.by + dy } : b)));
  }

  function load(f?: File) {
    if (!f) return;
    const rd = new FileReader(); rd.onload = () => { setSrc(String(rd.result)); setBoxes([]); setSel(null); }; rd.readAsDataURL(f);
  }

  function download() {
    const c = compose(); if (!c) return;
    const W = c.width, H = c.height; const ctx = c.getContext("2d")!;
    for (const b of boxes) {
      ctx.fillStyle = b.color; ctx.direction = "rtl"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const fs = (b.size / 100) * W; ctx.font = `bold ${fs}px ${FONT}`;
      const lines = b.text.split("\n");
      lines.forEach((ln, i) => ctx.fillText(ln, (b.x + b.w / 2) * W, (b.y + b.h / 2) * H + (i - (lines.length - 1) / 2) * fs * 1.2));
    }
    const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = "card.png"; a.click();
  }

  return (
    <div dir="rtl" className="mx-auto max-w-2xl space-y-3 p-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">✏️ محرر الكروت</h1>
        <Link to="/app" className="text-sm underline">رجوع</Link>
      </div>
      <label className="block cursor-pointer rounded-xl border-2 border-dashed p-4 text-center text-sm">
        📤 {src ? "تغيير الصورة" : "ارفع أي كرت من المعرض"}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => load(e.target.files?.[0])} />
      </label>
      {src && <p className="text-xs text-muted-foreground">اضغط فوق أي كلام بالكرت ⬅️ ينمسح ويطلع لك مربع تكتب فيه. اسحب المربع لتحريكه.</p>}
      {src && (
        <div style={{ containerType: "inline-size" }} className="relative select-none touch-none" onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
          <img ref={imgRef} src={src} alt="" className="hidden" onLoad={() => { const c = compose(); if (c) setView(c.toDataURL("image/png")); }} />
          <img ref={viewRef} src={view || src} alt="الكرت" className="w-full rounded-lg" onClick={onImgClick} draggable={false} />
          {boxes.map((b) => (
            <div key={b.id} onPointerDown={(e) => onDown(e, b)} onClick={(e) => e.stopPropagation()}
              className={`absolute flex items-center justify-center overflow-visible whitespace-pre text-center font-bold leading-tight ${sel === b.id ? "outline outline-2 outline-primary" : ""}`}
              style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%`, background: "transparent", color: b.color, fontSize: `${b.size}cqw`, fontFamily: FONT }}>
              {b.text}
            </div>
          ))}
        </div>
      )}
      {cur && (
        <div className="space-y-2 rounded-xl border bg-card p-3">
          <Textarea autoFocus placeholder="اكتب الكلام الجديد" value={cur.text} onChange={(e) => upd({ text: e.target.value })} />
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label>حجم الخط <input type="range" min={1} max={15} step={0.5} value={cur.size} onChange={(e) => upd({ size: +e.target.value })} className="w-full" /></label>
            <label>عرض المربع <input type="range" min={0.05} max={1} step={0.01} value={cur.w} onChange={(e) => upd({ w: +e.target.value })} className="w-full" /></label>
            <label>ارتفاع المربع <input type="range" min={0.02} max={0.5} step={0.005} value={cur.h} onChange={(e) => upd({ h: +e.target.value })} className="w-full" /></label>
            <div className="flex items-center gap-2">
              <label>لون الكتابة <input type="color" value={toHex(cur.color)} onChange={(e) => upd({ color: e.target.value })} /></label>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={cur.erase} onChange={(e) => upd({ erase: e.target.checked })} /> امسح الكلام القديم تحت المربع</label>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={() => { setBoxes((bs) => bs.filter((b) => b.id !== sel)); setSel(null); }}>🗑️ حذف المربع</Button>
            <Button size="sm" variant="secondary" onClick={() => setSel(null)}>تم</Button>
          </div>
        </div>
      )}
      {src && <Button className="w-full" onClick={download}>⬇️ تنزيل الكرت</Button>}
    </div>
  );
}

function toHex(c: string) {
  if (c.startsWith("#")) return c;
  const m = c.match(/\d+/g); if (!m) return "#000000";
  return "#" + m.slice(0, 3).map((n) => (+n).toString(16).padStart(2, "0")).join("");
}

function inpaint(ctx: CanvasRenderingContext2D, W: number, H: number, b: { x: number; y: number; w: number; h: number }) {
  const x0 = Math.max(1, Math.round(b.x * W)), y0 = Math.max(1, Math.round(b.y * H));
  const x1 = Math.min(W - 2, Math.round((b.x + b.w) * W)), y1 = Math.min(H - 2, Math.round((b.y + b.h) * H));
  const w = x1 - x0, h = y1 - y0; if (w < 2 || h < 2) return;
  const pad = 3;
  const ax = x0 - pad, ay = y0 - pad, aw = w + pad * 2, ah = h + pad * 2;
  const sx = Math.max(0, ax), sy = Math.max(0, ay);
  const data = ctx.getImageData(sx, sy, Math.min(W - sx, aw), Math.min(H - sy, ah));
  const dw = data.width, dh = data.height, d = data.data;
  const at = (x: number, y: number) => ((Math.max(0, Math.min(dh - 1, y)) * dw + Math.max(0, Math.min(dw - 1, x))) * 4);
  const L = x0 - sx - 1, R = x1 - sx, T = y0 - sy - 1, B = y1 - sy;
  const out = new Uint8ClampedArray(d);
  for (let y = T + 1; y < B; y++) for (let x = L + 1; x < R; x++) {
    const wl = 1 / (x - L), wr = 1 / (R - x), wt = 1 / (y - T), wb = 1 / (B - y);
    const pl = at(L, y), pr = at(R, y), pt = at(x, T), pb = at(x, B);
    const ws = wl + wr + wt + wb, o = at(x, y);
    for (let k = 0; k < 3; k++) out[o + k] = (d[pl + k] * wl + d[pr + k] * wr + d[pt + k] * wt + d[pb + k] * wb) / ws;
    out[o + 3] = 255;
  }
  // light blur inside for a natural texture-free blend
  const res = new Uint8ClampedArray(out);
  for (let y = T + 1; y < B; y++) for (let x = L + 1; x < R; x++) {
    const o = at(x, y);
    for (let k = 0; k < 3; k++) { let s = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += out[at(x + i, y + j) + k]; res[o + k] = s / 9; }
  }
  data.data.set(res); ctx.putImageData(data, sx, sy);
}

function textColor(img: HTMLImageElement, x: number, y: number, w: number, h: number, bg: string) {
  const c = document.createElement("canvas"); const W = img.naturalWidth, H = img.naturalHeight;
  const pw = Math.max(1, Math.round(w * W)), ph = Math.max(1, Math.round(h * H));
  c.width = pw; c.height = ph; const ctx = c.getContext("2d")!;
  ctx.drawImage(img, x * W, y * H, pw, ph, 0, 0, pw, ph);
  const d = ctx.getImageData(0, 0, pw, ph).data; const m = bg.match(/\d+/g)?.map(Number) || [0, 0, 0];
  let best = -1, col = "";
  for (let i = 0; i < d.length; i += 16) { const diff = Math.abs(d[i] - m[0]) + Math.abs(d[i + 1] - m[1]) + Math.abs(d[i + 2] - m[2]); if (diff > best) { best = diff; col = `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`; } }
  return best > 60 ? col : "";
}
