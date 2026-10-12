import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fishSpeak, fishStatus, fishVoices } from "@/lib/ai.functions";
import { useBranding } from "@/lib/branding";
import { VoiceStudioPlus } from "./VoiceStudioPlus";

export type VoiceSettings = {
  provider: "fish" | "builtin";
  voiceId: string;
  voiceTitle: string;
  speed: number;
  volume: number;
  emotion: string;
  favorites: { id: string; title: string }[];
};

const KEY = "kingdom_voice";
const BUILTIN_VOICE_ID = "ca005277ffeb4282961e5253b18c6280";
const DEFAULTS: VoiceSettings = { provider: "fish", voiceId: BUILTIN_VOICE_ID, voiceTitle: "الصوت المدمج", speed: 1, volume: 0, emotion: "", favorites: [] };

export function loadVoice(): VoiceSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<VoiceSettings>;
    return { ...DEFAULTS, ...saved, provider: "fish", voiceId: BUILTIN_VOICE_ID, voiceTitle: "الصوت المدمج" };
  } catch { return DEFAULTS; }
}
function saveVoice(v: VoiceSettings) { localStorage.setItem(KEY, JSON.stringify(v)); }

export const EMOTIONS = [
  ["", "طبيعي"], ["happy", "😊 فرحانة"], ["excited", "🤩 متحمسة"], ["friendly", "🤝 ودودة"],
  ["confident", "💪 واثقة"], ["calm", "😌 هادئة"], ["empathetic", "🤗 متفهمة"], ["sincere", "🙏 صادقة"],
] as const;

/** Returns a function that turns text into a playable audio URL using the chosen voice. */
export function useSpeaker() {
  const fish = useServerFn(fishSpeak);
  return async (text: string, override?: Partial<VoiceSettings>) => {
    const v = { ...loadVoice(), ...override, provider: "fish" as const, voiceId: BUILTIN_VOICE_ID };
    const { audio } = await fish({ data: { text, voiceId: v.voiceId, speed: v.speed, volume: v.volume, emotion: v.emotion } });
    return audio;
  };
}

