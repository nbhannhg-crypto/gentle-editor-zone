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

type Box = { id: string; x: number; y: number; w: number; h: number; text: string; color: string; bg: string; size: number; erase: boolean; ink?: string };
type Stamp = { id: string; sx: number; sy: number; w: number; h: number; x: number; y: number };
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
  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [mode, setMode] = useState<"text" | "src" | "dst">("text");
  const [stampSize, setStampSize] = useState(0.15);
  const pending = useRef<{ sx: number; sy: number } | null>(null);
  const cur = boxes.find((b) => b.id === sel);
  const eraseKey = boxes.filter((b) => b.erase).map((b) => [b.x, b.y, b.w, b.h].map((n) => n.toFixed(3)).join(",")).join("|") + "#" + boxes.map((b) => b.ink).join(",") + "#" + stamps.map((t) => [t.sx, t.sy, t.w, t.h, t.x, t.y].join(",")).join("|");
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
    const orig = document.createElement("canvas"); orig.width = W; orig.height = H; orig.getContext("2d")!.drawImage(img, 0, 0);
    for (const t of stamps) ctx.drawImage(orig, t.sx * W, t.sy * H, t.w * W, t.h * H, t.x * W, t.y * H, t.w * W, t.h * H);
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
    if (mode === "src") { pending.current = { sx: Math.max(0, Math.min(1 - stampSize, fx - stampSize / 2)), sy: Math.max(0, Math.min(1 - stampSize, fy - stampSize / 2)) }; setMode("dst"); return; }
    if (mode === "dst" && pending.current) {
      const p = pending.current; const w = stampSize, h = stampSize;
      setStamps((ss) => [...ss, { id: crypto.randomUUID(), sx: p.sx, sy: p.sy, w, h, x: Math.max(0, Math.min(1 - w, fx - w / 2)), y: Math.max(0, Math.min(1 - h, fy - h / 2)) }]);
      pending.current = null; setMode("text"); return;
    }
    const w = 0.4, h = 0.07;
    const x = Math.max(0, Math.min(1 - w, fx - w / 2)), y = Math.max(0, Math.min(1 - h, fy - h / 2));
    const s = sample(x > 0.02 ? x - 0.01 : x + w + 0.005, fy);
    const tc = textColor(imgRef.current!, x, y, w, h, s.bg); if (tc) s.color = tc;
    const th = textHeight(imgRef.current!, x, y, w, h, s.color, s.bg);
    const size = th ? Math.max(1, Math.min(15, +(th * 100 * 1.25).toFixed(1))) : 3.5;
    const b: Box = { id: crypto.randomUUID(), x, y, w, h, text: "", bg: s.bg, color: s.color, ink: s.color, size, erase: true };
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
      {src && (
        <div className="space-y-2 rounded-xl border bg-card p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={mode === "text" ? "secondary" : "default"} onClick={() => { pending.current = null; setMode(mode === "text" ? "src" : "text"); }}>
              {mode === "text" ? "📋 نسخ شعار/نقشة" : mode === "src" ? "اضغط على الشعار اللي تبي تنسخه" : "اضغط على المكان اللي تبي تحطه فيه"}
            </Button>
            {stamps.length > 0 && <Button size="sm" variant="outline" onClick={() => setStamps((ss) => ss.slice(0, -1))}>↩️ تراجع عن آخر نسخ</Button>}
          </div>
          <label>حجم الجزء المنسوخ <input type="range" min={0.03} max={0.5} step={0.01} value={stampSize} onChange={(e) => setStampSize(+e.target.value)} className="w-full" /></label>
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

function rgb(c?: string) { if (!c) return null; if (c.startsWith("#")) return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); const m = c.match(/\d+/g); return m ? m.slice(0, 3).map(Number) : null; }

/** Erase only the text strokes (ink-coloured pixels); every other pixel (patterns, logos) stays untouched. */
function inpaint(ctx: CanvasRenderingContext2D, W: number, H: number, b: { x: number; y: number; w: number; h: number; ink?: string; bg?: string }) {
  const x0 = Math.max(0, Math.round(b.x * W)), y0 = Math.max(0, Math.round(b.y * H));
  const x1 = Math.min(W, Math.round((b.x + b.w) * W)), y1 = Math.min(H, Math.round((b.y + b.h) * H));
  const w = x1 - x0, h = y1 - y0; if (w < 2 || h < 2) return;
  const data = ctx.getImageData(x0, y0, w, h); const d = data.data;
  const ink = rgb(b.ink), bg = rgb(b.bg);
  const dist = (o: number, c: number[]) => Math.abs(d[o]! - c[0]!) + Math.abs(d[o + 1]! - c[1]!) + Math.abs(d[o + 2]! - c[2]!);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (!ink) { mask[i] = 1; continue; }
    const di = dist(o, ink); const db = bg ? dist(o, bg) : 999;
    if (di < 90 && di < db) mask[i] = 1;
  }
  // dilate 2px to remove anti-aliased edges
  for (let pass = 0; pass < 2; pass++) {
    const m2 = mask.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!mask[y * w + x]) {
      if ((x > 0 && mask[y * w + x - 1]) || (x < w - 1 && mask[y * w + x + 1]) || (y > 0 && mask[(y - 1) * w + x]) || (y < h - 1 && mask[(y + 1) * w + x])) m2[y * w + x] = 1;
    }
    mask.set(m2);
  }
  // fill masked pixels from known neighbours, layer by layer
  let left = mask.reduce((a, v) => a + v, 0), guard = 0;
  while (left > 0 && guard++ < 400) {
    const fill: [number, number, number, number][] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!mask[i]) continue;
      let r = 0, g = 0, bb = 0, n = 0;
      for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
        const xx = x + k, yy = y + j; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const ii = yy * w + xx; if (mask[ii]) continue; const o = ii * 4; r += d[o]!; g += d[o + 1]!; bb += d[o + 2]!; n++;
      }
      if (n) fill.push([i, r / n, g / n, bb / n]);
    }
    if (!fill.length) break;
    for (const [i, r, g, bb] of fill) { const o = i * 4; d[o] = r; d[o + 1] = g; d[o + 2] = bb; d[o + 3] = 255; mask[i] = 0; left--; }
  }
  ctx.putImageData(data, x0, y0);
}

