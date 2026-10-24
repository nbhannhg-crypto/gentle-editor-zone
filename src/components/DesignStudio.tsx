import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { designImage, designVideoStart, designVideoCheck, designEnhance } from "@/lib/design.functions";

type Tab = "image" | "video" | "poster" | "gallery" | "guide";
type Item = { url: string; kind: "image" | "video"; prompt: string; at: number };
const HIST = "design_studio_history";

const FONTS = [
  ["Aref Ruqaa", "رقعة"], ["Amiri", "أميري"], ["Reem Kufi", "كوفي"], ["Lalezar", "لاله‌زار"],
  ["Marhey", "مرحي"], ["Cairo", "القاهرة"], ["Tajawal", "تجوال"], ["Lemonada", "ليمونادة"], ["Mada", "مدى"],
] as const;
const FONT_LINK = "https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@400;700&family=Amiri:wght@400;700&family=Reem+Kufi:wght@400;700&family=Lalezar&family=Marhey:wght@400;700&family=Cairo:wght@400;800&family=Tajawal:wght@400;800&family=Lemonada:wght@400;700&family=Mada:wght@400;800&display=swap";

const STYLES = [
  ["", "بدون"], ["cinematic film still, dramatic lighting", "سينمائي"], ["soft romantic pastel, dreamy bokeh", "رومانسي حالم"],
  ["golden hour, warm sunset glow", "غروب ذهبي"], ["rainy night, neon reflections, moody", "ليل ومطر"],
  ["luxury editorial, elegant, high fashion", "فخامة"], ["watercolor painting", "ألوان مائية"], ["anime style, studio ghibli", "أنمي"],
  ["oil painting, classical", "زيتي كلاسيكي"], ["minimal, clean, negative space", "بسيط"], ["arabic calligraphy art, ornamental", "خط عربي فني"],
] as const;

function loadHist(): Item[] { try { return JSON.parse(localStorage.getItem(HIST) || "[]"); } catch { return []; } }
function pushHist(it: Item[]) { const all = [...it, ...loadHist()].slice(0, 120); localStorage.setItem(HIST, JSON.stringify(all)); }

async function saveToLibrary(storeId: string | undefined, blob: Blob, title: string) {
  if (!storeId) { toast.error("ما لقيت متجرك"); return; }
  const ext = blob.type.includes("png") ? "png" : blob.type.includes("video") ? "mp4" : "jpg";
  const path = `${storeId}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from("media-library").upload(path, blob, { contentType: blob.type || "image/jpeg" });
  if (up.error) throw up.error;
  const kind = blob.type.startsWith("video") ? "video" : "image";
  const { error } = await supabase.from("media_library").insert({ store_id: storeId, kind, title: title.slice(0, 80), code: "", path, mime: blob.type || "image/jpeg" });
  if (error) throw error;
  toast.success("انحفظ في المكتبة ✅");
}
async function urlToBlob(url: string) { const r = await fetch(url); if (!r.ok) throw new Error("تعذّر تحميل الملف"); return r.blob(); }
async function download(url: string, name: string) {
  try { const b = await urlToBlob(url); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); }
  catch { window.open(url, "_blank"); }
}
async function share(url: string, text: string) {
  try {
    const b = await urlToBlob(url);
    const f = new File([b], b.type.startsWith("video") ? "design.mp4" : "design.png", { type: b.type });
    if (navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f], text }); return; }
  } catch { /* fallback */ }
  window.open(`https://wa.me/?text=${encodeURIComponent(text + "\n" + url)}`, "_blank");
}

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`shrink-0 rounded-full border px-3 py-1 text-xs transition ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted"}`}>{children}</button>;
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><div className="flex items-baseline justify-between gap-2"><label className="text-sm font-semibold">{label}</label>{hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}</div>{children}</div>;
}
function ResultActions({ url, prompt, storeId, onEdit }: { url: string; prompt: string; storeId?: string | undefined; onEdit?: (() => void) | undefined }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap gap-1.5 p-2">
      <Button size="sm" variant="secondary" disabled={busy} onClick={async () => { setBusy(true); try { await saveToLibrary(storeId, await urlToBlob(url), prompt || "تصميم"); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }}>📚 للمكتبة</Button>
      <Button size="sm" variant="outline" onClick={() => download(url, `design-${Date.now()}`)}>⬇️</Button>
      <Button size="sm" variant="outline" onClick={() => share(url, prompt)}>📤</Button>
      {onEdit && <Button size="sm" variant="outline" onClick={onEdit}>✍️ اكتب عليها</Button>}
    </div>
  );
}

