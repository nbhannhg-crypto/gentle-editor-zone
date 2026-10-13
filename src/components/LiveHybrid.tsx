import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSpeaker } from "@/components/VoiceStudio";

/* نظام الاتصال الهجين — إضافة فقط فوق لوحة المكالمة الحية */

const MODES = [
  ["line", "🔌 مكالمة سلكية بدون صدى"],
  ["ptt", "🎙️ مغير الصوت ← فويس"],
  ["auto", "🤖 الطيار الآلي الصوتي"],
  ["copilot", "🚀 التدخل السريع"],
] as const;
const DIALECTS = [["najdi", "سعودية نجدية"], ["hijazi", "سعودية حجازية"], ["sanaani", "يمنية صنعانية"], ["adeni", "يمنية عدنية"], ["gulf", "خليجية عامة"]] as const;
const MOODS = [["friendly", "ودودة 😊"], ["happy", "فرحانة 🎉"], ["confident", "رسمية وواثقة 💼"], ["calm", "حنونة وصبورة 🤝"]] as const;
const LAUNCH: [string, string][] = [
  ["👋 الترحيب", "يا هلا وغلا، نورت متجرنا، تفضل تحت أمرك"],
  ["💰 الأسعار والضمان", "سعر البكج 150 ريال ويشمل الضمان الذهبي والاستبدال"],
  ["🏦 الحساب والدفع", "تقدر تحول عبر الراجحي أو الأهلي وأرسل لك الرابط فوراً"],
  ["🤝 الاعتراضات", "أبشر بالخير، ما يصير خاطرك إلا طيب وعندنا خصم خاص لك"],
  ["✅ خاتمة البيع", "تم حجز طلبك يا غالي، عطني اللوكيشن أو العنوان للتوصيل"],
];
const HEAT = (t: string) => {
  if (/(تم|أبي|ابغى|أبغى|احجز|اطلب|حول|الرابط|اللوكيشن)/.test(t)) return { k: "🏆 جاهز للشراء", tip: "أرسل رابط الدفع الآن واطلب العنوان.", v: 95 };
  if (/(غالي|كثير|خصم|أرخص|ارخص|السعر)/.test(t)) return { k: "🤔 متردد بسبب السعر", tip: "العميل يرى السعر مرتفعاً — اعرض خصم 10% أو ضمان إضافي.", v: 55 };
  if (/(متى|كم|وين|توصيل|شحن|متوفر)/.test(t)) return { k: "🔥 مهتم جداً", tip: "جاوب بسرعة وأكد التوفر ومدة التوصيل.", v: 75 };
  return { k: "🙂 يستكشف", tip: "رحّب واسأله عن احتياجه بالضبط.", v: 30 };
};

type SR = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };

