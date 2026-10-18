// Shared voice-model choice, persisted in the browser (call only from effects/handlers).
export const VOICE_MODELS = [
  ["s2.1-pro", "⭐ S2.1-PRO (الموزون)"],
  ["s2-pro", "⚡ S2-PRO (المتقدم)"],
  ["fast", "🎯 السريع الاقتصادي"],
  ["s1", "📻 S1 (الكلاسيكي)"],
] as const;
export type VoiceModel = (typeof VOICE_MODELS)[number][0];
export const DEFAULT_VOICE_MODEL: VoiceModel = "s2.1-pro";
const KEY = "voice_model_v1";
const VKEY = "studio_voice_v1";

export function getVoiceModel(): VoiceModel {
  if (typeof window === "undefined") return DEFAULT_VOICE_MODEL;
  const v = localStorage.getItem(KEY);
  return (VOICE_MODELS.some(([k]) => k === v) ? v : DEFAULT_VOICE_MODEL) as VoiceModel;
}
export function setVoiceModel(m: VoiceModel) { try { localStorage.setItem(KEY, m); } catch { /* ignore */ } }
export function getStudioVoice(): string | null { try { return localStorage.getItem(VKEY); } catch { return null; } }
export function setStudioVoice(v: string) { try { localStorage.setItem(VKEY, v); } catch { /* ignore */ } }