export function DesignStudio({ storeId }: { storeId?: string }) {
  const [tab, setTab] = useState<Tab>("image");
  const [posterBg, setPosterBg] = useState<string | null>(null);
  const [videoFrom, setVideoFrom] = useState<string | null>(null);
  const editOnPoster = (u: string) => { setPosterBg(u); setTab("poster"); };
  const animate = (u: string) => { setVideoFrom(u); setTab("video"); };

  return (
    <div dir="rtl" className="space-y-4">
      <link rel="stylesheet" href={FONT_LINK} />
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-accent p-5 text-primary-foreground shadow-lg">
        <h2 className="font-display text-2xl">🎨 استوديو التصميم</h2>
        <p className="mt-1 text-sm opacity-90">صور خيالية • فيديوهات سينمائية • بطاقات غزل وخواطر بخطوط عربية فاخرة</p>
      </div>
      <nav className="flex gap-2 overflow-x-auto pb-1">
        {([["image", "🖼️ صور"], ["video", "🎬 فيديو"], ["poster", "✍️ بطاقات وخواطر"], ["gallery", "🗂️ أعمالي"], ["guide", "📖 الدليل"]] as const).map(([k, l]) => (
          <Chip key={k} on={tab === k} onClick={() => setTab(k)}>{l}</Chip>
        ))}
      </nav>
      {tab === "image" && <ImageTab storeId={storeId} onEdit={editOnPoster} onAnimate={animate} />}
      {tab === "video" && <VideoTab storeId={storeId} from={videoFrom} clearFrom={() => setVideoFrom(null)} />}
      {tab === "poster" && <PosterTab storeId={storeId} initialBg={posterBg} />}
      {tab === "gallery" && <Gallery storeId={storeId} onEdit={editOnPoster} onAnimate={animate} />}
      {tab === "guide" && <Guide />}
    </div>
  );
}

