import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Blob as NodeBlob } from "node:buffer";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transcribe: vi.fn() }));
vi.mock("@/lib/phone-listen.functions", () => ({ transcribePhone: mocks.transcribe }));
import { PhonePushToTalk } from "./PhonePushToTalk";

class Recorder {
  static instances: Recorder[] = [];
  static isTypeSupported() { return true; }
  state = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() { Recorder.instances.push(this); }
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["recorded speech"]) }); this.onstop?.(); }
}
function setup() {
  const stop = vi.fn();
  const acquire = vi.fn(async () => ({ getTracks: () => [{ stop }] }) as unknown as MediaStream);
  const speak = vi.fn(async () => {});
  render(<PhonePushToTalk acquire={acquire} speak={speak} />);
  const button = screen.getByRole("button", { name: "اضغط وتكلم" });
  button.setPointerCapture = vi.fn();
  return { button, acquire, speak, stop };
}
beforeEach(() => {
  vi.clearAllMocks(); Recorder.instances = [];
  vi.stubGlobal("MediaRecorder", Recorder); vi.stubGlobal("Blob", NodeBlob);
  mocks.transcribe.mockResolvedValue({ text: "ما أبي أغير صوتي" });
});
afterEach(() => vi.useRealTimers());

it("records the supplied microphone and sends literal text only after release", async () => {
  const { button, acquire, speak, stop } = setup();
  fireEvent.pointerDown(button);
  await waitFor(() => expect(Recorder.instances[0]?.state).toBe("recording"));
  expect(acquire).toHaveBeenCalledTimes(1);
  expect(mocks.transcribe).not.toHaveBeenCalled();
  fireEvent.pointerUp(button);
  await waitFor(() => expect(speak).toHaveBeenCalledWith("ما أبي أغير صوتي"));
  expect(mocks.transcribe).toHaveBeenCalledWith({ data: { audio: btoa("recorded speech"), mime: "audio/webm" } });
  expect(stop).toHaveBeenCalledTimes(1);
});

it("ignores transcription arriving after cancellation and permits a retry", async () => {
  let resolve: ((result: { text: string }) => void) | undefined;
  mocks.transcribe.mockImplementation(() => new Promise(done => { resolve = done; }));
  const { button, speak } = setup();
  fireEvent.pointerDown(button);
  await waitFor(() => expect(Recorder.instances[0]?.state).toBe("recording"));
  fireEvent.pointerUp(button);
  await waitFor(() => expect(mocks.transcribe).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "إلغاء التسجيل" }));
  await act(async () => resolve?.({ text: "كلام متأخر" }));
  expect(speak).not.toHaveBeenCalled();
  fireEvent.pointerDown(button);
  await waitFor(() => expect(Recorder.instances).toHaveLength(2));
});

it("does not generate speech for silence", async () => {
  mocks.transcribe.mockResolvedValue({ text: "" });
  const { button, speak } = setup();
  fireEvent.pointerDown(button);
  await waitFor(() => expect(Recorder.instances[0]?.state).toBe("recording"));
  fireEvent.pointerUp(button);
  await waitFor(() => expect(mocks.transcribe).toHaveBeenCalled());
  await act(async () => {});
  expect(speak).not.toHaveBeenCalled();
});

it("releases a microphone acquired after the owner already released the button", async () => {
  let resolve: ((stream: MediaStream) => void) | undefined;
  const stop = vi.fn(), speak = vi.fn();
  render(<PhonePushToTalk acquire={() => new Promise(done => { resolve = done; })} speak={speak} />);
  const button = screen.getByRole("button", { name: "اضغط وتكلم" }); button.setPointerCapture = vi.fn();
  fireEvent.pointerDown(button); fireEvent.pointerUp(button);
  await act(async () => resolve?.({ getTracks: () => [{ stop }] } as unknown as MediaStream));
  expect(stop).toHaveBeenCalledOnce();
  expect(Recorder.instances).toHaveLength(0);
  expect(mocks.transcribe).not.toHaveBeenCalled();
});

it("stops waiting for an unresponsive transcription without playing its late result", async () => {
  let resolve: ((result: { text: string }) => void) | undefined;
  mocks.transcribe.mockImplementation(() => new Promise(done => { resolve = done; }));
  const { button, speak } = setup();
  fireEvent.pointerDown(button);
  await waitFor(() => expect(Recorder.instances[0]?.state).toBe("recording"));
  vi.useFakeTimers();
  fireEvent.pointerUp(button);
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
  await act(async () => resolve?.({ text: "تأخر" }));
  expect(speak).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "اضغط وتكلم" }).hasAttribute("disabled")).toBe(false);
});