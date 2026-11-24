import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fish: vi.fn(), vault: vi.fn(), newCall: vi.fn(), stop: vi.fn(), destinations: [] as { stream: { getAudioTracks: () => any[]; getTracks: () => any[] } }[], gains: [] as { gain: { value: number }; connect: ReturnType<typeof vi.fn> }[], sources: [] as { connect: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; onended: (() => void) | null }[], notification: null as ((event: any) => void) | null }));
vi.mock("@/lib/phone.functions", () => ({ phoneToken: vi.fn(async () => ({ token: "test", balance: "1", from: "+12025550123" })), phoneCallerIds: vi.fn(async () => ({ owned: [], verified: [] })), phoneVerifyStart: vi.fn(), phoneVerifyConfirm: vi.fn() }));
vi.mock("@/lib/ai.functions", () => ({ fishSpeak: mocks.fish }));
vi.mock("@/lib/call-vault", () => ({ listClips: vi.fn(async () => []), clipUrl: vi.fn(), vaultSpeak: mocks.vault }));
vi.mock("@/lib/voice-model", () => ({ getStudioVoice: () => "test-voice" }));
vi.mock("@telnyx/webrtc", () => ({ TelnyxRTC: class {
  handlers = new Map<string, () => void>();
  on(name: string, cb: () => void) { this.handlers.set(name, cb); if (name === "telnyx.notification") mocks.notification = cb; }
  connect() { this.handlers.get("telnyx.ready")?.(); }
  disconnect() {}
  newCall = mocks.newCall;
} }));

import { WebPhone } from "./WebPhone";
import { listClips, clipUrl } from "@/lib/call-vault";

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
  vi.clearAllMocks(); Recognition.instances = []; mocks.gains = []; mocks.sources = []; mocks.destinations = []; mocks.notification = null;
  mocks.newCall.mockReturnValue({ hangup() {} });
  vi.mocked(listClips).mockResolvedValue([]);
  mocks.fish.mockResolvedValue({ audio: "data:audio/mpeg;base64,AA==" });
  mocks.vault.mockImplementation(async (_text, _voice, gen: () => Promise<string>) => gen());
  vi.stubGlobal("SpeechRecognition", Recognition);
  vi.stubGlobal("AudioContext", class {
    destination = {};
    async resume() {}
    async close() {}
    createMediaElementSource() { return { connect: vi.fn() }; }
    createMediaStreamDestination() {
      const track = { kind: "audio", enabled: true, readyState: "live", stop: vi.fn(() => { track.readyState = "ended"; }) };
      const destination = { stream: { getAudioTracks: () => [track], getTracks: () => [track] } };
      mocks.destinations.push(destination); return destination;
    }
    createGain() { const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }; mocks.gains.push(gain); return gain; }
    createMediaStreamSource() { return { connect: (gain: { connect: () => void }) => gain }; }
    async decodeAudioData() { return {}; }
    createBufferSource() {
      const source = { buffer: null, connect: vi.fn(), start: vi.fn(() => queueMicrotask(() => source.onended?.())), stop: vi.fn(() => source.onended?.()), onended: null as (() => void) | null };
      mocks.sources.push(source); return source;
    }
  });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [], getAudioTracks: () => [] })) } });
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

it("starts listening at a low level and updates the local gain without changing the outgoing audio", async () => {
  render(<WebPhone />);
  fireEvent.change(screen.getByRole("textbox", { name: "نص اختبار النطق" }), { target: { value: "السلام عليكم" } });
  fireEvent.click(screen.getByRole("button", { name: "اسمع الاختبار" }));
  await waitFor(() => expect(mocks.sources).toHaveLength(1));
  expect(mocks.gains[0]?.gain.value).toBe(0.2);
  expect(mocks.sources[0]?.connect).toHaveBeenCalledExactlyOnceWith(mocks.gains[0]);
  fireEvent.change(screen.getByRole("slider"), { target: { value: "5" } });
  expect(mocks.gains[0]?.gain.value).toBe(0.05);
  expect(mocks.newCall).not.toHaveBeenCalled();
  expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
});