/** Height of the original text (fraction of image width) measured from ink-coloured rows. */
function textHeight(img: HTMLImageElement, x: number, y: number, w: number, h: number, ink: string, bg: string) {
  const W = img.naturalWidth, H = img.naturalHeight; const c = document.createElement("canvas");
  const pw = Math.max(1, Math.round(w * W)), ph = Math.max(1, Math.round(h * H)); c.width = pw; c.height = ph;
  const ctx = c.getContext("2d")!; ctx.drawImage(img, x * W, y * H, pw, ph, 0, 0, pw, ph);
  const d = ctx.getImageData(0, 0, pw, ph).data; const ic = rgb(ink), bc = rgb(bg); if (!ic || !bc) return 0;
  let top = -1, bot = -1;
  for (let yy = 0; yy < ph; yy++) { let hit = 0; for (let xx = 0; xx < pw; xx++) { const o = (yy * pw + xx) * 4; const di = Math.abs(d[o]! - ic[0]!) + Math.abs(d[o + 1]! - ic[1]!) + Math.abs(d[o + 2]! - ic[2]!); const db = Math.abs(d[o]! - bc[0]!) + Math.abs(d[o + 1]! - bc[1]!) + Math.abs(d[o + 2]! - bc[2]!); if (di < 90 && di < db) hit++; } if (hit > 1) { if (top < 0) top = yy; bot = yy; } }
  return top < 0 ? 0 : (bot - top + 1) / W;
}

function textColor(img: HTMLImageElement, x: number, y: number, w: number, h: number, bg: string) {
  const c = document.createElement("canvas"); const W = img.naturalWidth, H = img.naturalHeight;
  const pw = Math.max(1, Math.round(w * W)), ph = Math.max(1, Math.round(h * H));
  c.width = pw; c.height = ph; const ctx = c.getContext("2d")!;
  ctx.drawImage(img, x * W, y * H, pw, ph, 0, 0, pw, ph);
  const d = ctx.getImageData(0, 0, pw, ph).data; const m = bg.match(/\d+/g)?.map(Number) || [0, 0, 0];
  let best = -1, col = "";
  for (let i = 0; i < d.length; i += 16) { const diff = Math.abs(d[i]! - m[0]!) + Math.abs(d[i + 1]! - m[1]!) + Math.abs(d[i + 2]! - m[2]!); if (diff > best) { best = diff; col = `rgb(${d[i]!},${d[i + 1]!},${d[i + 2]!})`; } }
  return best > 60 ? col : "";
}
