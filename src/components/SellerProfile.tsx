import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { BUSINESS_TYPES } from "@/lib/bots";
import { saveProfile, personaBio } from "@/lib/bots.functions";
import { PERSONA_DEFAULT, TONES, THEMES, parsePersona, personaKey, statsKey, type Persona } from "@/lib/persona";
import { STUDIO_VOICES } from "@/lib/studio-voices";

const BUCKET = "media-library";

export function SellerProfile({ storeId }: { storeId?: string | undefined }) {
  const save = useServerFn(saveProfile);
  const writeBio = useServerFn(personaBio);
  const [f, setF] = useState({ name: "", business_type: "products", bio: "", whatsapp: "" });
  const [p, setP] = useState<Persona>(PERSONA_DEFAULT);
  const [prev, setPrev] = useState<{ avatar: string; cover: string; welcome: string }>({ avatar: "", cover: "", welcome: "" });
  const [stats, setStats] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState("");
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const signed = async (path: string) => (path ? (await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)).data?.signedUrl ?? "" : "");

  useEffect(() => {
    if (!storeId) return;
    void supabase.from("stores").select("name, business_type, bio, whatsapp").eq("id", storeId).maybeSingle()
      .then(({ data }) => { if (data) setF(data as typeof f); });
    void supabase.from("training_rules").select("trigger_text, response_text").in("trigger_text", [personaKey(storeId), statsKey(storeId)])
      .then(async ({ data }) => {
        const pr = data?.find((r) => r.trigger_text === personaKey(storeId));
        const st = data?.find((r) => r.trigger_text === statsKey(storeId));
        if (st) { try { setStats(JSON.parse(st.response_text)); } catch { /* ignore */ } }
        if (pr) {
          const x = parsePersona(pr.response_text);
          setP(x);
          setPrev({ avatar: await signed(x.avatar), cover: await signed(x.cover), welcome: await signed(x.welcome) });
        }
      });
  }, [storeId]);

  const link = storeId ? `${window.location.origin}/s/${storeId}` : "";

  const savePersona = async (next: Persona) => {
    if (!storeId) return;
    const key = personaKey(storeId);
    const body = JSON.stringify(next);
    const { data } = await supabase.from("training_rules").select("id").eq("trigger_text", key).limit(1).maybeSingle();
    const { error } = data
      ? await supabase.from("training_rules").update({ response_text: body }).eq("id", data.id)
      : await supabase.from("training_rules").insert({ trigger_text: key, response_text: body, category: "settings", store_id: null });
    if (error) throw error;
  };

  const go = async (): Promise<void> => {
    try {
      await save({ data: { ...f, whatsapp: f.whatsapp.replace(/\D/g, "") } });
      await savePersona(p);
      toast.success("✅ انحفظ ملفك وهويتك");
    } catch (e) { toast.error((e as Error).message); }
  };

  const upload = async (file: Blob, kind: "avatar" | "cover" | "welcome", ext: string) => {
    if (!storeId) return;
    setBusy(kind);
    try {
      const path = `${storeId}/persona-${kind}-${Date.now()}.${ext}`;
      const opts: { contentType?: string } = {};
      if (file.type) opts.contentType = file.type;
      const up = await supabase.storage.from(BUCKET).upload(path, file, opts);
      if (up.error) throw up.error;
      const next = { ...p, [kind]: path };
      setP(next);
      await savePersona(next);
      setPrev((o) => ({ ...o, [kind]: URL.createObjectURL(file) }));
      toast.success("✅ انرفع وانحفظ");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(""); }
  };

  const pick = (kind: "avatar" | "cover" | "welcome") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void upload(file, kind, file.name.split(".").pop() || "bin");
    e.target.value = "";
  };

  const toggleRec = async () => {
    if (rec) { rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRec(null);
        const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
        void upload(blob, "welcome", (r.mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm");
      };
      r.start();
      setRec(r);
    } catch { toast.error("الميكروفون مقفول — اسمحي له من المتصفح"); }
  };

  const magic = async () => {
    setBusy("bio");
    try {
      const r = await writeBio({ data: { name: f.name, companion: p.companion, tone: p.tone, words: p.words.slice(0, 400), banned: p.banned.slice(0, 400), bio: f.bio } });
      if (r.text) { setF({ ...f, bio: r.text.slice(0, 500) }); toast.success("✨ جاهزة — عدّليها لو تبين ثم احفظي"); }
      else toast.error("المفاتيح المجانية مشغولة الحين، جربي بعد شوي");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(""); }
  };

  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm ${on ? "bg-primary text-primary-foreground" : "bg-background"}`;
  const visits = stats["visit"] ?? 0;
  const clicks = (stats["wa"] ?? 0) + (stats["call"] ?? 0) + (stats["voice"] ?? 0);

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5">
      <h2 className="font-display text-xl">🏪 ملفي وصفحة متجري</h2>
      <label className="block text-sm">اسم المتجر<Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <div>
        <p className="mb-1 text-sm">وش نشاطك؟</p>
        <div className="flex flex-wrap gap-2">
          {BUSINESS_TYPES.map(([k, l]) => (
            <button key={k} onClick={() => setF({ ...f, business_type: k })} className={chip(f.business_type === k)}>{l}</button>
          ))}
        </div>
      </div>
      <label className="block text-sm">نبذة عنك وعن خدماتك<Textarea rows={3} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value.slice(0, 500) })} /></label>
      <Button variant="secondary" className="w-full" disabled={busy === "bio"} onClick={magic}>{busy === "bio" ? "⏳ تكتب..." : "✨ اكتبي لي نبذة لطيفة"}</Button>
      <label className="block text-sm">رقم واتساب للطلبات (مثل 9665xxxxxxxx)<Input dir="ltr" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} /></label>

      <details className="rounded-xl border p-3" open>
        <summary className="cursor-pointer font-semibold">🎭 شخصية الرفيقة</summary>
        <div className="mt-3 space-y-3">
          <label className="block text-sm">اسم الموظفة / الرفيقة<Input placeholder="ريم، ليان، نوف..." value={p.companion} onChange={(e) => setP({ ...p, companion: e.target.value.slice(0, 40) })} /></label>
          <div>
            <p className="mb-1 text-sm">نبرة السوالف</p>
            <div className="flex flex-wrap gap-2">
              {TONES.map(([k, l, d]) => <button key={k} title={d} onClick={() => setP({ ...p, tone: k })} className={chip(p.tone === k)}>{l}</button>)}
            </div>
          </div>
          <label className="block text-sm">كلماتها المحببة (افصلي بفاصلة)<Textarea rows={2} value={p.words} onChange={(e) => setP({ ...p, words: e.target.value.slice(0, 400) })} /></label>
          <label className="block text-sm">🚫 الخطوط الحمراء (كلمات تتجنبها)<Textarea rows={2} value={p.banned} onChange={(e) => setP({ ...p, banned: e.target.value.slice(0, 400) })} /></label>
        </div>
      </details>

      <details className="rounded-xl border p-3">
        <summary className="cursor-pointer font-semibold">🔊 الترحيب الصوتي</summary>
        <div className="mt-3 space-y-3">
          <label className="block text-sm">صوت الهوية المفضل
            <select className="mt-1 w-full rounded-md border bg-background p-2" value={p.voice} onChange={(e) => setP({ ...p, voice: e.target.value })}>
              <option value="">— بدون —</option>
              {STUDIO_VOICES.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant={rec ? "destructive" : "secondary"} onClick={toggleRec} disabled={busy === "welcome"}>{rec ? "⏹️ وقفي التسجيل" : "🎙️ سجلي ترحيب"}</Button>
            <label className="cursor-pointer rounded-md border px-3 py-2 text-sm">📎 ارفعي مقطع<input type="file" accept="audio/*" className="hidden" onChange={pick("welcome")} /></label>
          </div>
          {busy === "welcome" && <p className="text-xs">⏳ يرفع...</p>}
          {prev.welcome && <audio controls src={prev.welcome} className="w-full" />}
          <p className="text-xs text-muted-foreground">يشتغل للزائر في صفحة رابطك العامة بضغطة زر.</p>
        </div>
      </details>

      <details className="rounded-xl border p-3">
        <summary className="cursor-pointer font-semibold">🎨 المظهر والأجواء</summary>
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {THEMES.map(([k, l]) => <button key={k} onClick={() => setP({ ...p, theme: k })} className={chip(p.theme === k)}>{l}</button>)}
          </div>
          <label className="block text-sm">حالة التواجد<Input value={p.status} onChange={(e) => setP({ ...p, status: e.target.value.slice(0, 60) })} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="cursor-pointer rounded-xl border p-2 text-center text-sm">
              {prev.avatar ? <img src={prev.avatar} alt="الصورة الشخصية" className="mx-auto h-16 w-16 rounded-full object-cover" /> : <span className="text-2xl">👤</span>}
              <p>{busy === "avatar" ? "⏳" : "الصورة الشخصية"}</p>
              <input type="file" accept="image/*" className="hidden" onChange={pick("avatar")} />
            </label>
            <label className="cursor-pointer rounded-xl border p-2 text-center text-sm">
              {prev.cover ? <img src={prev.cover} alt="الغلاف" className="h-16 w-full rounded-lg object-cover" /> : <span className="text-2xl">🖼️</span>}
              <p>{busy === "cover" ? "⏳" : "صورة الغلاف"}</p>
              <input type="file" accept="image/*" className="hidden" onChange={pick("cover")} />
            </label>
          </div>
        </div>
      </details>

      <Button onClick={go} className="w-full">💾 احفظ</Button>
      {link && (
        <div className="rounded-xl bg-muted p-3 text-sm">
          <p>🔗 رابط صفحة متجرك العامة — شاركيه مع زبائنك:</p>
          <div className="mt-2 flex gap-2">
            <Input dir="ltr" readOnly value={link} />
            <Button variant="secondary" onClick={() => { void navigator.clipboard.writeText(link); toast.success("انسخ ✅"); }}>نسخ</Button>
            <Button variant="outline" onClick={() => window.open(link, "_blank")}>فتح</Button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-background p-2"><b className="text-lg">{visits}</b><p className="text-xs">👀 زيارة</p></div>
            <div className="rounded-lg bg-background p-2"><b className="text-lg">{clicks}</b><p className="text-xs">👆 نقرة</p></div>
            <div className="rounded-lg bg-background p-2"><b className="text-lg">{visits ? Math.round((clicks / visits) * 100) : 0}%</b><p className="text-xs">💞 تفاعل</p></div>
          </div>
        </div>
      )}
    </section>
  );
}
