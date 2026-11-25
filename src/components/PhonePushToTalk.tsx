import { useEffect, useRef, useState } from "react";
import { Mic, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { transcribePhone } from "@/lib/phone-listen.functions";

type Props = {
  acquire: () => Promise<MediaStream>;
  speak: (text: string) => Promise<void>;
};

// Record the existing capture track, not SpeechRecognition's second microphone.
export function PhonePushToTalk({ acquire, speak }: Props) {
  const [state, setState] = useState<"idle" | "starting" | "recording" | "thinking" | "speaking">("idle");
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const session = useRef(0), held = useRef(false), busy = useRef(false);
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cleanup() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const previous = recorder.current; recorder.current = null;
    if (previous?.state !== "inactive") { try { previous?.stop(); } catch { /* stopped */ } }
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
  }
  function cancel() {
    session.current++; held.current = false; busy.current = false;
    cleanup(); setState("idle");
  }
  useEffect(() => () => { session.current++; cleanup(); }, []);
  function finish() {
    held.current = false;
    if (recorder.current?.state === "recording") recorder.current.stop();
  }
  async function start() {
    if (busy.current) return;
    busy.current = true; held.current = true;
    const id = ++session.current;
    setError(""); setText(""); setState("starting");
    try {
      if (typeof MediaRecorder === "undefined") throw new Error("تسجيل المايك غير مدعوم في هذا المتصفح");
      const captured = await acquire();
      if (session.current !== id) { captured.getTracks().forEach(track => track.stop()); return; }
      stream.current = captured;
      if (!held.current) { cleanup(); busy.current = false; setState("idle"); return; }
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(type => MediaRecorder.isTypeSupported(type));
      const current = new MediaRecorder(captured, mime ? { mimeType: mime } : {});
      recorder.current = current;
      const chunks: Blob[] = [];
      current.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      current.onerror = () => { if (session.current === id) { cancel(); setError("تعذر تسجيل المايك، جرّب مرة ثانية"); } };
      current.onstop = () => {
        if (session.current !== id) return;
        const blob = new Blob(chunks, { type: current.mimeType });
        cleanup(); setState("thinking");
        // A bounded wait and session guards prevent late speech after cancellation.
        timer.current = setTimeout(() => { if (session.current === id) { cancel(); setError("تأخر فهم الكلام، جرّب جملة أقصر"); } }, 20_000);
        void (async () => {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          if (!bytes.length) throw new Error("ما وصل تسجيل، اضغط وتكلم مرة ثانية");
          let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
          const type = current.mimeType.split(";")[0];
          if (type !== "audio/webm" && type !== "audio/mp4" && type !== "audio/ogg") throw new Error("صيغة التسجيل غير مدعومة");
          const result = await transcribePhone({ data: { audio: btoa(binary), mime: type } });
          if (session.current !== id) return;
          if (timer.current) clearTimeout(timer.current); timer.current = null;
          if (!result.text.trim()) throw new Error("ما سمعت كلام واضح، قرّب المايك وجرّب");
          setText(result.text); setState("speaking");
          await speak(result.text);
          if (session.current === id) { busy.current = false; setState("idle"); }
        })().catch(reason => {
          if (session.current !== id) return;
          cancel(); setError(reason instanceof Error ? reason.message : "تعذر فهم الكلام");
        });
      };
      current.start(); setState("recording");
      timer.current = setTimeout(finish, 30_000);
    } catch (reason) {
      if (session.current !== id) return;
      cancel(); setError(reason instanceof Error ? reason.message : "تعذر فتح المايك");
    }
  }
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2">
      <Button variant={state === "recording" ? "destructive" : "outline"} className="touch-none select-none" disabled={state === "thinking" || state === "speaking"}
        onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); void start(); }}
        onPointerUp={finish} onPointerCancel={cancel}
        onKeyDown={event => { if ((event.key === " " || event.key === "Enter") && !event.repeat) { event.preventDefault(); void start(); } }}
        onKeyUp={event => { if (event.key === " " || event.key === "Enter") finish(); }}>
        {state === "recording" ? <Square className="size-4" /> : <Mic className="size-4" />}
        {state === "recording" ? "أسمعك…" : "اضغط وتكلم"}
      </Button>
      {state !== "idle" && state !== "speaking" && <Button variant="ghost" size="icon" aria-label="إلغاء التسجيل" onClick={cancel}><X className="size-4" /></Button>}
    </div>
    <p role="status" className="text-xs text-muted-foreground">{state === "starting" ? "يفتح المايك…" : state === "thinking" ? "يفهم كلامك…" : state === "speaking" ? "ينطق…" : text}</p>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}