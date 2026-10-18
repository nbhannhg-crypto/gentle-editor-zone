import { useEffect, useState } from "react";
import { VOICE_MODELS, DEFAULT_VOICE_MODEL, getVoiceModel, setVoiceModel, type VoiceModel } from "@/lib/voice-model";

/** قائمة موديل الصوت المشتركة — تحفظ الاختيار وتتزامن بين كل الشاشات */
export function VoiceModelPicker({ className = "" }: { className?: string }) {
  const [m, setM] = useState<VoiceModel>(DEFAULT_VOICE_MODEL);
  useEffect(() => {
    setM(getVoiceModel());
    const on = () => setM(getVoiceModel());
    window.addEventListener("voice-model-change", on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener("voice-model-change", on); window.removeEventListener("storage", on); };
  }, []);
  return (
    <label className={`inline-flex items-center gap-2 text-xs ${className}`}>
      <span className="text-muted-foreground">🎛️ الموديل:</span>
      <select
        value={m}
        onChange={(e) => { const v = e.target.value as VoiceModel; setVoiceModel(v); setM(v); window.dispatchEvent(new Event("voice-model-change")); }}
        className="rounded-md border bg-background px-2 py-1 text-xs"
      >
        {VOICE_MODELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </label>
  );
}
