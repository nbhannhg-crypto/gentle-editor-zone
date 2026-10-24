import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { designTool, designVideoCheck } from "@/lib/design.functions";

type ToolId = "bg" | "upscale" | "faceswap" | "lipsync";
const TOOLS: { id: ToolId; icon: string; title: string; desc: string }[] = [
  { id: "bg", icon: "✂️", title: "تفريغ الخلفية", desc: "PNG شفاف بضغطة" },
  { id: "upscale", icon: "💎", title: "رفع الدقة", desc: "وضوح ×2 أو ×4" },
  { id: "faceswap", icon: "🎭", title: "تبديل الوجه", desc: "وجه على صورة" },
  { id: "lipsync", icon: "👄", title: "مزامنة الشفاه", desc: "صوت على فيديو" },
];
const MAX = 10 * 1024 * 1024;

function toDataUrl(f: File) {
  return new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error("تعذّر قراءة الملف")); r.readAsDataURL(f); });
}

function Drop({ label, accept, value, onPick }: { label: string; accept: string; value: string | null; onPick: (d: string | null) => void }) {
  const isVid = value?.startsWith("data:video"); const isAud = value?.startsWith("data:audio");
  return (
    <label className="group relative flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-border bg-muted/40 p-3 text-center transition hover:border-primary hover:bg-muted">
      <input type="file" accept={accept} className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (!f) return; if (f.size > MAX) { toast.error("الحد 10 ميجا"); return; }
        onPick(await toDataUrl(f));
      }} />
      {value ? (
        isVid ? <video src={value} className="max-h-44 rounded-xl" muted playsInline /> :
        isAud ? <div className="space-y-2"><div className="text-3xl">🎵</div><audio src={value} controls className="w-56" /></div> :
        <img src={value} alt={label} className="max-h-44 rounded-xl object-contain" />
      ) : (<><span className="text-3xl opacity-70 transition group-hover:scale-110">⬆️</span><span className="text-sm font-semibold">{label}</span><span className="text-[11px] text-muted-foreground">اضغط للاختيار</span></>)}
      {value && <button type="button" onClick={(e) => { e.preventDefault(); onPick(null); }} className="absolute left-2 top-2 rounded-full bg-background/90 px-2 text-xs shadow">✕</button>}
    </label>
  );
}

export function MagicTools({ onEdit, onSave }: { storeId?: string | undefined; onEdit: (u: string) => void; onSave: (u: string, title: string) => Promise<void> }) {
  const run = useServerFn(designTool);
  const check = useServerFn(designVideoCheck);
  const [tool, setTool] = useState<ToolId>("bg");
  const [image, setImage] = useState<string | null>(null);
  const [face, setFace] = useState<string | null>(null);
  const [video, setVideo] = useState<string | null>(null);
  const [audio, setAudio] = useState<string | null>(null);
  const [scale, setScale] = useState(2);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [out, setOut] = useState<string | null>(null);
  const cur = TOOLS.find((t) => t.id === tool)!;

  const go = async () => {
    setBusy(true); setOut(null); setStatus("جاري المعالجة…");
    try {
      const r = await run({ data: { tool, image: image ?? undefined, face: face ?? undefined, video: video ?? undefined, audio: audio ?? undefined, scale } });
      if (r.error) { toast.error(r.error); return; }
      if (r.url) { setOut(r.url); toast.success("جاهز ✨"); return; }
      for (let i = 0; i < 120; i++) {
        await new Promise((s) => setTimeout(s, 4000));
        const c = await check({ data: { status_url: r.status_url, response_url: r.response_url } });
        if (c.error) { toast.error(c.error); return; }
        if (c.status === "COMPLETED" && c.url) { setOut(c.url); toast.success("جاهز ✨"); return; }
        setStatus(c.status === "IN_QUEUE" ? "بالانتظار في الطابور…" : "يتم التحريك…");
      }
      toast.error("طوّل أكثر من اللازم، جرّب مرة ثانية");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); setStatus(""); }
  };

  const ready = tool === "lipsync" ? !!(video && audio) : tool === "faceswap" ? !!(image && face) : !!image;
  const isVideoOut = tool === "lipsync";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" onClick={() => { setTool(t.id); setOut(null); }}
            className={`rounded-2xl border p-3 text-right transition ${tool === t.id ? "border-primary bg-primary/10 shadow-md ring-2 ring-primary/30" : "border-border bg-card hover:bg-muted"}`}>
            <div className="text-2xl">{t.icon}</div>
            <div className="mt-1 text-sm font-bold">{t.title}</div>
            <div className="text-[11px] text-muted-foreground">{t.desc}</div>
          </button>
        ))}
      </div>

      <div className="space-y-3 rounded-3xl border border-border bg-card p-4 shadow-sm">
        <h3 className="font-display text-lg">{cur.icon} {cur.title}</h3>
        {tool === "lipsync" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Drop label="فيديو الشخصية" accept="video/*" value={video} onPick={setVideo} />
            <Drop label="الملف الصوتي" accept="audio/*" value={audio} onPick={setAudio} />
          </div>
        ) : tool === "faceswap" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Drop label="الصورة الأساسية" accept="image/*" value={image} onPick={setImage} />
            <Drop label="صورة الوجه الجديد" accept="image/*" value={face} onPick={setFace} />
          </div>
        ) : (
          <Drop label="ارفع الصورة" accept="image/*" value={image} onPick={setImage} />
        )}
        {tool === "upscale" && (
          <div className="flex gap-2">{[2, 4].map((s) => (
            <button key={s} type="button" onClick={() => setScale(s)} className={`flex-1 rounded-xl border py-2 text-sm font-bold ${scale === s ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>×{s}</button>
          ))}</div>
        )}
        <Button className="w-full" size="lg" disabled={!ready || busy} onClick={go}>{busy ? status || "جاري…" : `✨ نفّذ ${cur.title}`}</Button>
        <p className="text-center text-[11px] text-muted-foreground">الحد 10 ميجا للملف • مزامنة الشفاه تاخذ من دقيقة لعدة دقائق</p>
      </div>

      {out && (
        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-lg">
          <div className="bg-[repeating-conic-gradient(hsl(var(--muted))_0%_25%,transparent_0%_50%)] bg-[length:20px_20px] p-3">
            {isVideoOut ? <video src={out} controls playsInline className="mx-auto max-h-[60vh] rounded-xl" /> : <img src={out} alt="النتيجة" className="mx-auto max-h-[60vh] rounded-xl object-contain" />}
          </div>
          <div className="flex flex-wrap gap-1.5 p-2">
            <Button size="sm" variant="secondary" onClick={() => onSave(out, cur.title)}>📚 للمكتبة</Button>
            <Button size="sm" variant="outline" onClick={() => window.open(out, "_blank")}>⬇️ تنزيل</Button>
            {!isVideoOut && <Button size="sm" variant="outline" onClick={() => onEdit(out)}>✍️ اكتب عليها</Button>}
            {!isVideoOut && <Button size="sm" variant="outline" onClick={() => { setImage(out); setOut(null); }}>🔁 استخدمها كمدخل</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
