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
type Ov = { id: string; src: string; x: number; y: number; w: number; ar: number; op?: number; fe?: number; rot?: number };
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
  const [stampSize, setStampSize] = useState(0.2);
  const pending = useRef<{ sx: number; sy: number } | null>(null);
  const [src2, setSrc2] = useState("");
  const img2Ref = useRef<HTMLImageElement>(null);
  const [ovs, setOvs] = useState<Ov[]>([]);
  const [osel, setOsel] = useState<string | null>(null);
  const [cut, setCut] = useState(0.3);
  const [noBg, setNoBg] = useState(true);
  const odrag = useRef<{ id: string; sx: number; sy: number; bx: number; by: number } | null>(null);
  const curOv = ovs.find((o) => o.id === osel);
  const rs = useRef<{ sx: number; w: number } | null>(null);
  const updOv = (p: Partial<Ov>) => setOvs((a) => a.map((o) => (o.id === osel ? { ...o, ...p } : o)));
  const nudge = (dx: number, dy: number) => curOv && updOv({ x: curOv.x + dx, y: curOv.y + dy });
  function eraseUnder() { const im = imgRef.current; if (!curOv || !im) return; const h = (curOv.w * im.naturalWidth / im.naturalHeight) / curOv.ar; const b: Box = { id: crypto.randomUUID(), x: curOv.x, y: curOv.y, w: curOv.w, h, text: "", color: "#000", bg: "", size: 3, erase: true }; setBoxes((bs) => [...bs, b]); }
  function addOv(dataUrl: string, ar: number) {
    const o: Ov = { id: crypto.randomUUID(), src: dataUrl, x: 0.35, y: 0.35, w: 0.3, ar };
    setOvs((a) => [...a, o]); setOsel(o.id);
  }
  function cropFrom2(e: React.MouseEvent) {
    const im = img2Ref.current; if (!im) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const W = im.naturalWidth, H = im.naturalHeight, s = Math.round(cut * Math.min(W, H));
    const cx = ((e.clientX - r.left) / r.width) * W, cy = ((e.clientY - r.top) / r.height) * H;
    const x = Math.max(0, Math.min(W - s, cx - s / 2)), y = Math.max(0, Math.min(H - s, cy - s / 2));
    const c = document.createElement("canvas"); c.width = s; c.height = s; const ctx = c.getContext("2d")!;
    ctx.drawImage(im, x, y, s, s, 0, 0, s, s); if (noBg) cleanBg(ctx, s, s); addOv(c.toDataURL("image/png"), 1);
  }
  function addWhole2() {
    const im = img2Ref.current; if (!im) return; const W = im.naturalWidth, H = im.naturalHeight;
    const c = document.createElement("canvas"); c.width = W; c.height = H; const ctx = c.getContext("2d")!; ctx.drawImage(im, 0, 0);
    if (noBg) cleanBg(ctx, W, H); addOv(c.toDataURL("image/png"), W / H);
  }
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
    const ar = imgRef.current ? imgRef.current.naturalWidth / imgRef.current.naturalHeight : 1; const sh = Math.min(1, stampSize * ar);
    if (mode === "src") { pending.current = { sx: Math.max(0, Math.min(1 - stampSize, fx - stampSize / 2)), sy: Math.max(0, Math.min(1 - sh, fy - sh / 2)) }; setMode("dst"); return; }
    if (mode === "dst" && pending.current) {
      const p = pending.current; const w = stampSize, h = sh;
      setStamps((ss) => [...ss, { id: crypto.randomUUID(), sx: p.sx, sy: p.sy, w, h, x: Math.max(0, Math.min(1 - w, fx - w / 2)), y: Math.max(0, Math.min(1 - h, fy - h / 2)) }]);
      pending.current = null; setMode("text"); return;
    }
    let w = 0.6, h = 0.08;
    let x = Math.max(0, Math.min(1 - w, fx - w / 2)), y = Math.max(0, Math.min(1 - h, fy - h / 2));
    const s = sample(x > 0.02 ? x - 0.01 : x + w + 0.005, fy);
    const tc = textColor(imgRef.current!, x, y, w, h, s.bg); if (tc) s.color = tc;
    const fit = inkBounds(imgRef.current!, x, y, w, h, s.color, s.bg, fx);
    if (fit) { x = fit.x; y = fit.y; w = fit.w; h = fit.h; }
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
    const od = odrag.current;
    if (od && viewRef.current) { const r = viewRef.current.getBoundingClientRect(); const dx = (e.clientX - od.sx) / r.width, dy = (e.clientY - od.sy) / r.height; if (Math.abs(dx) + Math.abs(dy) > 0.005) moved.current = true; setOvs((a) => a.map((o) => (o.id === od.id ? { ...o, x: od.bx + dx, y: od.by + dy } : o))); return; }
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
    const IA = W / H;
    for (const o of ovs) { const im = document.querySelector<HTMLImageElement>(`img[data-ov="${o.id}"]`); if (im) { const ow = o.w * W, oh = ow / o.ar; ctx.save(); ctx.globalAlpha = o.op ?? 1; ctx.translate(o.x * W + ow / 2, o.y * H + oh / 2); ctx.rotate(((o.rot ?? 0) * Math.PI) / 180); ctx.drawImage(feather(im, o.fe ?? 0), -ow / 2, -oh / 2, ow, oh); ctx.restore(); } void IA; }
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
        <div style={{ containerType: "inline-size" }} className="relative select-none touch-none" onPointerMove={onMove} onPointerUp={() => { drag.current = null; odrag.current = null; }}>
          <img ref={imgRef} src={src} alt="" className="hidden" onLoad={() => { const c = compose(); if (c) setView(c.toDataURL("image/png")); }} />
          <img ref={viewRef} src={view || src} alt="الكرت" className="w-full rounded-lg" onClick={onImgClick} draggable={false} />
          {ovs.map((o) => (
            <img key={o.id} data-ov={o.id} src={o.src} alt="" draggable={false} onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => { e.stopPropagation(); setOsel(o.id); setSel(null); (e.target as HTMLElement).setPointerCapture(e.pointerId); odrag.current = { id: o.id, sx: e.clientX, sy: e.clientY, bx: o.x, by: o.y }; }}
              className={`absolute ${osel === o.id ? "outline outline-2 outline-dashed outline-primary" : ""}`}
              style={{ left: `${o.x * 100}%`, top: `${o.y * 100}%`, width: `${o.w * 100}%`, opacity: o.op ?? 1, transform: `rotate(${o.rot ?? 0}deg)`, WebkitMaskImage: o.fe ? `radial-gradient(closest-side, #000 ${100 - o.fe}%, transparent)` : undefined, maskImage: o.fe ? `radial-gradient(closest-side, #000 ${100 - o.fe}%, transparent)` : undefined }} />
          ))}
          {curOv && <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => { e.stopPropagation(); (e.target as HTMLElement).setPointerCapture(e.pointerId); rs.current = { sx: e.clientX, w: curOv.w }; }}
            onPointerMove={(e) => { const r0 = rs.current; if (!r0 || !viewRef.current) return; e.stopPropagation(); const dw = (e.clientX - r0.sx) / viewRef.current.getBoundingClientRect().width; setOvs((a) => a.map((o) => (o.id === osel ? { ...o, w: Math.max(0.02, Math.min(1.5, r0.w + dw)) } : o))); }}
            onPointerUp={() => { rs.current = null; }}
            className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow"
            style={{ left: `${(curOv.x + curOv.w) * 100}%`, top: `calc(${curOv.y * 100}% + ${curOv.w * 100 / curOv.ar}cqw)` }} />}
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
      {src && (
        <div className="space-y-2 rounded-xl border bg-card p-3 text-xs">
          <p className="font-bold">🖼️ صورة ثانية (شعار أو نقشة تنسخ منها)</p>
          <label className="block cursor-pointer rounded-lg border border-dashed p-2 text-center">📤 {src2 ? "تغيير الصورة الثانية" : "ارفع الصورة الثانية"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => setSrc2(String(rd.result)); rd.readAsDataURL(f); }} />
          </label>
          {src2 && <>
            <p className="text-muted-foreground">اضغط على الشعار بالصورة الثانية ⬅️ ينحط في الكرت، وبعدها اسحبه لمكانه.</p>
            <img ref={img2Ref} src={src2} alt="الصورة الثانية" className="w-full cursor-crosshair rounded" onClick={cropFrom2} />
            <label>حجم القص <input type="range" min={0.05} max={1} step={0.01} value={cut} onChange={(e) => setCut(+e.target.value)} className="w-full" /></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={noBg} onChange={(e) => setNoBg(e.target.checked)} /> شيل خلفية الشعار عشان يندمج</label>
            <Button size="sm" variant="outline" onClick={addWhole2}>➕ أضف الصورة كاملة للكرت</Button>
          </>}
          {curOv && <div className="space-y-2 border-t pt-2">
            <label>حجم الصورة في الكرت (أو اسحب النقطة بالزاوية) <input type="range" min={0.02} max={1.5} step={0.005} value={curOv.w} onChange={(e) => updOv({ w: +e.target.value })} className="w-full" /></label>
            <label>تدوير <input type="range" min={-180} max={180} step={1} value={curOv.rot ?? 0} onChange={(e) => updOv({ rot: +e.target.value })} className="w-full" /></label>
            <label>الشفافية <input type="range" min={0.1} max={1} step={0.02} value={curOv.op ?? 1} onChange={(e) => updOv({ op: +e.target.value })} className="w-full" /></label>
            <label>نعومة الحواف (دمج) <input type="range" min={0} max={40} step={1} value={curOv.fe ?? 0} onChange={(e) => updOv({ fe: +e.target.value })} className="w-full" /></label>
            <div className="flex flex-wrap items-center gap-1">تحريك دقيق:
              <Button size="sm" variant="outline" onClick={() => nudge(0, -0.003)}>⬆️</Button>
              <Button size="sm" variant="outline" onClick={() => nudge(0, 0.003)}>⬇️</Button>
              <Button size="sm" variant="outline" onClick={() => nudge(0.003, 0)}>➡️</Button>
              <Button size="sm" variant="outline" onClick={() => nudge(-0.003, 0)}>⬅️</Button>
            </div>
            <Button size="sm" variant="outline" onClick={eraseUnder}>🧽 امسح الشعار القديم اللي تحته</Button>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={() => { setOvs((a) => a.filter((o) => o.id !== osel)); setOsel(null); }}>🗑️ حذف الصورة</Button>
              <Button size="sm" variant="secondary" onClick={() => setOsel(null)}>تم</Button>
            </div>
          </div>}
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
    if (di < 85 && di < db * 0.8) mask[i] = 1;
  }
  // dilate 2px to remove anti-aliased edges
  for (let pass = 0; pass < 2; pass++) {
    const m2 = mask.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!mask[y * w + x]) {
      if ((x > 0 && mask[y * w + x - 1]) || (x < w - 1 && mask[y * w + x + 1]) || (y > 0 && mask[(y - 1) * w + x]) || (y < h - 1 && mask[(y + 1) * w + x])) m2[y * w + x] = 1;
    }
    mask.set(m2);
  }
  // fill each masked pixel along the direction whose two ends match best — continues stripes/patterns through the letters
  const src = new Uint8ClampedArray(d); const dirs: number[][] = []; for (let a = 0; a < 180; a += 7.5) { const r = (a * Math.PI) / 180; dirs.push([Math.cos(r), Math.sin(r)]); }
  const reach = (x: number, y: number, dx: number, dy: number) => { let k = 1; while (k < 200) { const xx = Math.round(x + dx * k), yy = Math.round(y + dy * k); if (xx < 0 || yy < 0 || xx >= w || yy >= h) return null; if (!mask[yy * w + xx]) return [(yy * w + xx) * 4, k] as const; k++; } return null; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!mask[i]) continue;
    let best = 1e9, R = 0, G = 0, B = 0, fb: number[] | null = null;
    for (const [dx, dy] of dirs) {
      const p = reach(x, y, dx!, dy!), q = reach(x, y, -dx!, -dy!);
      if (p && q) { const e = Math.abs(src[p[0]]! - src[q[0]]!) + Math.abs(src[p[0] + 1]! - src[q[0] + 1]!) + Math.abs(src[p[0] + 2]! - src[q[0] + 2]!) + (p[1] + q[1]) * 0.15 - (bg ? Math.min(Math.abs(src[p[0]]! - bg[0]!) + Math.abs(src[p[0] + 1]! - bg[1]!) + Math.abs(src[p[0] + 2]! - bg[2]!), Math.abs(src[q[0]]! - bg[0]!) + Math.abs(src[q[0] + 1]! - bg[1]!) + Math.abs(src[q[0] + 2]! - bg[2]!)) * 0.5 : 0); if (e < best) { best = e; const t = p[1] / (p[1] + q[1]); R = src[p[0]]! * (1 - t) + src[q[0]]! * t; G = src[p[0] + 1]! * (1 - t) + src[q[0] + 1]! * t; B = src[p[0] + 2]! * (1 - t) + src[q[0] + 2]! * t; } }
      else if (!fb && (p || q)) { const o = (p || q)![0]; fb = [src[o]!, src[o + 1]!, src[o + 2]!]; }
    }
    const o = i * 4; if (best < 1e9) { d[o] = R; d[o + 1] = G; d[o + 2] = B; } else if (fb) { d[o] = fb[0]!; d[o + 1] = fb[1]!; d[o + 2] = fb[2]!; } d[o + 3] = 255;
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
  if (best <= 60) return "";
  const t = rgb(col)!; let R = 0, G = 0, B = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { const dt = Math.abs(d[i]! - t[0]!) + Math.abs(d[i + 1]! - t[1]!) + Math.abs(d[i + 2]! - t[2]!); const db = Math.abs(d[i]! - m[0]!) + Math.abs(d[i + 1]! - m[1]!) + Math.abs(d[i + 2]! - m[2]!); if (dt < 60 && db > best * 0.7) { R += d[i]!; G += d[i + 1]!; B += d[i + 2]!; n++; } }
  return n ? `rgb(${Math.round(R / n)},${Math.round(G / n)},${Math.round(B / n)})` : col;
}