export function VoiceStudio() {
  const [v, setV] = useState<VoiceSettings>(DEFAULTS);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [q, setQ] = useState("");
  const [lang, setLang] = useState("ar");
  const [voices, setVoices] = useState<{ id: string; title: string; cover: string; tags: string[]; likes: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [sample, setSample] = useState("هلا والله! حياك الله في متجرنا، وش أقدر أساعدك فيه اليوم؟");
  const status = useServerFn(fishStatus);
  const list = useServerFn(fishVoices);
  const speaker = useSpeaker();
  const brand = useBranding();

  const update = (p: Partial<VoiceSettings>) => setV((o) => { const n = { ...o, ...p }; saveVoice(n); return n; });

  const search = async () => {
    setLoading(true);
    try { setVoices((await list({ data: { q, lang } })).voices); } catch (e) { toast.error((e as Error).message); }
    setLoading(false);
  };

  useEffect(() => {
    const saved = loadVoice();
    setV(saved);
    status().then((s) => {
      setConnected(s.connected);
      if (s.connected) {
        search();
        update({ provider: "fish", voiceId: BUILTIN_VOICE_ID, voiceTitle: "الصوت المدمج" });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const preview = async (id: string, title: string) => {
    setPlaying(id);
    try {
      const url = await speaker(sample, { provider: "fish", voiceId: id, voiceTitle: title });
      const a = new Audio(url); a.onended = () => setPlaying(null); await a.play();
    } catch (e) { toast.error((e as Error).message); setPlaying(null); }
  };

  const choose = (id: string, title: string) => { update({ provider: "fish", voiceId: id, voiceTitle: title }); toast.success(`صار صوت الموظفة: ${title}`); };
  const isFav = (id: string) => v.favorites.some((f) => f.id === id);
  const toggleFav = (id: string, title: string) =>
    update({ favorites: isFav(id) ? v.favorites.filter((f) => f.id !== id) : [...v.favorites, { id, title }] });

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-card p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg text-primary">🎙️ صوت الموظفة الحالي</h2>
            <p className="mt-1 text-sm">الصوت المدمج</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs ${connected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {connected === null ? "…" : connected ? `${brand.voice} مربوط ✓` : `${brand.voice} غير مربوط`}
          </span>
        </div>

        <label className="mt-4 block text-sm font-medium">جملة التجربة</label>
        <Input value={sample} onChange={(e) => setSample(e.target.value.slice(0, 300))} />

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="text-sm font-medium">السرعة: {v.speed.toFixed(1)}x</label>
            <input type="range" min={0.5} max={2} step={0.1} value={v.speed} onChange={(e) => update({ speed: Number(e.target.value) })} className="w-full accent-primary" />
          </div>
          <div>
            <label className="text-sm font-medium">الصوت: {v.volume > 0 ? "+" : ""}{v.volume}</label>
            <input type="range" min={-10} max={10} step={1} value={v.volume} onChange={(e) => update({ volume: Number(e.target.value) })} className="w-full accent-primary" />
          </div>
          <div>
            <label className="text-sm font-medium">المشاعر</label>
            <select value={v.emotion} onChange={(e) => update({ emotion: e.target.value })} className="mt-1 w-full rounded-md border bg-background px-2 py-2 text-sm">
              {EMOTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">السرعة والمشاعر تشتغل مع أصوات {brand.voice}.</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => preview(BUILTIN_VOICE_ID, "الصوت المدمج")} disabled={!!playing}>▶ جرّب الصوت المدمج</Button>
        </div>
      </section>

      <VoiceStudioPlus />

      {v.favorites.length > 0 && (
        <section className="rounded-2xl border bg-card p-5 shadow-soft">
          <h2 className="font-display mb-3 text-lg text-primary">⭐ أصواتي المفضلة</h2>
          <div className="flex flex-wrap gap-2">
            {v.favorites.map((f) => (
              <button key={f.id} onClick={() => choose(f.id, f.title)}
                className={`rounded-full border px-3 py-1.5 text-sm ${v.voiceId === f.id ? "border-primary bg-secondary" : "bg-background"}`}>{f.title}</button>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border bg-card p-5 shadow-soft">
        <h2 className="font-display mb-3 text-lg text-primary">🎧 مكتبة أصوات {brand.voice}</h2>
        {!connected ? (
          <p className="text-sm text-muted-foreground">اربط حسابك في {brand.voice} عشان تظهر لك آلاف الأصوات العربية والسعودية.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Input className="flex-1" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="ابحث: سعودية، نجدية، female…" />
              <select value={lang} onChange={(e) => setLang(e.target.value)} className="rounded-md border bg-background px-2 text-sm">
                <option value="ar">عربي</option><option value="en">English</option><option value="">كل اللغات</option>
              </select>
              <Button onClick={search} disabled={loading}>{loading ? "…" : "ابحث"}</Button>
            </div>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {voices.map((m) => (
                <li key={m.id} className={`rounded-xl border p-3 ${v.voiceId === m.id ? "border-primary bg-secondary" : "bg-background"}`}>
                  <div className="flex items-center gap-3">
                    {m.cover ? <img src={m.cover} alt="" className="h-10 w-10 rounded-full object-cover" /> : <div className="h-10 w-10 rounded-full bg-gold" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{m.title}</p>
                      <p className="truncate text-xs text-muted-foreground">❤ {m.likes} {m.tags.join(" · ")}</p>
                    </div>
                    <button onClick={() => toggleFav(m.id, m.title)} className="text-lg" aria-label="مفضلة">{isFav(m.id) ? "⭐" : "☆"}</button>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="secondary" className="flex-1" onClick={() => preview(m.id, m.title)} disabled={!!playing}>{playing === m.id ? "🔊…" : "▶ اسمع"}</Button>
                    <Button size="sm" className="flex-1" onClick={() => choose(m.id, m.title)}>اختر</Button>
                  </div>
                </li>
              ))}
            </ul>
            {!voices.length && !loading && <p className="mt-3 text-sm text-muted-foreground">ما لقينا أصوات، جرب كلمة ثانية.</p>}
          </>
        )}
      </section>
    </div>
  );
}