/* ================= الصور ================= */
function ImageTab({ storeId, onEdit, onAnimate }: { storeId?: string | undefined; onEdit: (u: string) => void; onAnimate: (u: string) => void }) {
  const gen = useServerFn(designImage);
  const enh = useServerFn(designEnhance);
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [model, setModel] = useState<"flux-pro" | "flux-dev" | "flux-schnell" | "ideogram" | "recraft">("flux-dev");
  const [size, setSize] = useState<"square" | "story" | "portrait" | "landscape" | "wide">("story");
  const [count, setCount] = useState(2);
  const [steps, setSteps] = useState(28);
  const [guidance, setGuidance] = useState(3.5);
  const [seed, setSeed] = useState("");
  const [style, setStyle] = useState("");
  const [adv, setAdv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [enhBusy, setEnhBusy] = useState(false);
  const [out, setOut] = useState<string[]>([]);

  const enhance = async () => {
    if (prompt.trim().length < 2) { toast.error("اكتب فكرتك أول"); return; }
    setEnhBusy(true);
    try { const r = await enh({ data: { idea: prompt, kind: "image" } }); if (r.error) toast.error(r.error); else if (r.text) { setPrompt(r.text); toast.success("تم تحسين الوصف ✨"); } }
    catch (e) { toast.error((e as Error).message); } finally { setEnhBusy(false); }
  };
  const run = async () => {
    if (prompt.trim().length < 2) { toast.error("اكتب وصف الصورة"); return; }
    setBusy(true); setOut([]);
    try {
      const full = style ? `${prompt}, ${style}` : prompt;
      const r = await gen({ data: { prompt: full, negative: negative || undefined, model, size, count, steps, guidance, seed: seed ? Number(seed) : undefined, style: model === "recraft" ? "realistic_image" : undefined } });
      if (r.error) toast.error(r.error);
      setOut(r.images);
      if (r.images.length) pushHist(r.images.map((url) => ({ url, kind: "image" as const, prompt, at: Date.now() })));
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
      <div className="space-y-4 rounded-2xl border bg-card p-4">
        <Field label="وصف الصورة" hint="بالعربي أو الإنجليزي">
          <Textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="مثال: بنت بعباية سوداء تمشي تحت المطر في الرياض ليلاً وأضواء ذهبية" />
        </Field>
        <Button variant="outline" className="w-full" disabled={enhBusy} onClick={enhance}>{enhBusy ? "جاري التحسين…" : "✨ حسّن الوصف بالذكاء"}</Button>
        <Field label="المحرك">
          <div className="flex flex-wrap gap-1.5">
            {([["flux-pro", "FLUX Ultra 👑"], ["flux-dev", "FLUX Dev"], ["flux-schnell", "FLUX سريع ⚡"], ["ideogram", "Ideogram (نصوص)"], ["recraft", "Recraft"]] as const).map(([k, l]) => <Chip key={k} on={model === k} onClick={() => setModel(k)}>{l}</Chip>)}
          </div>
        </Field>
        <Field label="المقاس">
          <div className="flex flex-wrap gap-1.5">
            {([["story", "ستوري 9:16"], ["portrait", "بوست 3:4"], ["square", "مربع 1:1"], ["landscape", "عريض 16:9"], ["wide", "4:3"]] as const).map(([k, l]) => <Chip key={k} on={size === k} onClick={() => setSize(k)}>{l}</Chip>)}
          </div>
        </Field>
        <Field label="النمط الفني">
          <div className="flex flex-wrap gap-1.5">{STYLES.map(([v, l]) => <Chip key={l} on={style === v} onClick={() => setStyle(v)}>{l}</Chip>)}</div>
        </Field>
        <Field label="عدد الصور" hint={`${count}`}><Slider min={1} max={4} step={1} value={[count]} onValueChange={(v) => setCount(v[0] ?? 0)} /></Field>
        <button type="button" className="text-xs text-primary underline" onClick={() => setAdv(!adv)}>{adv ? "إخفاء التحكم المتقدم" : "⚙️ تحكم متقدم"}</button>
        {adv && (
          <div className="space-y-4 rounded-xl bg-muted/50 p-3">
            <Field label="خطوات الدقة" hint={`${steps} — أكثر = أدق وأبطأ`}><Slider min={4} max={50} step={1} value={[steps]} onValueChange={(v) => setSteps(v[0] ?? 0)} /></Field>
            <Field label="الالتزام بالوصف" hint={`${guidance} — أعلى = حرفي أكثر`}><Slider min={1} max={15} step={0.5} value={[guidance]} onValueChange={(v) => setGuidance(v[0] ?? 0)} /></Field>
            <Field label="أشياء ما تبيها" hint="Ideogram"><Input value={negative} onChange={(e) => setNegative(e.target.value)} placeholder="blurry, text, watermark" /></Field>
            <Field label="رقم البذرة (Seed)" hint="نفس الرقم = نفس النتيجة"><Input inputMode="numeric" value={seed} onChange={(e) => setSeed(e.target.value.replace(/\D/g, ""))} placeholder="عشوائي" /></Field>
          </div>
        )}
        <Button className="w-full" size="lg" disabled={busy} onClick={run}>{busy ? "🎨 جاري الرسم…" : "🎨 صمّم الحين"}</Button>
      </div>
      <div className="min-h-[300px] rounded-2xl border bg-card p-3">
        {busy && <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: count }).map((_, i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-muted" />)}</div>}
        {!busy && !out.length && <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 text-center text-muted-foreground"><span className="text-5xl">🖼️</span><p className="text-sm">صورك بتطلع هنا</p></div>}
        <div className="grid gap-3 sm:grid-cols-2">
          {out.map((u) => (
            <div key={u} className="overflow-hidden rounded-xl border bg-background">
              <img src={u} alt={prompt} className="w-full object-cover" loading="lazy" />
              <ResultActions url={u} prompt={prompt} storeId={storeId} onEdit={() => onEdit(u)} />
              <div className="px-2 pb-2"><Button size="sm" variant="ghost" className="w-full" onClick={() => onAnimate(u)}>🎬 حرّكها فيديو</Button></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================= الفيديو ================= */
function VideoTab({ storeId, from, clearFrom }: { storeId?: string | undefined; from: string | null; clearFrom: () => void }) {
  const start = useServerFn(designVideoStart);
  const check = useServerFn(designVideoCheck);
  const enh = useServerFn(designEnhance);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<"kling" | "kling-std" | "hailuo">("kling-std");
  const [duration, setDuration] = useState<"5" | "10">("5");
  const [aspect, setAspect] = useState<"16:9" | "9:16" | "1:1">("9:16");
  const [negative, setNegative] = useState("");
  const [cfg, setCfg] = useState(0.5);
  const [camera, setCamera] = useState("");
  const [img, setImg] = useState<string | null>(from);
  const [state, setState] = useState<string>("");
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => { setImg(from); }, [from]);
  useEffect(() => () => { alive.current = false; }, []);

  const uploadImg = async (f: File) => {
    if (!storeId) return;
    const path = `${storeId}/design-src-${crypto.randomUUID()}.${f.name.split(".").pop() || "jpg"}`;
    const up = await supabase.storage.from("media-library").upload(path, f, { contentType: f.type });
    if (up.error) { toast.error(up.error.message); return; }
    const { data } = await supabase.storage.from("media-library").createSignedUrl(path, 3600);
    if (data?.signedUrl) setImg(data.signedUrl);
  };
  const enhance = async () => {
    if (prompt.trim().length < 2) { toast.error("اكتب فكرتك أول"); return; }
    try { const r = await enh({ data: { idea: prompt, kind: "video" } }); if (r.error) toast.error(r.error); else if (r.text) setPrompt(r.text); } catch (e) { toast.error((e as Error).message); }
  };
  const run = async () => {
    if (prompt.trim().length < 2) { toast.error("اكتب وصف المشهد"); return; }
    setBusy(true); setUrl(null); setState("جاري الإرسال للمحرك…");
    try {
      const full = camera ? `${prompt}. Camera: ${camera}` : prompt;
      const r = await start({ data: { prompt: full, model, duration, aspect, image: img ?? undefined, negative: negative || undefined, cfg } });
      if (r.error) { toast.error(r.error); setState(""); return; }
      const t0 = Date.now();
      while (alive.current && Date.now() - t0 < 15 * 60 * 1000) {
        await new Promise((res) => setTimeout(res, 6000));
        const c = await check({ data: { status_url: r.status_url, response_url: r.response_url } });
        if (c.error) { toast.error(c.error); setState(""); return; }
        if (c.status === "COMPLETED" && c.url) {
          setUrl(c.url); setState(""); pushHist([{ url: c.url, kind: "video", prompt, at: Date.now() }]); toast.success("الفيديو جاهز 🎬"); return;
        }
        const sec = Math.round((Date.now() - t0) / 1000);
        setState(c.status === "IN_QUEUE" ? `في الطابور${"position" in c && c.position != null ? ` (رقم ${c.position})` : ""}… ${sec}ث` : `جاري التصوير السينمائي… ${sec}ث`);
      }
    } catch (e) { toast.error((e as Error).message); setState(""); } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
      <div className="space-y-4 rounded-2xl border bg-card p-4">
        <Field label="صورة البداية (اختياري)" hint="ارفع صورة وحركها">
          {img ? (
            <div className="relative"><img src={img} alt="" className="max-h-48 w-full rounded-xl object-cover" /><button className="absolute left-2 top-2 rounded-full bg-background/90 px-2 text-sm" onClick={() => { setImg(null); clearFrom(); }}>✕</button></div>
          ) : <Input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadImg(e.target.files[0])} />}
        </Field>
        <Field label="وصف المشهد"><Textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="مثال: عاشقان يمشون على شاطئ جدة وقت الغروب والهواء يحرك العباية" /></Field>
        <Button variant="outline" className="w-full" onClick={enhance}>✨ حوّله لوصف سينمائي</Button>
        <Field label="المحرك">
          <div className="flex flex-wrap gap-1.5">{([["kling", "Kling Master 👑"], ["kling-std", "Kling"], ["hailuo", "Hailuo"]] as const).map(([k, l]) => <Chip key={k} on={model === k} onClick={() => setModel(k)}>{l}</Chip>)}</div>
        </Field>
        <Field label="المدة"><div className="flex gap-1.5">{(["5", "10"] as const).map((d) => <Chip key={d} on={duration === d} onClick={() => setDuration(d)}>{d} ثواني</Chip>)}</div></Field>
        {model !== "hailuo" && !img && <Field label="المقاس"><div className="flex gap-1.5">{([["9:16", "ستوري"], ["1:1", "مربع"], ["16:9", "عريض"]] as const).map(([k, l]) => <Chip key={k} on={aspect === k} onClick={() => setAspect(k)}>{l}</Chip>)}</div></Field>}
        <Field label="حركة الكاميرا">
          <div className="flex flex-wrap gap-1.5">{([["", "تلقائي"], ["slow dolly in", "تقرّب ببطء"], ["slow dolly out", "تبعد ببطء"], ["orbit around subject", "دوران"], ["pan left to right", "تحريك أفقي"], ["static tripod shot", "ثابتة"], ["drone aerial shot", "درون"]] as const).map(([v, l]) => <Chip key={l} on={camera === v} onClick={() => setCamera(v)}>{l}</Chip>)}</div>
        </Field>
        {model !== "hailuo" && <>
          <Field label="الالتزام بالوصف" hint={cfg.toFixed(2)}><Slider min={0} max={1} step={0.05} value={[cfg]} onValueChange={(v) => setCfg(v[0] ?? 0)} /></Field>
          <Field label="أشياء ما تبيها"><Input value={negative} onChange={(e) => setNegative(e.target.value)} placeholder="blur, distort, low quality" /></Field>
        </>}
        <Button className="w-full" size="lg" disabled={busy} onClick={run}>{busy ? "🎬 جاري الإنتاج…" : "🎬 أنتج الفيديو"}</Button>
        <p className="text-[11px] text-muted-foreground">الفيديو ياخذ من دقيقة إلى ٥ دقائق — خلك في الصفحة.</p>
      </div>
      <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border bg-card p-3">
        {state && <div className="text-center"><div className="mx-auto mb-3 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" /><p className="text-sm">{state}</p></div>}
        {!state && !url && <div className="text-center text-muted-foreground"><span className="text-5xl">🎬</span><p className="text-sm">فيديوك بيطلع هنا</p></div>}
        {url && <div className="w-full overflow-hidden rounded-xl border"><video src={url} controls autoPlay loop playsInline className="w-full" /><ResultActions url={url} prompt={prompt} storeId={storeId} /></div>}
      </div>
    </div>
  );
}

/* ================= محرر البطاقات ================= */
type Layer = { id: string; text: string; font: string; size: number; color: string; x: number; y: number; align: CanvasTextAlign; weight: number; shadow: number; glow: string; stroke: number; strokeColor: string; opacity: number; lh: number };
const CANVAS = { story: [1080, 1920], post: [1080, 1350], square: [1080, 1080], wide: [1920, 1080] } as const;
const GRADS = [
  ["#2b0f1e", "#8a1c44"], ["#0f0c29", "#302b63"], ["#1a1a1a", "#3d2b1f"], ["#3a0d2e", "#d4508f"], ["#0b2b26", "#c9a24b"], ["#000000", "#434343"], ["#f8e1e7", "#f4b6c2"], ["#141e30", "#243b55"],
];
const newLayer = (text = "اكتب خاطرتك هنا", y = 0.5): Layer => ({ id: crypto.randomUUID(), text, font: "Aref Ruqaa", size: 90, color: "#ffffff", x: 0.5, y, align: "center", weight: 700, shadow: 12, glow: "#ff4d8d", stroke: 0, strokeColor: "#000000", opacity: 1, lh: 1.5 });

function PosterTab({ storeId, initialBg }: { storeId?: string | undefined; initialBg: string | null }) {
  const enh = useServerFn(designEnhance);
  const ref = useRef<HTMLCanvasElement>(null);
  const [fmt, setFmt] = useState<keyof typeof CANVAS>("story");
  const [bg, setBg] = useState<string | null>(initialBg);
  const [bgImg, setBgImg] = useState<HTMLImageElement | null>(null);
  const [grad, setGrad] = useState(0);
  const [f, setF] = useState({ brightness: 100, contrast: 100, saturate: 100, blur: 0, dark: 30, sepia: 0 });
  const [layers, setLayers] = useState<Layer[]>(() => [newLayer()]);
  const [sel, setSel] = useState(0);
  const [sig, setSig] = useState("");
  const [frame, setFrame] = useState(false);
  const [hearts, setHearts] = useState(false);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);
  const [fontsReady, setFontsReady] = useState(0);
  const drag = useRef(false);

  useEffect(() => { void document.fonts?.ready.then(() => setFontsReady((n) => n + 1)); const t = setTimeout(() => setFontsReady((n) => n + 1), 1500); return () => clearTimeout(t); }, []);
  useEffect(() => { setBg(initialBg); }, [initialBg]);
  useEffect(() => {
    if (!bg) { setBgImg(null); return; }
    const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => setBgImg(im); im.onerror = () => toast.error("تعذّر تحميل الخلفية"); im.src = bg;
  }, [bg]);

  const L = layers[sel] ?? layers[0];
  const upd = (p: Partial<Layer>) => setLayers((ls) => ls.map((l, i) => (i === sel ? { ...l, ...p } : l)));

  useEffect(() => {
    const c = ref.current; if (!c) return;
    const [W, H] = CANVAS[fmt]; c.width = W; c.height = H;
    const x = c.getContext("2d")!;
    x.clearRect(0, 0, W, H);
    x.filter = `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturate}%) blur(${f.blur}px) sepia(${f.sepia}%)`;
    if (bgImg) {
      const s = Math.max(W / bgImg.width, H / bgImg.height); const w = bgImg.width * s, h = bgImg.height * s;
      x.drawImage(bgImg, (W - w) / 2, (H - h) / 2, w, h);
    } else {
      const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, GRADS[grad][0]); g.addColorStop(1, GRADS[grad][1]); x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
    x.filter = "none";
    if (f.dark) { x.fillStyle = `rgba(0,0,0,${f.dark / 100})`; x.fillRect(0, 0, W, H); }
    if (hearts) {
      x.font = "60px serif"; x.globalAlpha = 0.35;
      for (let i = 0; i < 18; i++) { const px = ((i * 977) % W), py = ((i * 613) % H); x.fillText(i % 2 ? "❤" : "✦", px, py); }
      x.globalAlpha = 1;
    }
    if (frame) { x.strokeStyle = "rgba(212,175,55,0.9)"; x.lineWidth = 6; x.strokeRect(40, 40, W - 80, H - 80); x.lineWidth = 2; x.strokeRect(58, 58, W - 116, H - 116); }
    x.direction = "rtl";
    for (const l of layers) {
      x.save(); x.globalAlpha = l.opacity; x.font = `${l.weight} ${l.size}px "${l.font}"`; x.textAlign = l.align; x.textBaseline = "middle";
      const lines = wrap(x, l.text, W * 0.86); const lh = l.size * l.lh; const startY = l.y * H - ((lines.length - 1) * lh) / 2;
      const px = l.align === "center" ? l.x * W : l.align === "right" ? W * 0.93 : W * 0.07;
      lines.forEach((ln, i) => {
        const yy = startY + i * lh;
        if (l.shadow) { x.shadowColor = l.glow; x.shadowBlur = l.shadow * 2; }
        if (l.stroke) { x.lineWidth = l.stroke; x.strokeStyle = l.strokeColor; x.strokeText(ln, px, yy); }
        x.fillStyle = l.color; x.fillText(ln, px, yy); x.shadowBlur = 0;
      });
      x.restore();
    }
    if (sig) { x.font = `400 44px "Aref Ruqaa"`; x.textAlign = "center"; x.fillStyle = "rgba(255,255,255,0.85)"; x.fillText(sig, W / 2, H - 100); }
  }, [fmt, bgImg, grad, f, layers, sig, frame, hearts, fontsReady]);

  const pointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current && e.type !== "pointerdown") return;
    const r = e.currentTarget.getBoundingClientRect();
    upd({ x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)), align: "center" });
  };
  const getBlob = () => new Promise<Blob>((res, rej) => ref.current!.toBlob((b) => (b ? res(b) : rej(new Error("تعذّر التصدير — جرّب خلفية من جهازك"))), "image/png"));
  const genIdeas = async () => {
    if (idea.trim().length < 2) { toast.error("اكتب موضوع الخاطرة"); return; }
    setBusy(true);
    try { const r = await enh({ data: { idea, kind: "quote" } }); if (r.error) toast.error(r.error); else setIdeas((r.text || "").split("\n").map((s) => s.trim()).filter(Boolean)); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,380px)]">
      <div className="space-y-2">
        <div className="mx-auto max-w-md overflow-hidden rounded-2xl border bg-muted shadow-lg">
          <canvas ref={ref} className="block h-auto w-full touch-none cursor-move"
            onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); pointer(e); }}
            onPointerMove={pointer} onPointerUp={() => { drag.current = false; }} />
        </div>
        <p className="text-center text-[11px] text-muted-foreground">اسحب على البطاقة لتحريك النص المحدد</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button disabled={busy} onClick={async () => { try { await saveToLibrary(storeId, await getBlob(), L?.text || "بطاقة"); } catch (e) { toast.error((e as Error).message); } }}>📚 احفظ في المكتبة</Button>
          <Button variant="outline" onClick={async () => { try { const b = await getBlob(); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = `card-${Date.now()}.png`; a.click(); } catch (e) { toast.error((e as Error).message); } }}>⬇️ تحميل</Button>
          <Button variant="outline" onClick={async () => { try { const b = await getBlob(); const file = new File([b], "card.png", { type: "image/png" }); if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] }); else toast.message("حمّلها وأرسلها"); } catch (e) { toast.error((e as Error).message); } }}>📤 مشاركة</Button>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border bg-card p-4">
        <Field label="المقاس"><div className="flex flex-wrap gap-1.5">{([["story", "ستوري"], ["post", "بوست"], ["square", "مربع"], ["wide", "عريض"]] as const).map(([k, l]) => <Chip key={k} on={fmt === k} onClick={() => setFmt(k)}>{l}</Chip>)}</div></Field>
        <Field label="الخلفية">
          <div className="flex flex-wrap gap-1.5">
            {GRADS.map((g, i) => <button key={i} type="button" onClick={() => { setBg(null); setGrad(i); }} className={`h-8 w-8 rounded-full border-2 ${!bg && grad === i ? "border-primary" : "border-transparent"}`} style={{ background: `linear-gradient(135deg, ${g[0]}, ${g[1]})` }} />)}
          </div>
          <Input type="file" accept="image/*" className="mt-2" onChange={(e) => { const fl = e.target.files?.[0]; if (fl) setBg(URL.createObjectURL(fl)); }} />
        </Field>
        <Field label="✨ خواطر جاهزة بالذكاء">
          <div className="flex gap-1.5"><Input value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="الشوق، الغياب، صباح الحب…" /><Button size="sm" disabled={busy} onClick={genIdeas}>{busy ? "…" : "اكتب"}</Button></div>
          {ideas.length > 0 && <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">{ideas.map((q, i) => <button key={i} type="button" onClick={() => upd({ text: q })} className="block w-full rounded-lg bg-muted px-2 py-1.5 text-right text-xs hover:bg-accent/30">{q}</button>)}</div>}
        </Field>
        <Field label="طبقات النص">
          <div className="flex flex-wrap gap-1.5">
            {layers.map((l, i) => <Chip key={l.id} on={sel === i} onClick={() => setSel(i)}>{l.text.slice(0, 10) || `نص ${i + 1}`}</Chip>)}
            <Chip on={false} onClick={() => { setLayers((ls) => [...ls, newLayer("نص جديد", 0.3)]); setSel(layers.length); }}>＋</Chip>
            {layers.length > 1 && <Chip on={false} onClick={() => { setLayers((ls) => ls.filter((_, i) => i !== sel)); setSel(0); }}>🗑️</Chip>}
          </div>
        </Field>
        {L && <div className="space-y-3 rounded-xl bg-muted/50 p-3">
          <Textarea rows={3} value={L.text} onChange={(e) => upd({ text: e.target.value })} />
          <div className="flex flex-wrap gap-1.5">{FONTS.map(([fn, l]) => <button key={fn} type="button" onClick={() => upd({ font: fn })} className={`rounded-lg border px-2 py-1 text-sm ${L.font === fn ? "border-primary bg-primary/10" : "bg-card"}`} style={{ fontFamily: fn }}>{l}</button>)}</div>
          <Field label="الحجم" hint={`${L.size}`}><Slider min={24} max={220} step={2} value={[L.size]} onValueChange={(v) => upd({ size: v[0] ?? 0 })} /></Field>
          <Field label="تباعد الأسطر" hint={L.lh.toFixed(1)}><Slider min={1} max={2.5} step={0.1} value={[L.lh]} onValueChange={(v) => upd({ lh: v[0] ?? 0 })} /></Field>
          <Field label="التوهج" hint={`${L.shadow}`}><Slider min={0} max={40} step={1} value={[L.shadow]} onValueChange={(v) => upd({ shadow: v[0] ?? 0 })} /></Field>
          <Field label="الحدود" hint={`${L.stroke}`}><Slider min={0} max={12} step={1} value={[L.stroke]} onValueChange={(v) => upd({ stroke: v[0] ?? 0 })} /></Field>
          <Field label="الشفافية" hint={`${Math.round(L.opacity * 100)}%`}><Slider min={0.1} max={1} step={0.05} value={[L.opacity]} onValueChange={(v) => upd({ opacity: v[0] ?? 0 })} /></Field>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <label className="space-y-1"><span>لون النص</span><input type="color" value={L.color} onChange={(e) => upd({ color: e.target.value })} className="h-9 w-full rounded" /></label>
            <label className="space-y-1"><span>التوهج</span><input type="color" value={L.glow} onChange={(e) => upd({ glow: e.target.value })} className="h-9 w-full rounded" /></label>
            <label className="space-y-1"><span>الحدود</span><input type="color" value={L.strokeColor} onChange={(e) => upd({ strokeColor: e.target.value })} className="h-9 w-full rounded" /></label>
          </div>
          <div className="flex gap-1.5">
            {([["right", "يمين"], ["center", "وسط"], ["left", "يسار"]] as const).map(([a, l]) => <Chip key={a} on={L.align === a} onClick={() => upd({ align: a })}>{l}</Chip>)}
            <Chip on={L.weight === 700} onClick={() => upd({ weight: L.weight === 700 ? 400 : 700 })}>عريض</Chip>
          </div>
        </div>}
        <Field label="فلاتر الصورة">
          <div className="space-y-3">
            {([["brightness", "الإضاءة", 50, 150], ["contrast", "التباين", 50, 150], ["saturate", "التشبع", 0, 200], ["sepia", "دافئ قديم", 0, 100], ["blur", "تغبيش", 0, 20], ["dark", "تعتيم للنص", 0, 80]] as const).map(([k, l, mn, mx]) => (
              <div key={k}><div className="flex justify-between text-xs"><span>{l}</span><span>{f[k]}</span></div><Slider min={mn} max={mx} step={1} value={[f[k]]} onValueChange={(v) => setF({ ...f, [k]: v[0] ?? 0 })} /></div>
            ))}
          </div>
        </Field>
        <Field label="لمسات"><div className="flex flex-wrap gap-1.5"><Chip on={frame} onClick={() => setFrame(!frame)}>🖼️ إطار ذهبي</Chip><Chip on={hearts} onClick={() => setHearts(!hearts)}>❤ قلوب ونجوم</Chip></div></Field>
        <Field label="توقيعك"><Input value={sig} onChange={(e) => setSig(e.target.value)} placeholder="@حسابك أو اسمك" /></Field>
      </div>
    </div>
  );
}
function wrap(x: CanvasRenderingContext2D, text: string, max: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const w of para.split(" ")) { const t = line ? `${line} ${w}` : w; if (x.measureText(t).width > max && line) { out.push(line); line = w; } else line = t; }
    out.push(line);
  }
  return out;
}

