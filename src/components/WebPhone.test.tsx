import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fish: vi.fn(), vault: vi.fn(), newCall: vi.fn(), stop: vi.fn() }));
vi.mock("@/lib/phone.functions", () => ({ phoneToken: vi.fn(async () => ({ token: "test", balance: "1", from: "+12025550123" })), phoneCallerIds: vi.fn(async () => ({ owned: [], verified: [] })), phoneVerifyStart: vi.fn(), phoneVerifyConfirm: vi.fn() }));
vi.mock("@/lib/ai.functions", () => ({ fishSpeak: mocks.fish }));
vi.mock("@/lib/call-vault", () => ({ listClips: vi.fn(async () => []), clipUrl: vi.fn(), vaultSpeak: mocks.vault }));
vi.mock("@/lib/voice-model", () => ({ getStudioVoice: () => "test-voice" }));
vi.mock("@telnyx/webrtc", () => ({ TelnyxRTC: class {
  handlers = new Map<string, () => void>();
  on(name: string, cb: () => void) { this.handlers.set(name, cb); }
  connect() { this.handlers.get("telnyx.ready")?.(); }
  disconnect() {}
  newCall = mocks.newCall;
} }));

import { WebPhone } from "./WebPhone";

type ResultHandler = (e: { resultIndex: number; results: { 0: { transcript: string }; isFinal: boolean }[] }) => void;
class Recognition {
  static instances: Recognition[] = [];
  continuous = true; interimResults = true; lang = ""; maxAlternatives = 1;
  onresult: ResultHandler | null = null;
  onend: (() => void) | null = null;
  start() { Recognition.instances.push(this); }
  stop() { mocks.stop(); this.onend?.(); }
}

beforeEach(() => {
  vi.clearAllMocks(); Recognition.instances = [];
  mocks.newCall.mockReturnValue({ hangup() {} });
  mocks.fish.mockResolvedValue({ audio: "data:audio/mpeg;base64,AA==" });
  mocks.vault.mockImplementation(async (_text, _voice, gen: () => Promise<string>) => gen());
  vi.stubGlobal("SpeechRecognition", Recognition);
  vi.stubGlobal("AudioContext", class {
    destination = {};
    async resume() {}
    createMediaStreamDestination() { return { stream: {} }; }
    createGain() { return { gain: { value: 1 }, connect() {} }; }
    createMediaStreamSource() { return { connect: (gain: { connect: () => void }) => gain }; }
    async decodeAudioData() { return {}; }
    createBufferSource() { return { buffer: null, connect() {}, start() {}, onended: null }; }
  });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(async () => ({})) } });
});

it("switches an active phone from previous to broadcast recognition and natural synthesis, then back", async () => {
  render(<WebPhone />);
  fireEvent.change(screen.getByPlaceholderText("رقم العميل"), { target: { value: "0500000000" } });
  fireEvent.click(screen.getByRole("button", { name: /^اتصال$/ }));
  await waitFor(() => expect(mocks.newCall).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: /^تشغيل$/ }));
  const old = Recognition.instances.at(-1);
  expect(old?.continuous).toBe(true);
  expect(old?.interimResults).toBe(true);

  fireEvent.click(screen.getByRole("button", { name: "المطوّر — طبيعي" }));
  const natural = Recognition.instances.at(-1);
  expect(natural?.continuous).toBe(false);
  expect(natural?.interimResults).toBe(false);
  await act(async () => natural?.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: "السلام عليكم" }, isFinal: true }] }));
  expect(mocks.fish).toHaveBeenLastCalledWith({ data: expect.objectContaining({ text: "السلام عليكم", stable: false, voiceId: "test-voice" }) });
  expect(mocks.vault).toHaveBeenLastCalledWith("السلام عليكم", expect.objectContaining({ synthesisProfile: "phone-natural-v1" }), expect.any(Function));

  fireEvent.click(screen.getByRole("button", { name: "السابق — ثابت" }));
  const previous = Recognition.instances.at(-1);
  expect(previous?.continuous).toBe(true);
  await act(async () => previous?.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: "السلام عليكم" }, isFinal: true }] }));
  expect(mocks.fish).toHaveBeenLastCalledWith({ data: expect.objectContaining({ stable: true }) });
  expect(mocks.vault.mock.calls.at(-1)?.[1]).not.toHaveProperty("synthesisProfile");
});