/** Make pixels similar to the corner colour transparent, with soft edges, so a pasted logo blends in. */
function cleanBg(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const im = ctx.getImageData(0, 0, w, h), d = im.data;
  const cs = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4];
  const cd = (a: number, b: number) => Math.abs(d[a]! - d[b]!) + Math.abs(d[a + 1]! - d[b + 1]!) + Math.abs(d[a + 2]! - d[b + 2]!);
  const best = cs.reduce((p, o) => (cs.filter((q) => cd(o, q) < 40).length > cs.filter((q) => cd(p, q) < 40).length ? o : p), cs[0]!);
  const bg = [d[best]!, d[best + 1]!, d[best + 2]!];
  let gone = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i]! - bg[0]!) + Math.abs(d[i + 1]! - bg[1]!) + Math.abs(d[i + 2]! - bg[2]!) < 40) gone++;
  if (gone > (d.length / 4) * 0.99) return; // crop is all logo — keep it as is
  for (let i = 0; i < d.length; i += 4) {
    const df = Math.abs(d[i]! - bg[0]!) + Math.abs(d[i + 1]! - bg[1]!) + Math.abs(d[i + 2]! - bg[2]!);
    if (df < 40) d[i + 3] = 0; else if (df < 90) d[i + 3] = Math.round(((df - 40) / 50) * d[i + 3]!);
  }
  ctx.putImageData(im, 0, 0);
}