/* ================= أعمالي ================= */
function Gallery({ storeId, onEdit, onAnimate }: { storeId?: string | undefined; onEdit: (u: string) => void; onAnimate: (u: string) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => { setItems(loadHist()); }, []);
  if (!items.length) return <div className="rounded-2xl border bg-card p-10 text-center text-muted-foreground">لسا ما صممت شي — أعمالك بتنحفظ هنا تلقائياً</div>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">روابط المحرك مؤقتة — احفظ اللي يعجبك في المكتبة عشان يبقى للأبد.</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {items.map((it) => (
          <div key={it.url} className="overflow-hidden rounded-xl border bg-card">
            {it.kind === "video" ? <video src={it.url} controls playsInline className="w-full" /> : <img src={it.url} alt={it.prompt} loading="lazy" className="w-full" />}
            <ResultActions url={it.url} prompt={it.prompt} storeId={storeId} onEdit={it.kind === "image" ? () => onEdit(it.url) : undefined} />
            {it.kind === "image" && <div className="px-2 pb-2"><Button size="sm" variant="ghost" className="w-full" onClick={() => onAnimate(it.url)}>🎬 حرّكها</Button></div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= الدليل ================= */
function Guide() {
  const rows: [string, string][] = [
    ["🖼️ الصور", "اكتب فكرتك بالعربي ← اضغط «حسّن الوصف» ← اختر المقاس والنمط ← صمّم. FLUX Ultra لأعلى واقعية، Ideogram لما تبي كلام إنجليزي داخل الصورة، السريع للتجارب."],
    ["🎬 الفيديو", "ارفع صورة (أو اضغط «حرّكها» من أي صورة صممتها) واكتب وش يصير بالمشهد واختر حركة الكاميرا. Kling Master الأفخم، Hailuo ممتاز للحركة الطبيعية."],
    ["✍️ البطاقات", "اختر خلفية أو صورة، اكتب خاطرتك أو خل الذكاء يكتب لك، غيّر الخط والتوهج والحدود، واسحب النص بإصبعك لأي مكان."],
    ["⚙️ التحكم المتقدم", "خطوات الدقة: ٢٥–٣٥ أفضل توازن. الالتزام بالوصف: ٣–٥ طبيعي، أعلى = حرفي. Seed: لو عجبتك نتيجة احفظ رقمها وعدّل الوصف بس."],
    ["💡 سر الوصف القوي", "اذكر: الشخص + المكان + الوقت + الإضاءة + الإحساس. مثال: «يد رجل تمسك يد بنت، فنجال قهوة، مطر على الشباك، إضاءة دافئة، إحساس حنين»."],
    ["📚 الحفظ", "روابط المحرك مؤقتة، اضغط «للمكتبة» عشان تنحفظ للأبد وتقدر ترسلها واتساب من المكتبة."],
  ];
  return <div className="space-y-2">{rows.map(([t, d]) => <div key={t} className="rounded-2xl border bg-card p-4"><h3 className="font-bold">{t}</h3><p className="mt-1 text-sm leading-7 text-muted-foreground">{d}</p></div>)}</div>;
}