export function LiveHybrid(p: {
  live: boolean; speaking: boolean; customer: string; log: { who: "c" | "a"; t: string }[];
  say: (t: string) => void; stopAll: () => void;
  send: (a: { text: string; voice: boolean; audio?: string }) => Promise<boolean>;
}) {
  const tts = useSpeaker();
  const [mode, setMode] = useState<string>("copilot");
  const [dialect, setDialect] = useState("najdi");
  const [mood, setMood] = useState("friendly");
  const [guide, setGuide] = useState(false);
  const [rec, setRec] = useState(false);
  const [heard, setHeard] = useState("");
  const [busy, setBusy] = useState(false);
  const srRef = useRef<SR | null>(null);
  const cache = useRef<Record<string, string>>({});

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("live_hybrid") ?? "{}");
      if (s.mode) setMode(s.mode); if (s.dialect) setDialect(s.dialect); if (s.mood) setMood(s.mood);
      cache.current = JSON.parse(localStorage.getItem("live_audio_cache") ?? "{}");
    } catch { /* ignore */ }
  }, []);
  const persist = (o: Record<string, string>) => localStorage.setItem("live_hybrid", JSON.stringify({ mode, dialect, mood, ...o }));

  // توليد مع خزينة مؤقتة: أي رد اتولد مرة ينرسل بعدها مجاناً
  const voiceOf = async (text: string) => {
    const key = `${mood}|${text}`;
    if (cache.current[key]) return cache.current[key];
    const a = await tts(text, { emotion: mood });
    cache.current[key] = a;
    try { localStorage.setItem("live_audio_cache", JSON.stringify(cache.current)); } catch { /* المساحة */ }
    return a;
  };
  const fire = async (text: string) => {
    if (p.live && (mode === "line" || mode === "copilot")) { p.say(text); return; }
    setBusy(true);
    try { await p.send({ text, voice: true, audio: await voiceOf(text) }); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const startPtt = () => {
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const C = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!C) { toast.error("المتصفح ما يدعم تحويل الكلام — جرّب كروم"); return; }
    const r = new C(); r.lang = "ar-SA"; r.interimResults = true; r.continuous = true;
    let final = "";
    r.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      final = t; setHeard(t);
    };
    r.onend = () => { setRec(false); if (final.trim()) void fire(final.trim()); };
    srRef.current = r; setHeard(""); setRec(true); r.start();
  };

  const last = [...p.log].reverse().find((m) => m.who === "c")?.t ?? p.customer;
  const heat = HEAT(last || "");

  const exportReport = () => {
    const txt = p.log.map((m) => `${m.who === "c" ? "الزبون" : "الموظفة"}: ${m.t}`).join("\n");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html dir="rtl"><body style="font-family:sans-serif;padding:24px"><h2>📋 تقرير المكالمة</h2><p>${new Date().toLocaleString("ar")}</p><p>حرارة العميل: ${heat.k}</p><pre style="white-space:pre-wrap">${txt.replace(/</g, "&lt;")}</pre></body></html>`);
    w.document.close(); w.print();
  };

  const box = "rounded-2xl border bg-card p-5 shadow-soft";
  return (
    <div className="space-y-6">
      <section className={box}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-display text-lg">🔀 أوضاع الاتصال الهجين</h3>
          <Button variant="destructive" onClick={() => { p.stopAll(); srRef.current?.stop(); toast("⏹️ انكتم فوراً"); }}>⏹️ كتم فوري</Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {MODES.map(([k, l]) => <Button key={k} size="sm" variant={mode === k ? "default" : "outline"} onClick={() => { setMode(k); persist({ mode: k }); }}>{l}</Button>)}
        </div>

        {mode === "line" && (
          <div className="mt-3 text-sm">
            <p>الموقع يسمع الزبون من المايك وينطق الرد، والصوت يدخل خط المكالمة بالسلك بدون صدى. ابدأ المكالمة من الأعلى.</p>
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => setGuide(!guide)}>🧰 دليل التوصيل السلكي</Button>
            {guide && (
              <ol className="mt-2 list-decimal space-y-1 rounded-xl bg-secondary p-3 pr-6 text-xs">
                <li>مقسم TRRS (رأس 4 أقطاب) في جوال الواتساب: مخرج 🎧 ومخرج 🎙️.</li>
                <li>سلك AUX من سماعة جوال الموقع إلى مدخل 🎙️ في المقسم.</li>
                <li>سماعة أذن في مخرج 🎧 لتسمع الزبون بدون تسريب.</li>
                <li>تحويلة Type-C/Lightning إلى 3.5mm للجوالات الحديثة.</li>
                <li>اختياري: موزع مايك مزدوج بزر كتم لتتدخل بصوتك وقت ما تبي.</li>
                <li>ارفع صوت جوال الموقع للنصف تقريباً عشان ما يتشوه الصوت.</li>
              </ol>
            )}
          </div>
        )}

        {mode === "ptt" && (
          <div className="mt-3 text-sm">
            <p>تكلم بصوتك، والموظفة تعيد جملتك بصوتها وترسلها للزبون فويس (يظهر عنده «يسجل مقطعاً صوتياً»).</p>
            <Button className="mt-2" variant={rec ? "destructive" : "default"} disabled={busy} onClick={() => (rec ? srRef.current?.stop() : startPtt())}>
              {rec ? "⏹️ خلصت — أرسل" : busy ? "…جاري الإرسال" : "🎙️ اضغط وتكلم"}
            </Button>
            {heard && <p className="mt-2 rounded-xl bg-secondary p-2">«{heard}»</p>}
          </div>
        )}

        {mode === "auto" && (
          <p className="mt-3 text-sm">الرد الآلي في الواتساب يفرّغ فويس الزبون ويطابقه مع قواعدك ويرد عليه فويس تلقائياً. فعّل «الرد بالصوت» من إعدادات حساب الواتساب.</p>
        )}

        {mode === "copilot" && (
          <div className="mt-3 grid gap-2">
            {LAUNCH.map(([l, t]) => (
              <button key={l} disabled={busy} onClick={() => fire(t)} className="rounded-xl border bg-background p-3 text-right text-sm hover:bg-secondary">
                <b>{l}</b><span className="block text-xs text-muted-foreground">{t}</span>
              </button>
            ))}
            <p className="text-xs text-muted-foreground">{p.live ? "المكالمة شغالة: ينطقها في المكالمة." : "ينرسل للزبون فويس على الواتساب."}</p>
          </div>
        )}
      </section>

      <section className={box}>
        <h3 className="font-display mb-3 text-lg">🎭 اللهجة والمشاعر</h3>
        <div className="flex flex-wrap gap-1">
          {DIALECTS.map(([k, l]) => <Button key={k} size="sm" variant={dialect === k ? "default" : "outline"} onClick={() => { setDialect(k); persist({ dialect: k }); }}>{l}</Button>)}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {MOODS.map(([k, l]) => <Button key={k} size="sm" variant={mood === k ? "default" : "outline"} onClick={() => { setMood(k); persist({ mood: k }); }}>{l}</Button>)}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">💾 أي رد اتولد مرة ينحفظ ويرسل بعدها بدون ما يخصم رصيد ({Object.keys(cache.current).length} محفوظ).</p>
      </section>

      <section className={box}>
        <h3 className="font-display mb-2 text-lg">🌡️ حرارة العميل</h3>
        <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full bg-primary transition-all" style={{ width: `${heat.v}%` }} />
        </div>
        <p className="mt-2 font-bold">{heat.k}</p>
        <p className="mt-1 rounded-xl bg-secondary p-2 text-sm">🤫 نصيحة: {heat.tip}</p>
        <Button className="mt-3" variant="outline" disabled={!p.log.length} onClick={exportReport}>🖨️ تصدير التقرير PDF</Button>
      </section>
    </div>
  );
}
