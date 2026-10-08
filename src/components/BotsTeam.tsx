import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BOTS } from "@/lib/bots";
import { botRun } from "@/lib/bots.functions";
import { useSpeaker } from "@/components/VoiceStudio";

type Out = { bot: string; order: string; text: string };

export function BotsTeam() {
  const run = useServerFn(botRun);
  const speak = useSpeaker();
  const [bot, setBot] = useState<string>("auto");
  const [order, setOrder] = useState("");
  const [busy, setBusy] = useState(false);
  const [outs, setOuts] = useState<Out[]>([]);
  const [listening, setListening] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cur = BOTS.find((b) => b.id === bot);

  const go = async (): Promise<void> => {
    if (order.trim().length < 2) { toast.error("اكتب أمرك أول"); return; }
    setBusy(true);
    try {
      const r = await run({ data: { bot, order } });
      setOuts((o) => [{ bot: cur?.name ?? "👑 الملكة", order, text: r.text }, ...o].slice(0, 20));
      setOrder("");
      window.dispatchEvent(new Event("wallet-changed"));
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const mic = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error("المايك يشتغل على متصفح كروم"); return; }
    const r = new SR(); r.lang = "ar-SA"; r.interimResults = false;
    r.onresult = (e: any) => setOrder((o) => (o ? o + " " : "") + e.results[0][0].transcript);
    r.onend = () => setListening(false);
    setListening(true); r.start();
  };

  const listen = async (t: string) => {
    try { const a = await speak(t.slice(0, 600)); audioRef.current?.pause(); audioRef.current = new Audio(a); await audioRef.current.play(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="font-display text-xl">🤖 فريق البوتات — أنتِ تأمرين وهم ينفذون</h2>
        <p className="mt-1 text-sm text-muted-foreground">اختاري بوت أو خلّي «الملكة» تفهم طلبك وتنفذه. كل أمر = نقطتين.</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <button onClick={() => setBot("auto")} className={`rounded-xl border-2 p-3 text-right text-sm ${bot === "auto" ? "border-primary bg-secondary" : "border-transparent bg-muted"}`}>
            <b>👑 الملكة — تفهم كل شي</b><div className="text-xs text-muted-foreground">قولي أي طلب وهي تختار الخبرة</div>
          </button>
          {BOTS.map((b) => (
            <button key={b.id} onClick={() => setBot(b.id)} className={`rounded-xl border-2 p-3 text-right text-sm ${bot === b.id ? "border-primary bg-secondary" : "border-transparent bg-muted"}`}>
              <b>{b.icon} {b.name}</b><div className="text-xs text-muted-foreground">{b.job}</div>
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          <Textarea rows={3} value={order} onChange={(e) => setOrder(e.target.value.slice(0, 1500))}
            placeholder={cur?.hint ?? "قولي أي شي: اكتبي لي عرض، رد على زبونة، خطة تسويق، منشورات…"}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void go(); }} />
          <div className="flex gap-2">
            <Button onClick={go} disabled={busy} className="flex-1">{busy ? "⏳ البوت يشتغل…" : "⚡ نفّذي"}</Button>
            <Button variant="secondary" onClick={mic} disabled={listening}>{listening ? "🎙️ أسمعك…" : "🎙️ بالصوت"}</Button>
          </div>
        </div>
      </section>
      {outs.map((o, i) => (
        <section key={i} className="rounded-2xl border bg-card p-5">
          <p className="text-xs text-muted-foreground">{o.bot} • الأمر: {o.order}</p>
          <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{o.text}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(o.text); toast.success("انسخ ✅"); }}>📋 نسخ</Button>
            <Button size="sm" variant="outline" onClick={() => listen(o.text)}>🔊 اسمعيها بالصوت السعودي</Button>
            <Button size="sm" variant="outline" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(o.text)}`, "_blank")}>🟢 أرسلي واتساب</Button>
          </div>
        </section>
      ))}
    </div>
  );
}
