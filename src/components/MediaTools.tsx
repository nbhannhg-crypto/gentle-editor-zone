import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { emptyMeta, pullMeta, pushMeta } from "@/lib/media-meta";

type Media = { id: string; title: string; kind: string; path: string; mime: string; url?: string | undefined };

const extOf = (it: Media) => it.path.split(".").pop() || (it.kind === "image" ? "jpg" : it.kind === "video" ? "mp4" : "webm");
const fileName = (it: Media) => `${(it.title || "ملف").replace(/[\\/:*?"<>|]/g, "_")}.${extOf(it)}`;

async function blobOf(it: Media) {
  const { data, error } = await supabase.storage.from("media-library").download(it.path);
  if (error || !data) throw new Error("ما قدرنا نجيب الملف");
  return data;
}

/** Long-lived link (1 year) that opens the photo/clip in any app or chat. */
export async function shareLink(it: Media) {
  const { data, error } = await supabase.storage.from("media-library").createSignedUrl(it.path, 60 * 60 * 24 * 365);
  if (error || !data) throw new Error("ما قدرنا نسوي الرابط");
  return data.signedUrl;
}

export async function downloadItem(it: Media) {
  const b = await blobOf(it);
  const u = URL.createObjectURL(b);
  const a = document.createElement("a");
  a.href = u; a.download = fileName(it); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}

/** Opens the phone share sheet with the real file (Snapchat, TikTok, WhatsApp, Instagram…). */
export async function shareItem(it: Media) {
  const b = await blobOf(it);
  const file = new File([b], fileName(it), { type: it.mime || b.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: it.title });
    return "file";
  }
  const link = await shareLink(it);
  if (nav.share) { await nav.share({ title: it.title, url: link }); return "link"; }
  await navigator.clipboard.writeText(link);
  return "copied";
}

export function ShareBar({ it }: { it: Media }) {
  const run = (f: () => Promise<unknown>, ok?: string) => async () => {
    try { await f(); if (ok) toast.success(ok); } catch (e) { if ((e as Error).name !== "AbortError") toast.error((e as Error).message); }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={run(async () => { const r = await shareItem(it); if (r === "copied") toast.success("انسخ الرابط 📋"); })}>📤 مشاركة (سناب/تيك توك…)</Button>
      <Button size="sm" variant="secondary" onClick={run(() => downloadItem(it), "انحفظ في جهازك 💾")}>💾 حفظ بالجوال</Button>
      <Button size="sm" variant="secondary" onClick={run(async () => navigator.clipboard.writeText(await shareLink(it)), "انسخ الرابط — الصقه في أي محادثة 🔗")}>🔗 نسخ رابط</Button>
    </div>
  );
}

