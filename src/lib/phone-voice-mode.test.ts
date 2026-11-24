import { describe, expect, it } from "vitest";
import { phoneVoiceProfile } from "./phone-voice-mode";

describe("phone comparison modes", () => {
  it("keeps the previous phone recognition and stable voice", () => {
    expect(phoneVoiceProfile("previous")).toEqual({ continuous: true, interimResults: true, maxAlternatives: 1, stable: true });
  });
  it("uses broadcast sentence recognition and natural voice for the additive mode", () => {
    expect(phoneVoiceProfile("developed")).toEqual({ continuous: false, interimResults: false, maxAlternatives: 1, stable: false, synthesisProfile: "phone-natural-v1" });
  });
});