export type PhoneVoiceMode = "previous" | "developed";

export function phoneVoiceProfile(mode: PhoneVoiceMode) {
  return mode === "developed"
    ? { continuous: false, interimResults: false, maxAlternatives: 1, stable: false, synthesisProfile: "phone-natural-v1" }
    : { continuous: true, interimResults: true, maxAlternatives: 1, stable: true };
}