/** Image editor (crop, rotate, flip, brightness/contrast/saturation) and video/audio trimmer. Saves a NEW copy. */
export function MediaEditor({ it, onSave, onClose }: { it: Media; onSave: (b: Blob, name: string) => Promise<void>; onClose: () => void }) {
  const [rot, setRot] = useState(0);
  const [flip, setFlip] = useState(false);
  const [br, setBr] = useState(100);
  const [ct, setCt] = useState(100);
  const [sat, setSat] = useState(100);
  const [crop, setCrop] = useState({ t: 0, b: 0, l: 0, r: 0 });
  const [dur, setDur] = useState(0);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [busy, setBusy] = useState(false);
  const [src, setSrc] = useState<string>("");
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  useEffect(() => {
    let u = "";
    blobOf(it).then((b) => { u = URL.createObjectURL(b); setSrc(u); }).catch(() => toast.error("ما قدرنا نفتح الملف"));
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [it]);
  const filter = `brightness(${br}%) contrast(${ct}%) saturate(${sat}%)`;

  const saveImage = async () => {
    setBusy(true);
    try {
      const img = new Image(); img.src = src; await img.decode();
      const sx = (img.width * crop.l) / 100, sy = (img.height * crop.t) / 100;
      const sw = img.width * (1 - (crop.l + crop.r) / 100), sh = img.height * (1 - (crop.t + crop.b) / 100);
      const side = rot % 180 !== 0;
      const c = document.createElement("canvas");
      c.width = side ? sh : sw; c.height = side ? sw : sh;
      const g = c.getContext("2d")!;
      g.filter = filter;
      g.translate(c.width / 2, c.height / 2); g.rotate((rot * Math.PI) / 180); if (flip) g.scale(-1, 1);
      g.drawImage(img, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
      const b = await new Promise<Blob>((res, rej) => c.toBlob((x) => (x ? res(x) : rej(new Error("فشل"))), "image/jpeg", 0.95));
      await onSave(b, `${it.title || "صورة"} (معدّلة).jpg`); onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const saveTrim = async () => {
    const el = media.current; if (!el) return;
    const [a, z] = range; if (z - a < 0.3) { toast.error("اختر مقطع أطول"); return; }
    setBusy(true);
    try {
      const cap = (el as HTMLMediaElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream });
      const stream = cap.captureStream?.() ?? cap.mozCaptureStream?.();
      if (!stream) throw new Error("متصفحك ما يدعم القص، جرّب كروم");
      const type = it.kind === "video" ? (MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4" : "video/webm") : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: type });
      const parts: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
      const done = new Promise<void>((r) => { rec.onstop = () => r(); });
      el.currentTime = a; await new Promise((r) => el.addEventListener("seeked", r, { once: true }));
      rec.start(); await el.play();
      await new Promise<void>((r) => { const t = () => { if (el.currentTime >= z || el.ended) { el.removeEventListener("timeupdate", t); r(); } }; el.addEventListener("timeupdate", t); });
      el.pause(); rec.stop(); await done;
      await onSave(new Blob(parts, { type }), `${it.title || "مقطع"} (مقصوص).${type.includes("mp4") ? "mp4" : "webm"}`); onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const Slider = ({ label, v, set, min = 0, max = 200 }: { label: string; v: number; set: (n: number) => void; min?: number; max?: number }) => (
    <label className="block text-xs">{label} <b>{v}</b><input type="range" min={min} max={max} value={v} onChange={(e) => set(+e.target.value)} className="w-full" /></label>
  );

  return (
    <div className="space-y-3 rounded-xl border-2 border-primary/40 bg-background p-3">
      <div className="flex items-center justify-between"><b className="text-sm">✂️ تعديل: {it.title}</b><Button size="sm" variant="ghost" onClick={onClose}>✕</Button></div>
      {!src && <p className="text-xs text-muted-foreground">جاري التحميل…</p>}
      {src && it.kind === "image" && (
        <>
          <div className="overflow-hidden rounded-lg bg-muted">
            <img src={src} alt={it.title} className="mx-auto max-h-64" style={{ filter, transform: `rotate(${rot}deg) scaleX(${flip ? -1 : 1})`, clipPath: `inset(${crop.t}% ${crop.r}% ${crop.b}% ${crop.l}%)` }} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setRot((r) => (r + 90) % 360)}>🔄 تدوير</Button>
            <Button size="sm" variant="secondary" onClick={() => setFlip((f) => !f)}>↔️ قلب</Button>
            <Button size="sm" variant="ghost" onClick={() => { setRot(0); setFlip(false); setBr(100); setCt(100); setSat(100); setCrop({ t: 0, b: 0, l: 0, r: 0 }); }}>↩️ رجّع الأصل</Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Slider label="☀️ الإضاءة" v={br} set={setBr} />
            <Slider label="◐ التباين" v={ct} set={setCt} />
            <Slider label="🎨 الألوان" v={sat} set={setSat} />
          </div>
          <b className="text-xs">✂️ قص الأطراف (%)</b>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["t", "b", "l", "r"] as const).map((k) => (
              <Slider key={k} label={{ t: "فوق", b: "تحت", l: "يسار", r: "يمين" }[k]} v={crop[k]} max={45} set={(n) => setCrop((c) => ({ ...c, [k]: n }))} />
            ))}
          </div>
          <Button onClick={saveImage} disabled={busy}>{busy ? "جاري الحفظ…" : "💾 احفظ كنسخة جديدة"}</Button>
        </>
      )}
      {src && it.kind !== "image" && (
        <>
          {it.kind === "video"
            ? <video ref={media} src={src} controls playsInline className="max-h-64 w-full rounded-lg" onLoadedMetadata={(e) => { const d = e.currentTarget.duration || 0; setDur(d); setRange([0, d]); }} />
            : <audio ref={media} src={src} controls className="w-full" onLoadedMetadata={(e) => { const d = e.currentTarget.duration || 0; setDur(d); setRange([0, d]); }} />}
          {dur > 0 && Number.isFinite(dur) && (
            <div className="space-y-1">
              <label className="block text-xs">▶️ البداية {fmt(range[0])}<input type="range" min={0} max={dur} step={0.1} value={range[0]} onChange={(e) => { const v = Math.min(+e.target.value, range[1] - 0.3); setRange([v, range[1]]); if (media.current) media.current.currentTime = v; }} className="w-full" /></label>
              <label className="block text-xs">⏹️ النهاية {fmt(range[1])}<input type="range" min={0} max={dur} step={0.1} value={range[1]} onChange={(e) => setRange([range[0], Math.max(+e.target.value, range[0] + 0.3)])} className="w-full" /></label>
              <p className="text-xs text-muted-foreground">المدة بعد القص: {fmt(range[1] - range[0])} — المقطع يشتغل أثناء القص، خلّ الصفحة مفتوحة.</p>
            </div>
          )}
          <Button onClick={saveTrim} disabled={busy || !dur}>{busy ? "جاري القص…" : "✂️ قص واحفظ كنسخة جديدة"}</Button>
        </>
      )}
      <p className="text-xs text-muted-foreground">الأصل يبقى زي ما هو، والمعدّل ينحفظ كملف جديد في المكتبة.</p>
    </div>
  );
}

const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, "0")).join("");
const LOCK_ID = "__lock__";

/** Optional PIN lock for the library (stored in the cloud). Forgot PIN → confirm account password to reset. */
export function LibraryLock({ storeId, children }: { storeId?: string | undefined; children: ReactNode }) {
  const [hash, setHash] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [forgot, setForgot] = useState(false);
  const [pass, setPass] = useState("");
  const [panel, setPanel] = useState(false);
  const [newPin, setNewPin] = useState("");
  const sk = `ml_unlocked:${storeId}`;
  useEffect(() => {
    if (!storeId) return;
    pullMeta(storeId).then((all) => {
      const h = all[LOCK_ID]?.summary || null;
      setHash(h);
      setOpen(!h || sessionStorage.getItem(sk) === h);
      setReady(true);
    }).catch(() => { setOpen(true); setReady(true); });
  }, [storeId, sk]);
  const savePin = async (p: string | null) => {
    if (!storeId) return;
    const h = p ? await sha(`${storeId}:${p}`) : "";
    await pushMeta(storeId, LOCK_ID, { ...emptyMeta(), active: false, summary: h });
    setHash(h || null); if (h) sessionStorage.setItem(sk, h);
  };
  const unlock = async () => {
    if (hash && (await sha(`${storeId}:${pin}`)) === hash) { sessionStorage.setItem(sk, hash); setOpen(true); setPin(""); }
    else toast.error("الرمز غلط");
  };
  const reset = async () => {
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email;
    if (!email) { toast.error("ما لقينا بريد حسابك"); return; }
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) { toast.error("كلمة مرور الحساب غلط"); return; }
    await savePin(null); setOpen(true); setForgot(false); setPass("");
    toast.success("انفك القفل ✅ تقدر تحط رمز جديد من «🔒 القفل»");
  };
  if (!ready) return <p className="text-sm text-muted-foreground">جاري فتح المكتبة…</p>;
  if (!open) return (
    <div className="mx-auto max-w-sm space-y-3 rounded-2xl border bg-card p-5 text-center">
      <p className="text-3xl">🔒</p><b>المكتبة مقفولة</b>
      {!forgot ? (
        <>
          <Input type="password" inputMode="numeric" placeholder="الرمز السري" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void unlock()} className="text-center" />
          <Button className="w-full" onClick={unlock}>فتح</Button>
          <button className="text-xs text-primary underline" onClick={() => setForgot(true)}>نسيت الرمز؟</button>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">اكتب كلمة مرور حسابك عشان نفك القفل وتحط رمز جديد. ملفاتك ما تنمس.</p>
          <Input type="password" placeholder="كلمة مرور الحساب" value={pass} onChange={(e) => setPass(e.target.value)} />
          <Button className="w-full" onClick={reset}>فك القفل</Button>
          <button className="text-xs underline" onClick={() => setForgot(false)}>رجوع</button>
        </>
      )}
    </div>
  );
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setPanel((p) => !p)}>{hash ? "🔒 القفل مفعّل" : "🔓 قفل المكتبة"}</Button>
        {hash && <Button size="sm" variant="ghost" onClick={() => { sessionStorage.removeItem(sk); setOpen(false); }}>🔐 اقفل الحين</Button>}
      </div>
      {panel && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-3">
          <Input type="password" inputMode="numeric" placeholder={hash ? "رمز جديد" : "اختر رمز (4 أرقام أو أكثر)"} value={newPin} onChange={(e) => setNewPin(e.target.value)} className="max-w-48" />
          <Button size="sm" onClick={async () => { if (newPin.length < 4) { toast.error("الرمز 4 أرقام على الأقل"); return; } await savePin(newPin); setNewPin(""); setPanel(false); toast.success("انحفظ الرمز 🔒"); }}>{hash ? "غيّر الرمز" : "فعّل القفل"}</Button>
          {hash && <Button size="sm" variant="ghost" onClick={async () => { await savePin(null); setPanel(false); toast.success("انشال القفل"); }}>شيل القفل</Button>}
        </div>
      )}
      {children}
    </div>
  );
}

