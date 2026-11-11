import { useEffect, useState } from "react";
import { toast } from "sonner";
import { VOICE_MODELS, getVoiceModel, setVoiceModel, getStudioVoice, setStudioVoice, type VoiceModel } from "@/lib/voice-model";

const BUILTIN = "ca005277ffeb4282961e5253b18c6280";
type V = { id: string; title: string };

/** يجمع أصوات التاجر المحفوظة/المستنسخة من الاستوديو (بدون تعديلها). */
function readVoices(): V[] {
  const out: V[] = [{ id: BUILTIN, title: "👑 الصوت المدمج" }];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || "";
      if (!k.startsWith("kingdom_voice_plus") || k.endsWith("_from")) continue;
      const s = JSON.parse(localStorage.getItem(k) || "{}");
      for (const v of [...(s.mine || []), ...(s.chosen ? [s.chosen] : [])]) if (v?.id && !out.some((o) => o.id === v.id)) out.push({ id: v.id, title: v.title || "صوت" });
    }
    const fav = JSON.parse(localStorage.getItem("kingdom_voice") || "{}").favorites || [];
    for (const v of fav) if (v?.id && !out.some((o) => o.id === v.id)) out.push({ id: v.id, title: `⭐ ${v.title}` });
  } catch { /* ignore */ }
  return out;
}
function getSpeed() { try { return Number(JSON.parse(localStorage.getItem("kingdom_voice") || "{}").speed) || 1; } catch { return 1; } }
function saveSpeed(n: number) { try { const s = JSON.parse(localStorage.getItem("kingdom_voice") || "{}"); localStorage.setItem("kingdom_voice", JSON.stringify({ ...s, speed: n })); } catch { /* ignore */ } }

export function LiveVoiceDeck({ moods, mood, setMood, test }: { moods: readonly (readonly [string, string])[]; mood: string; setMood: (m: string) => void; test: () => void }) {
  const [voices, setVoices] = useState<V[]>([]);
  const [vid, setVid] = useState(BUILTIN);
  const [model, setModel] = useState<VoiceModel>("s2.1-pro");
  const [speed, setSpeed] = useState(1);
  const [open, setOpen] = useState(true);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    setVoices(readVoices()); setVid(getStudioVoice() || BUILTIN); setModel(getVoiceModel()); setSpeed(getSpeed());
    const on = () => setModel(getVoiceModel());
    window.addEventListener("voice-model-change", on);
    return () => window.removeEventListener("voice-model-change", on);
  }, []);

  const bump = () => setPulse((p) => p + 1);
  const pickVoice = (id: string) => { setVid(id); setStudioVoice(id); bump(); toast.success(`🎙️ صار الصوت: ${voices.find((v) => v.id === id)?.title ?? "صوت"}`); };
  const pickModel = (m: VoiceModel) => { setModel(m); setVoiceModel(m); window.dispatchEvent(new Event("voice-model-change")); bump(); toast.success("🧠 تغيّر الموديل"); };
  const pickSpeed = (n: number) => { setSpeed(n); saveSpeed(n); bump(); };
  const title = voices.find((v) => v.id === vid)?.title ?? "صوت مختار";
  const modelLabel = VOICE_MODELS.find(([k]) => k === model)?.[1] ?? model;

  return (
    <div className="mb-3 overflow-hidden rounded-2xl border border-primary/40 bg-royal p-3 text-primary-foreground shadow-soft">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 text-start">
        <span key={pulse} className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold text-xl text-accent-foreground animate-in zoom-in-50 duration-300">
          🎛️<span className="absolute inset-0 animate-ping rounded-full bg-gold/40" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">غرفة تحكم الصوت</span>
          <span key={`t${pulse}`} className="block truncate text-xs opacity-85 animate-in fade-in slide-in-from-bottom-1 duration-300">{title} · {modelLabel.split(" (")[0]} · {speed.toFixed(1)}x</span>
        </span>
        <span className={`text-lg transition-transform duration-300 ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <div>
            <p className="mb-1 text-xs font-semibold opacity-80">🎙️ الصوت</p>
            <div className="flex snap-x gap-2 overflow-x-auto pb-1">
              {voices.map((v) => (
                <button key={v.id} type="button" onClick={() => pickVoice(v.id)}
                  className={`shrink-0 snap-start whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition active:scale-90 ${vid === v.id ? "scale-105 border-gold bg-gold text-accent-foreground shadow-soft" : "border-primary-foreground/30 bg-primary-foreground/10"}`}>{v.title}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold opacity-80">🧠 الموديل</p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {VOICE_MODELS.map(([k, l]) => (
                <button key={k} type="button" onClick={() => pickModel(k)}
                  className={`rounded-xl border px-2 py-1.5 text-[11px] leading-tight transition active:scale-90 ${model === k ? "border-gold bg-gold text-accent-foreground" : "border-primary-foreground/30 bg-primary-foreground/10"}`}>{l.split(" (")[0]}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold opacity-80">💗 الإحساس</p>
            <div className="flex flex-wrap gap-1.5">
              {moods.map(([k, l]) => (
                <button key={k} type="button" onClick={() => { setMood(k); bump(); }}
                  className={`rounded-full border px-3 py-1 text-xs transition active:scale-90 ${mood === k ? "border-gold bg-gold text-accent-foreground" : "border-primary-foreground/30 bg-primary-foreground/10"}`}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold opacity-80">⏩ السرعة: {speed.toFixed(1)}x</p>
            <div className="flex items-center gap-2">
              {([[0.9, "🐢"], [1, "🎯"], [1.15, "⚡"]] as const).map(([n, l]) => (
                <button key={n} type="button" onClick={() => pickSpeed(n)} className={`rounded-full border px-2.5 py-1 text-xs active:scale-90 ${speed === n ? "border-gold bg-gold text-accent-foreground" : "border-primary-foreground/30"}`}>{l}</button>
              ))}
              <input type="range" min={0.7} max={1.5} step={0.05} value={speed} onChange={(e) => pickSpeed(Number(e.target.value))} className="min-w-0 flex-1 accent-gold" aria-label="سرعة النطق" />
            </div>
          </div>
          <button type="button" onClick={test} className="w-full rounded-xl bg-gold py-2 text-sm font-bold text-accent-foreground shadow-soft transition active:scale-95">🔊 جرّب الصوت الحين</button>
        </div>
      )}
    </div>
  );
}
