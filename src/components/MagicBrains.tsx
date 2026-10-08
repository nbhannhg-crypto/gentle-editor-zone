import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { magicBrain } from "@/lib/ai.functions";

const KINDS = [
  { k: "intent", e: "🔮", n: "قارئة النية", d: "الصقي رسالة الزبون — تقولك يشتري ولا يستهبل", p: "هلااااا كم سعره؟ 😍" },
  { k: "objection", e: "💍", n: "حلّالة الأعذار", d: "عذر الزبون (زوجي ما يخليني، بفكر…) وتعطيك 3 ردود لطيفة", p: "زوجي ما يخليني اشتري" },
  { k: "dream", e: "🌙", n: "الحالمة", d: "قولي مزاجك أو حلمك وتحوله لخطة بيع اليوم", p: "حلمت اني اطير" },
  { k: "meeting", e: "🏛️", n: "اجتماع العقول اليومي", d: "اكتبي منتجاتك ووضعك — العقول تجتمع وتقرر خطة اليوم", p: "عندي عطور وبخور، المبيعات هالأسبوع ضعيفة" },
  { k: "tutor", e: "📚", n: "ربّي ولدك", d: "اكتبي واجب ولدك وتشرحه له بلهجة سعودية", p: "رياضيات صف ثالث: 24 ÷ 6 = ؟" },
] as const;
const LV: Record<string, string> = { hot: "🔥 بيشتري — اضغطي عليه", warm: "🙂 مهتم — كمّلي معه", cold: "🧊 غالباً يستهبل — لا تضيعين وقتك" };

export function MagicBrains() {
  const run = useServerFn(magicBrain);
  const [kind, setKind] = useState<(typeof KINDS)[number]["k"]>("intent");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ level: string; label: string; why: string; reply: string } | null>(null);
  const [err, setErr] = useState("");
  const cur = KINDS.find((x) => x.k === kind)!;
  async function go() {
    if (!text.trim()) return;
    setBusy(true); setErr(""); setRes(null);
    try { setRes(await run({ data: { kind, text } })); } catch (e) { setErr(e instanceof Error ? e.message : "صار خطأ"); }
    setBusy(false);
  }
  function speak() {
    if (!res) return;
    const u = new SpeechSynthesisUtterance(`${res.label}. ${res.reply}`.replace(/[#*]/g, ""));
    u.lang = "ar-SA"; speechSynthesis.cancel(); speechSynthesis.speak(u);
  }
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4">
        <h2 className="text-lg font-bold">✨ عقول الإلهام</h2>
        <p className="text-sm text-muted-foreground">عقول خاصة تحس فيك وفي زبونك</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {KINDS.map((x) => (
          <button key={x.k} onClick={() => { setKind(x.k); setRes(null); }}
            className={`rounded-xl border p-3 text-right text-sm transition ${kind === x.k ? "border-primary bg-primary/10" : "bg-card hover:bg-muted"}`}>
            <div className="text-2xl">{x.e}</div><div className="font-bold">{x.n}</div>
          </button>
        ))}
      </div>
      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <p className="text-sm text-muted-foreground">{cur.e} {cur.d}</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={cur.p} rows={4}
          className="w-full rounded-xl border bg-background p-3 text-sm" />
        <button onClick={go} disabled={busy} className="w-full rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50">
          {busy ? "العقل يفكر…" : `${cur.e} شغّلي العقل`}
        </button>
        {err && <p className="text-sm text-destructive">{err}</p>}
        {res && (
          <div className="space-y-2 rounded-xl bg-muted p-3">
            {res.level && <div className="font-bold">{LV[res.level]}</div>}
            {res.label && <div className="font-bold">{res.label}</div>}
            {res.why && <p className="text-sm text-muted-foreground">{res.why}</p>}
            <div className="prose prose-sm max-w-none whitespace-pre-wrap"><ReactMarkdown>{res.reply}</ReactMarkdown></div>
            <div className="flex gap-2">
              <button onClick={() => navigator.clipboard.writeText(res.reply)} className="rounded-lg border px-3 py-1 text-sm">📋 نسخ</button>
              <button onClick={speak} className="rounded-lg border px-3 py-1 text-sm">🔊 اسمعي</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