/** Tight bounding box of the ink-coloured text line around the tap point. */
function inkBounds(img: HTMLImageElement, x: number, y: number, w: number, h: number, ink: string, bg: string, fx: number) {
  const W = img.naturalWidth, H = img.naturalHeight; const pw = Math.max(1, Math.round(w * W)), ph = Math.max(1, Math.round(h * H));
  const c = document.createElement("canvas"); c.width = pw; c.height = ph; const ctx = c.getContext("2d")!;
  ctx.drawImage(img, x * W, y * H, pw, ph, 0, 0, pw, ph); const d = ctx.getImageData(0, 0, pw, ph).data;
  const ic = rgb(ink), bc = rgb(bg); if (!ic || !bc) return null;
  const col = new Uint32Array(pw), row = new Uint32Array(ph);
  for (let yy = 0; yy < ph; yy++) for (let xx = 0; xx < pw; xx++) { const o = (yy * pw + xx) * 4; const di = Math.abs(d[o]! - ic[0]!) + Math.abs(d[o + 1]! - ic[1]!) + Math.abs(d[o + 2]! - ic[2]!); const db = Math.abs(d[o]! - bc[0]!) + Math.abs(d[o + 1]! - bc[1]!) + Math.abs(d[o + 2]! - bc[2]!); if (di < 85 && di < db * 0.8) { col[xx]!++; row[yy]!++; } }
  // grow horizontally from tap point; stop at a gap wider than ~1.5 text heights
  let t = -1, b = -1; for (let yy = 0; yy < ph; yy++) if (row[yy]! > 1) { if (t < 0) t = yy; b = yy; }
  if (t < 0) return null; const th = b - t + 1, gap = Math.max(6, th * 1.5);
  const cx = Math.max(0, Math.min(pw - 1, Math.round((fx - x) * W)));
  let l = cx, r = cx, miss = 0; for (let xx = cx; xx >= 0; xx--) { if (col[xx]) { l = xx; miss = 0; } else if (++miss > gap) break; }
  miss = 0; for (let xx = cx; xx < pw; xx++) { if (col[xx]) { r = xx; miss = 0; } else if (++miss > gap) break; }
  if (r - l < 3) return null; const pad = Math.max(3, th * 0.25);
  const X = x * W + l - pad, Y = y * H + t - pad;
  return { x: Math.max(0, X / W), y: Math.max(0, Y / H), w: (r - l + 1 + pad * 2) / W, h: (th + pad * 2) / H };
}

/** Soften logo edges so it blends into the card. */
function feather(im: HTMLImageElement, fe: number): CanvasImageSource {
  if (!fe) return im; const w = im.naturalWidth, h = im.naturalHeight; const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d")!; ctx.drawImage(im, 0, 0); ctx.globalCompositeOperation = "destination-in";
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) / 2); g.addColorStop(Math.max(0, 1 - fe / 100), "#000"); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); return c;
}
