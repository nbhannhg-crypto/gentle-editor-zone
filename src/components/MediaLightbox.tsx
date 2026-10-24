import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export type LbItem = { id: string; kind: string; title: string; url?: string | undefined; transcript?: string };

/** عارض مكبّر مثل ألبوم الجوال: تكبير/تحريك للصور، سرعة وتكرار للفيديو والصوت، تنقل سابق/تالي. */
export function MediaLightbox({ items, index, onClose, onIndex }: { items: LbItem[]; index: number; onClose: () => void; onIndex: (i: number) => void }) {
  const it = items[index];
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const touchX = useRef<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const zoomRef = useRef(zoom); zoomRef.current = zoom;

  const go = (d: number) => { if (!items.length) return; onIndex((index + d + items.length) % items.length); };
  useEffect(() => { setZoom(1); setOff({ x: 0, y: 0 }); }, [index]);
  useEffect(() => { if (mediaRef.current) mediaRef.current.playbackRate = rate; }, [rate, index]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowLeft") go(1); if (e.key === "ArrowRight") go(-1); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  useEffect(() => {
    const el = boxRef.current; if (!el) return;
    const w = (e: WheelEvent) => {
      if (it?.kind !== "image") return;
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      setZoom(Math.min(6, Math.max(1, zoomRef.current * Math.exp(-dy * 0.0015))));
    };
    el.addEventListener("wheel", w, { passive: false });
    return () => el.removeEventListener("wheel", w);
  }, [it?.kind]);
  if (!it) return null;

  const download = () => { if (!it.url) return; const a = document.createElement("a"); a.href = it.url; a.download = it.title; a.target = "_blank"; a.click(); };
  const fullscreen = () => { const v = mediaRef.current as unknown as HTMLElement | null; void v?.requestFullscreen?.(); };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md" dir="rtl">
      <div className="flex items-center justify-between gap-2 border-b p-2">
        <b className="truncate text-sm">{it.title} <span className="text-muted-foreground">({index + 1}/{items.length})</span></b>
        <div className="flex gap-1">
          {it.url && <Button size="sm" variant="secondary" onClick={download}>⬇️</Button>}
          <Button size="sm" variant="secondary" onClick={onClose}>✖️</Button>
        </div>
      </div>
      <div ref={boxRef} className="relative flex flex-1 items-center justify-center overflow-hidden"
        onTouchStart={(e) => { if (zoom === 1) touchX.current = e.touches[0]?.clientX ?? null; }}
        onTouchEnd={(e) => { const s = touchX.current; touchX.current = null; const x = e.changedTouches[0]?.clientX; if (s != null && x != null && Math.abs(x - s) > 60) go(x > s ? 1 : -1); }}>
        {it.kind === "image" && it.url && (
          <img src={it.url} alt={it.title} draggable={false}
            className="max-h-full max-w-full select-none object-contain"
            style={{ transform: `translate(${off.x}px, ${off.y}px) scale(${zoom})`, cursor: zoom > 1 ? "grab" : "zoom-in", touchAction: zoom > 1 ? "none" : "pan-y" }}
            onDoubleClick={() => { setZoom(zoom > 1 ? 1 : 2.5); setOff({ x: 0, y: 0 }); }}
            onPointerDown={(e) => { if (zoom === 1) return; (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y }; }}
            onPointerMove={(e) => { const d = drag.current; if (d) setOff({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y }); }}
            onPointerUp={() => { drag.current = null; }} />
        )}
        {it.kind === "video" && it.url && <video key={it.id} ref={mediaRef} src={it.url} controls autoPlay loop={loop} className="max-h-full max-w-full" />}
        {it.kind === "audio" && it.url && (
          <div className="w-full max-w-md space-y-4 p-6 text-center">
            <div className="flex h-24 items-end justify-center gap-1">
              {Array.from({ length: 32 }, (_, i) => (
                <span key={i} className="w-1.5 animate-pulse rounded-full bg-primary" style={{ height: `${20 + ((i * 37) % 80)}%`, animationDelay: `${(i % 8) * 0.12}s` }} />
              ))}
            </div>
            <audio key={it.id} ref={mediaRef} src={it.url} controls autoPlay loop={loop} className="w-full" />
            {it.transcript && <p className="rounded-md bg-muted p-2 text-sm">💬 {it.transcript}</p>}
          </div>
        )}
        <button aria-label="السابق" onClick={() => go(-1)} className="absolute right-2 rounded-full bg-secondary/80 px-3 py-2 text-lg">›</button>
        <button aria-label="التالي" onClick={() => go(1)} className="absolute left-2 rounded-full bg-secondary/80 px-3 py-2 text-lg">‹</button>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 border-t p-2 text-xs">
        {it.kind === "image" ? <>
          <Button size="sm" variant="secondary" onClick={() => setZoom((z) => Math.min(6, z * 1.4))}>➕ تكبير</Button>
          <Button size="sm" variant="secondary" onClick={() => { const z = Math.max(1, zoom / 1.4); setZoom(z); if (z === 1) setOff({ x: 0, y: 0 }); }}>➖ تصغير</Button>
          <Button size="sm" variant="ghost" onClick={() => { setZoom(1); setOff({ x: 0, y: 0 }); }}>↺ {Math.round(zoom * 100)}%</Button>
        </> : <>
          {[0.75, 1, 1.25, 1.5, 2].map((r) => <Button key={r} size="sm" variant={rate === r ? "default" : "secondary"} onClick={() => setRate(r)}>{r}x</Button>)}
          <Button size="sm" variant={loop ? "default" : "secondary"} onClick={() => setLoop(!loop)}>🔁 تكرار</Button>
          {it.kind === "video" && <Button size="sm" variant="secondary" onClick={fullscreen}>⛶ ملء الشاشة</Button>}
        </>}
      </div>
      <div className="flex gap-1 overflow-x-auto border-t p-2">
        {items.map((x, i) => (
          <button key={x.id} onClick={() => onIndex(i)} className={`h-12 w-12 shrink-0 overflow-hidden rounded-md border text-lg ${i === index ? "ring-2 ring-primary" : "opacity-70"}`}>
            {x.kind === "image" && x.url ? <img src={x.url} alt="" className="h-full w-full object-cover" /> : x.kind === "video" ? "🎬" : "🎙️"}
          </button>
        ))}
      </div>
    </div>
  );
}