it("tests microphone recognition and natural voice locally before placing any call", async () => {
  render(<WebPhone />);
  fireEvent.click(screen.getByRole("button", { name: "المطوّر — طبيعي" }));
  fireEvent.click(screen.getByRole("button", { name: "اختبار المايك" }));
  await waitFor(() => expect(Recognition.instances).toHaveLength(1));
  const recognition = Recognition.instances[0];
  expect(recognition?.continuous).toBe(false);
  expect(recognition?.interimResults).toBe(false);
  await act(async () => recognition?.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: "كيف حالك" }, isFinal: true }] }));
  await waitFor(() => expect(mocks.sources).toHaveLength(1));
  expect(mocks.fish).toHaveBeenCalledWith({ data: expect.objectContaining({ text: "كيف حالك", stable: false, voiceId: "test-voice" }) });
  expect(mocks.sources[0]?.connect).toHaveBeenCalledExactlyOnceWith(mocks.gains[0]);
  expect(mocks.newCall).not.toHaveBeenCalled();
});

it("keeps the actual microphone muted during ringing and only opens it after answer", async () => {
  render(<WebPhone />);
  fireEvent.change(screen.getByPlaceholderText("رقم العميل"), { target: { value: "0500000000" } });
  fireEvent.click(screen.getByRole("button", { name: /^اتصال$/ }));
  await waitFor(() => expect(mocks.newCall).toHaveBeenCalled());
  expect(mocks.gains[1]?.gain.value).toBe(0);
  act(() => mocks.notification?.({ call: { state: "ringing" } }));
  expect(mocks.gains[1]?.gain.value).toBe(0);
  act(() => mocks.notification?.({ call: { state: "active" } }));
  expect(mocks.gains[1]?.gain.value).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: /^تشغيل$/ }));
  expect(mocks.gains[1]?.gain.value).toBe(0);
  act(() => mocks.notification?.({ call: { state: "active" } }));
  expect(mocks.gains[1]?.gain.value).toBe(0);
});

it("cancels pending preview synthesis so it cannot play into a later call", async () => {
  let finish: ((audio: { audio: string }) => void) | undefined;
  mocks.fish.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<WebPhone />);
  fireEvent.change(screen.getByRole("textbox", { name: "نص اختبار النطق" }), { target: { value: "اختبار" } });
  fireEvent.click(screen.getByRole("button", { name: "اسمع الاختبار" }));
  await waitFor(() => expect(mocks.fish).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "إيقاف الاختبار" }));
  await act(async () => finish?.({ audio: "data:audio/mpeg;base64,AA==" }));
  expect(mocks.sources).toHaveLength(0);
  expect(mocks.newCall).not.toHaveBeenCalled();
});

it("replaces a bypass microphone sender with the mixed call track before sending Um Nada", async () => {
  const raw = { kind: "audio", enabled: true, stop: vi.fn() };
  const sender = { track: raw as any, replaceTrack: vi.fn(async (track: any) => { sender.track = track; }) };
  const activeCall = { state: "active", peer: { instance: { getSenders: () => [sender] } }, hangup() {} };
  mocks.newCall.mockReturnValue(activeCall);
  vi.stubGlobal("fetch", vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(1) })));
  render(<WebPhone />);
  fireEvent.change(screen.getByPlaceholderText("رقم العميل"), { target: { value: "0500000000" } });
  fireEvent.click(screen.getByRole("button", { name: /^اتصال$/ }));
  await waitFor(() => expect(mocks.newCall).toHaveBeenCalled());
  act(() => mocks.notification?.({ call: activeCall }));
  await waitFor(() => expect(sender.replaceTrack).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: /^تشغيل$/ }));
  await act(async () => Recognition.instances.at(-1)?.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: "كيف حالك" }, isFinal: true }] }));
  await waitFor(() => expect(mocks.sources).toHaveLength(1));
  expect(sender.track).toBe(mocks.destinations[0]?.stream.getAudioTracks()[0]);
  expect(raw.enabled).toBe(false);
  expect(mocks.gains[1]?.gain.value).toBe(0);
  expect(mocks.sources[0]?.connect).toHaveBeenCalledExactlyOnceWith(mocks.destinations[0]);
});

