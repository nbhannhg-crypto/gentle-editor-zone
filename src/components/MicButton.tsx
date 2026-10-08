import { useRef, useState } from "react";
import { toast } from "sonner";

/** 🎤 Speech-to-text button (Saudi Arabic) using the browser's speech recognition. */
export function MicButton({ onText, className = "" }: { onText: (t: string) => void; className?: string }) {
  const [on, setOn] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rec = useRef<any>(null);
  const start = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const W = window as any;
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!SR) { toast.error("متصفحك ما يدعم الكتابة بالصوت، جرب Chrome"); return; }
    if (on) { rec.current?.stop(); return; }
    const r = new SR();
    r.lang = "ar-SA"; r.interimResults = false; r.continuous = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => onText(Array.from(e.results).map((x: any) => x[0].transcript).join(" "));
    r.onerror = () => setOn(false);
    r.onend = () => setOn(false);
    rec.current = r; r.start(); setOn(true);
  };
  return (
    <button type="button" onClick={start} title="تكلم" aria-label="الكتابة بالصوت"
      className={`shrink-0 rounded-full px-3 py-2 text-sm ${on ? "animate-pulse bg-destructive text-destructive-foreground" : "bg-secondary text-secondary-foreground"} ${className}`}>🎤</button>
  );
}
