import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  factoryAddNote,
  factoryData,
  factoryDelGolden,
  factoryDelNote,
  factoryPlay,
  factoryRunNow,
  factorySaveGolden,
  factoryTry,
  factoryWrong,
} from "@/lib/factory.functions";

type Variant = { mood: string; speed: number; score: number; heard: string; audio: string };
type Golden = { id: string; text: string; path: string; score: number; mood: string; created_at: string };
type Retrain = { id: string; text: string; note: string; attempts: number; last_score: number };
type Note = { id: string; word: string; say: string };
type Log = { summary: string; trained: number; created_at: string };

const PRESETS = [
  { label: "دلع", mood: "دلع", speed: 1 },
  { label: "عادي", mood: "", speed: 1 },
  { label: "حماسية", mood: "حماسية", speed: 1.05 },
];

function scoreBadge(score: number) {
  if (score >= 95) return "✅ نطق ممتاز";
  if (score >= 85) return "🟡 جيد — ممكن تحسينه";
  return "🔴 تحتاج تدريب";
}

export default function FactoryLab() {
  const [text, setText] = useState("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [golden, setGolden] = useState<Golden[]>([]);
  const [retrain, setRetrain] = useState<Retrain[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [noteF, setNoteF] = useState({ word: "", say: "" });
  const [playing, setPlaying] = useState<string | null>(null);

  const load = async () => {
    try {
      const d = await factoryData();
      setGolden(d.golden);
      setRetrain(d.retrain);
      setNotes(d.notes);
      setLogs(d.logs);
    } catch (e) {
      { const m = String((e as Error).message); if (!m.includes("Missing Supabase")) toast.error(m); }
    }
  };
  useEffect(() => { load(); }, []);

  const runTry = async () => {
    if (!text.trim()) { toast.error("اكتب النص أولاً"); return; }
    setBusy("try");
    try {
      const res = await factoryTry({ data: { text: text.trim(), variants: PRESETS.map((p) => ({ mood: p.mood, speed: p.speed })) } });
      setVariants(res.variants);
    } catch (e) {
      { const m = String((e as Error).message); if (!m.includes("Missing Supabase")) toast.error(m); }
    }
    setBusy(null);
  };

  const save = async (v: Variant) => {
    setBusy(`save-${v.audio.slice(-10)}`);
    try {
      await factorySaveGolden({ data: { text: text.trim(), audioB64: v.audio, score: v.score, mood: v.mood, speed: v.speed } });
      toast.success("انحفظت في مكتبة الجاهز ✅");
      await load();
    } catch (e) {
      { const m = String((e as Error).message); if (!m.includes("Missing Supabase")) toast.error(m); }
    }
    setBusy(null);
  };

  const wrong = async () => {
    if (!text.trim()) return;
    setBusy("wrong");
    try {
      await factoryWrong({ data: { text: text.trim(), note: noteF.say } });
      toast.success("انحطت في طابور التدريب 🔁");
      await load();
    } catch (e) {
      { const m = String((e as Error).message); if (!m.includes("Missing Supabase")) toast.error(m); }
    }
    setBusy(null);
  };

  const train = async () => {
    setBusy("train");
    try {
      const r = await factoryRunNow();
      toast.success(r.summary);
      await load();
    } catch (e) {
      { const m = String((e as Error).message); if (!m.includes("Missing Supabase")) toast.error(m); }
    }
    setBusy(null);
  };

  const playGolden = async (id: string) => {
    try {
      setPlaying(id);
      const { url } = await factoryPlay({ data: { id } });
      const a = new Audio(url);
      a.onended = () => setPlaying(null);
      await a.play();
    } catch (e) {
      setPlaying(null);
      { const m = String((e as Error).message); if (!m.includes("Missing Supabase")) toast.error(m); }
    }
  };

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-soft">
      <h2 className="font-display mb-1 text-lg text-primary">🎙️ مصنع الأصوات السعودية</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        مختبارك الخاص: ولّد نسخ من صوتك، قيس نطقها تلقائياً، واحفظ الصح فقط. الصح يتدرب مع ملاحظاتك، والغلط يرجع للطابور.
      </p>

      {/* Lab */}
      <textarea
        className="w-full rounded-lg border bg-background px-3 py-2"
        rows={3}
        maxLength={500}
        placeholder="اكتب نص تجربة الصوت… مثال: أهلاً فيك حبيبي، عندنا عرض اليوم خصم ٣٠٪ على الكل"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" disabled={busy !== null} onClick={runTry}>{busy === "try" ? "👑 نولّد ونقيس…" : "🎙️ ولّدي 3 نسخ وقيّمها"}</Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={wrong}>{busy === "wrong" ? "…" : "❌ هذا غلط — درّبيها"}</Button>
      </div>

      {variants.length > 0 && (
        <div className="mt-4 space-y-2">
          {variants.map((v, i) => (
            <div key={i} className="rounded-xl border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <b>{(PRESETS[i]?.label ?? v.mood) || "عادي"}</b>
                <span className={v.score >= 95 ? "text-emerald-600" : v.score >= 85 ? "text-amber-600" : "text-rose-600"}>{scoreBadge(v.score)}</span>
                <span className="text-xs text-muted-foreground">{v.score}% تطابق</span>
              </div>
              <audio controls src={v.audio} className="mt-2 w-full" />
              <div className="mt-2 flex gap-2">
                <Button size="sm" disabled={busy !== null} onClick={() => save(v)}>✅ هذا صح احفظها</Button>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={wrong}>❌ درّبيها</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      <div className="mt-6">
        <h3 className="font-display mb-2 text-base text-primary">📝 تعليم النطق</h3>
        <p className="mb-2 text-xs text-muted-foreground">إذا صوتك ينطق كلمة غلط، اكتبي الكلمة وكيف تنطق صح — التدريب يستخدمها تلقائياً.</p>
        <div className="flex flex-wrap gap-2">
          <input className="min-w-24 flex-1 rounded-lg border bg-background px-2 py-2 text-sm" placeholder="الكلمة: مثال: وصل" value={noteF.word} onChange={(e) => setNoteF({ ...noteF, word: e.target.value })} aria-label="الكلمة" />
          <input className="min-w-24 flex-1 rounded-lg border bg-background px-2 py-2 text-sm" placeholder="انطقيها: مثال: وصِّل" value={noteF.say} onChange={(e) => setNoteF({ ...noteF, say: e.target.value })} aria-label="النطق" />
          <Button size="sm" disabled={busy !== null || !noteF.word.trim() || !noteF.say.trim()} onClick={async () => {
            setBusy("note");
            try { await factoryAddNote({ data: { word: noteF.word.trim(), say: noteF.say.trim() } }); setNoteF({ word: "", say: "" }); await load(); toast.success("انحفظت"); }
            catch (e) { { const m = String((e as Error).message); if (!m.includes("Missing Supabase")) toast.error(m); } }
            setBusy(null);
          }}>➕ علّمي</Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {notes.map((n) => (
            <span key={n.id} className="flex items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs">
              {n.word} ← {n.say}
              <button aria-label="حذف" className="text-destructive" onClick={async () => { await factoryDelNote({ data: { id: n.id } }); load(); }}>×</button>
            </span>
          ))}
        </div>
      </div>

      {/* Retrain queue */}
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-base text-primary">🔁 طابور التدريب ({retrain.length})</h3>
          <Button size="sm" disabled={busy !== null || retrain.length === 0} onClick={train}>{busy === "train" ? "👑 دربي…" : "⚡ درّبي الآن (6)"}</Button>
        </div>
        {retrain.length === 0 ? <p className="text-xs text-muted-foreground">ما فيه نصوص تنتظر التدريب.</p> : retrain.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
            <span className="flex-1">{r.text}</span>
            <span className="text-xs text-muted-foreground">{r.attempts} محاولة • {r.last_score}%</span>
          </div>
        ))}
        <p className="mt-1 text-xs text-muted-foreground">التدريب يشتغل تلقائياً كل يوم الساعة ٦ صباحاً (٣ الفجر بتوقيتك) — وكل نص تنتظر بالطابور ياخذ نسخ ويقاس النطق، الصح فقط ينحفظ.</p>
      </div>

      {/* Golden library */}
      <div className="mt-6">
        <h3 className="font-display mb-2 text-base text-primary">📚 مكتبة الأصوات الجاهزة ({golden.length})</h3>
        {golden.length === 0 ? <p className="text-xs text-muted-foreground">ما فيه أصوات جاهزة بعد — جربي النص فوق واحفظي الصح.</p> : golden.map((g) => (
          <div key={g.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
            <button aria-label="تشغيل" className="text-xl" onClick={() => playGolden(g.id)}>{playing === g.id ? "⏸" : "▶️"}</button>
            <span className="flex-1">{g.text}</span>
            <span className="text-xs text-muted-foreground">{g.mood || "عادي"} • {g.score}%</span>
            <button aria-label="حذف" className="text-destructive" onClick={async () => { await factoryDelGolden({ data: { id: g.id, path: g.path } }); await load(); toast.info("انحذف"); }}>🗑️</button>
          </div>
        ))}
      </div>

      {/* Logs */}
      {logs.length > 0 && (
        <div className="mt-6">
          <h3 className="font-display mb-2 text-base text-primary">📋 سجل التدريب</h3>
          <div className="space-y-1 text-xs text-muted-foreground">
            {logs.map((l, i) => <p key={i}>• {new Date(l.created_at).toLocaleString("ar-SA")} — {l.summary}</p>)}
          </div>
        </div>
      )}
    </section>
  );
}