it("creates a fresh outgoing stream on the next call after the SDK stops the previous track", async () => {
  render(<WebPhone />);
  fireEvent.change(screen.getByPlaceholderText("رقم العميل"), { target: { value: "0500000000" } });
  fireEvent.click(screen.getByRole("button", { name: /^اتصال$/ }));
  await waitFor(() => expect(mocks.newCall).toHaveBeenCalledTimes(1));
  const first = mocks.destinations[0]?.stream;
  first?.getAudioTracks()[0]?.stop();
  fireEvent.click(screen.getByRole("button", { name: "إنهاء" }));
  fireEvent.click(screen.getByRole("button", { name: /^اتصال$/ }));
  await waitFor(() => expect(mocks.newCall).toHaveBeenCalledTimes(2));
  const next = mocks.newCall.mock.calls[1]?.[0]?.localStream;
  expect(next).not.toBe(first);
  expect(next.getAudioTracks()[0]?.readyState).toBe("live");
});

it("recovers an audio sender whose track was detached by the SDK", async () => {
  const sender = { track: null as any, replaceTrack: vi.fn(async (track: any) => { sender.track = track; }) };
  const activeCall = { state: "active", peer: { instance: { getSenders: () => [sender], getTransceivers: () => [{ sender, receiver: { track: { kind: "audio" } } }] } }, hangup() {} };
  mocks.newCall.mockReturnValue(activeCall);
  render(<WebPhone />);
  fireEvent.change(screen.getByPlaceholderText("رقم العميل"), { target: { value: "0500000000" } });
  fireEvent.click(screen.getByRole("button", { name: /^اتصال$/ }));
  await waitFor(() => expect(mocks.newCall).toHaveBeenCalled());
  act(() => mocks.notification?.({ call: activeCall }));
  await waitFor(() => expect(sender.replaceTrack).toHaveBeenCalled());
  expect(sender.track).toBe(mocks.destinations[0]?.stream.getAudioTracks()[0]);
});

it("ignores speech results arriving after the owner stopped Um Nada mode", async () => {
  render(<WebPhone />);
  fireEvent.change(screen.getByPlaceholderText("رقم العميل"), { target: { value: "0500000000" } });
  fireEvent.click(screen.getByRole("button", { name: /^اتصال$/ }));
  await waitFor(() => expect(mocks.newCall).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: /^تشغيل$/ }));
  const recognition = Recognition.instances.at(-1);
  fireEvent.click(screen.getByRole("button", { name: /^إيقاف$/ }));
  await act(async () => recognition?.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: "كلام متأخر" }, isFinal: true }] }));
  expect(mocks.fish).not.toHaveBeenCalled();
});

it.each(["typed", "clip"])("sends %s audio through the call mixer even when local listening volume is zero", async (entry) => {
  vi.mocked(listClips).mockResolvedValue([{ id: "clip", text: "صوت محفوظ" } as any]);
  vi.mocked(clipUrl).mockResolvedValue("data:audio/mpeg;base64,AA==");
  vi.stubGlobal("fetch", vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(1) })));
  const raw = { kind: "audio", enabled: true };
  const sender = { track: raw as any, replaceTrack: vi.fn(async (track: any) => { sender.track = track; }) };
  const activeCall = { state: "active", peer: { instance: { getSenders: () => [sender] } }, hangup() {} };
  mocks.newCall.mockReturnValue(activeCall);
  render(<WebPhone />);
  fireEvent.change(screen.getByPlaceholderText("رقم العميل"), { target: { value: "0500000000" } });
  fireEvent.click(screen.getByRole("button", { name: /^اتصال$/ }));
  await waitFor(() => expect(mocks.newCall).toHaveBeenCalled());
  act(() => mocks.notification?.({ call: activeCall }));
  fireEvent.click(screen.getByRole("button", { name: /^تشغيل$/ }));
  fireEvent.change(screen.getByRole("slider"), { target: { value: "0" } });
  if (entry === "clip") fireEvent.click(await screen.findByRole("button", { name: "صوت محفوظ" }));
  else {
    fireEvent.change(screen.getByPlaceholderText("أو اكتب جملة وتنطق فوراً"), { target: { value: "السلام عليكم" } });
    fireEvent.click(screen.getByRole("button", { name: /^انطق$/ }));
  }
  await waitFor(() => expect(mocks.sources).toHaveLength(1));
  expect(sender.track).toBe(mocks.destinations[0]?.stream.getAudioTracks()[0]);
  expect(mocks.sources[0]?.connect).toHaveBeenCalledWith(mocks.destinations[0]);
  expect(mocks.gains[0]?.gain.value).toBe(0);
  expect(mocks.gains[1]?.gain.value).toBe(0);
  expect(raw.enabled).toBe(false);
});