export function LibraryGuide() {
  const [o, setO] = useState(false);
  const rows: [string, string][] = [
    ["☁️ محفوظة بالسحابة", "كل ملف ترفعه ينحفظ بالموقع، لو حذفته من جوالك يبقى. ادخل من أي جوال بحسابك وتلقاه. ومكتبتك خاصة فيك، ما يشوفها أي تاجر ثاني."],
    ["⬆️ رفع وتسجيل", "ارفع صور وفيديو وأصوات قد ما تبي، أو سجّل صوت مباشر والتسجيل يصفّي الضوضاء."],
    ["✏️ التسمية والمجلدات", "اضغط ✏️ جنب الاسم وغيّره، ومن «⚙️ تخصيص» حط الملف في مجلد، وفوق تقدر تفلتر بالمجلد."],
    ["🔍 البحث", "ابحث بالاسم أو الكود أو المجلد أو الكلام اللي داخل الصوت أو المكتوب داخل الصورة، أو بالمايك."],
    ["✂️ القص والتعديل", "الصور: قص وتدوير وقلب وإضاءة وتباين وألوان. الفيديو والصوت: تختار البداية والنهاية وتقص. الأصل ما ينمس، والمعدّل ينحفظ كنسخة جديدة."],
    ["📤 المشاركة", "زر المشاركة يفتح لك تطبيقات جوالك (سناب، تيك توك، انستا، واتساب…) ويوصل الملف نفسه كأنك أرسلته من جوالك."],
    ["🔗 نسخ الرابط", "انسخ الرابط والصقه في أي محادثة بأي منصة، ينفتح فيه الصورة أو المقطع مباشرة (يشتغل سنة كاملة)."],
    ["💾 حفظ بالجوال", "ينزّل الملف لجوالك بجودته الأصلية."],
    ["📲 إرسال واتساب", "ترسل من رقمك المربوط للزبون، والصوت يوصل كرسالة صوتية أصلية."],
    ["✨ افهم بالذكاء", "يقرأ المكتوب في الصور ويوصف الملف ويطلع كلمات وأسئلة، مجانًا بدون خصم."],
    ["🧪 جرّب كلام الزبون", "تكتب جملة زي الزبون ويقولك أي ملف يناسبها بالمعنى."],
    ["🔒 القفل", "اختياري: حط رمز سري للمكتبة. لو نسيته اضغط «نسيت الرمز؟» واكتب كلمة مرور حسابك ويفك."],
  ];
  return (
    <div className="rounded-xl border bg-secondary/40">
      <button className="w-full p-3 text-start text-sm font-bold" onClick={() => setO((x) => !x)}>ℹ️ دليل ومميزات المكتبة {o ? "▲" : "▼"}</button>
      {o && <ul className="space-y-2 px-3 pb-3">{rows.map(([t, d]) => <li key={t} className="text-xs"><b>{t}:</b> {d}</li>)}</ul>}
    </div>
  );
}
