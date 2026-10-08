import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { analyzeDeal, lieCheck } from "@/lib/ai.functions";

type Verdict = "sold" | "hot" | "cold" | "lost";
type Result = { verdict: Verdict; score: number; summary: string; tips: string[] };
type Lie = { risk: "low" | "mid" | "high"; signals: string[]; advice: string };
type Convo = { key: string; name: string; lines: { who: "c" | "a"; t: string }[]; result?: Result | undefined; lie?: Lie | undefined; busy?: boolean | undefined; lieBusy?: boolean | undefined };

const LIES: Record<Lie["risk"], { label: string; cls: string }> = {
  low: { label: "✅ كلامه طبيعي", cls: "bg-green-100 text-green-800" },
  mid: { label: "⚠️ انتبهي له", cls: "bg-yellow-100 text-yellow-800" },
  high: { label: "🚨 غالباً يتلاعب", cls: "bg-red-100 text-red-800" },
};

const VERDICTS: Record<Verdict, { label: string; cls: string }> = {
  sold: { label: "✅ تم البيع", cls: "bg-green-100 text-green-800" },
  hot: { label: "🔥 مهتم جداً", cls: "bg-orange-100 text-orange-800" },
  cold: { label: "🤔 متردد", cls: "bg-yellow-100 text-yellow-800" },
  lost: { label: "❌ رفض", cls: "bg-red-100 text-red-800" },
};

export function DealEye({ storeId }: { storeId?: string | undefined }) {
  const [convos, setConvos] = useState<Convo[]>([]);
  const [pasted, setPasted] = useState("");
  const [pasteResult, setPasteResult] = useState<Result | null>(null);
  const [pasteLie, setPasteLie] = useState<Lie | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const map = new Map<string, Convo>();
      let iq = supabase.from("wa_inbox").select("from_number, text, reply, created_at").order("created_at").limit(300);
      if (storeId) iq = iq.eq("store_id", storeId);
      const { data: inbox } = await iq;
      for (const r of inbox ?? []) {
        const key = `wa:${r.from_number}`;
        const c = map.get(key) ?? { key, name: r.from_number || "واتساب", lines: [] };
        if (r.text) c.lines.push({ who: "c", t: r.text });
        if (r.reply) c.lines.push({ who: "a", t: r.reply });
        map.set(key, c);
      }
      let mq = supabase.from("channel_messages").select("customer_name, customer_phone, direction, text, created_at").order("created_at").limit(300);
      if (storeId) mq = mq.eq("store_id", storeId);
      const { data: msgs } = await mq;
      for (const r of msgs ?? []) {
        const key = `ch:${r.customer_phone || r.customer_name}`;
        const c = map.get(key) ?? { key, name: r.customer_name || r.customer_phone || "زبون", lines: [] };
        if (r.text) c.lines.push({ who: r.direction === "in" ? "c" : "a", t: r.text });
        map.set(key, c);
      }
      setConvos([...map.values()].filter((c) => c.lines.length >= 2).slice(0, 30));
      setLoading(false);
    })();
  }, [storeId]);

  const analyze = async (lines: { who: "c" | "a"; t: string }[]): Promise<Result | null> => {
    try {
      return (await analyzeDeal({ data: { conversation: lines.slice(-40) } })) as Result;
    } catch {
      toast.error("تعذر التحليل — جرب بعد شوي");
      return null;
    }
  };

  const analyzeOne = async (key: string) => {
    setConvos((cs) => cs.map((c) => (c.key === key ? { ...c, busy: true } : c)));
    const c = convos.find((x) => x.key === key);
    const r = c ? await analyze(c.lines) : null;
    setConvos((cs) => cs.map((x) => (x.key === key ? { ...x, busy: false, result: r ?? x.result } : x)));
  };

  const lieOne = async (key: string) => {
    setConvos((cs) => cs.map((c) => (c.key === key ? { ...c, lieBusy: true } : c)));
    const c = convos.find((x) => x.key === key);
    let lie: Lie | null = null;
    if (c) {
      try {
        lie = (await lieCheck({ data: { conversation: c.lines.slice(-40) } })) as Lie;
      } catch {
        toast.error("تعذر كشف الكذب — جرب بعد شوي");
      }
    }
    setConvos((cs) => cs.map((x) => (x.key === key ? { ...x, lieBusy: false, lie: lie ?? x.lie } : x)));
  };

  const analyzeAll = async () => {
    setBusy(true);
    for (const c of convos.filter((x) => !x.result).slice(0, 10)) {
      const r = await analyze(c.lines);
      if (r) setConvos((cs) => cs.map((x) => (x.key === c.key ? { ...x, result: r } : x)));
    }
    setBusy(false);
    toast.success("خلص تحليل المحادثات ✅");
  };

  const analyzePasted = async () => {
    const lines = pasted.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const isAgent = /^(الموظفة|أنا|انا|البائعة|الرد)\s*[:：]/.test(l);
      return { who: (isAgent ? "a" : "c") as "c" | "a", t: l.replace(/^[^:：]+[:：]\s*/, "") };
    });
    if (lines.length < 2) { toast.error("الصق محادثة من سطرين على الأقل"); return; }
    setBusy(true);
    setPasteResult(await analyze(lines));
    try {
      setPasteLie((await lieCheck({ data: { conversation: lines } })) as Lie);
    } catch {
      setPasteLie(null);
    }
    setBusy(false);
  };

  const stats = useMemo(() => {
    const done = convos.filter((c) => c.result);
    const count = (v: Verdict) => done.filter((c) => c.result!.verdict === v).length;
    return { total: done.length, sold: count("sold"), hot: count("hot"), cold: count("cold"), lost: count("lost") };
  }, [convos]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-card p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display mb-1 text-lg text-primary">👁️ عين الصفقة</h2>
            <p className="text-sm text-muted-foreground">تحلل كل محادثة وتقولك: هل تم البيع؟ وش يعيق الزبون؟ وكيف تكسبه المرة الجاية.</p>
          </div>
          <Button onClick={analyzeAll} disabled={busy || convos.length === 0}>{busy ? "يحلل…" : "حلّل كل المحادثات"}</Button>
        </div>
        {stats.total > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm md:grid-cols-4">
            <div className="rounded-xl bg-green-50 p-3"><p className="text-2xl font-bold text-green-700">{stats.sold}</p><p>تم البيع</p></div>
            <div className="rounded-xl bg-orange-50 p-3"><p className="text-2xl font-bold text-orange-700">{stats.hot}</p><p>مهتم</p></div>
            <div className="rounded-xl bg-yellow-50 p-3"><p className="text-2xl font-bold text-yellow-700">{stats.cold}</p><p>متردد</p></div>
            <div className="rounded-xl bg-red-50 p-3"><p className="text-2xl font-bold text-red-700">{stats.lost}</p><p>رفض</p></div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-soft">
        <h3 className="font-display mb-3 text-primary">💬 محادثات زبائنك</h3>
        {loading ? <p className="text-sm text-muted-foreground">يجيب المحادثات…</p> : convos.length === 0 ? (
          <p className="text-sm text-muted-foreground">ما في محادثات محفوظة بعد — أول ما يراسلك زبون على واتساب تظهر هنا.</p>
        ) : (
          <div className="space-y-3">
            {convos.map((c) => (
              <div key={c.key} className="rounded-xl border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold" dir="ltr">{c.name}</p>
                  <div className="flex items-center gap-2">
                    {c.result && <span className={`rounded-full px-2 py-0.5 text-xs ${VERDICTS[c.result.verdict].cls}`}>{VERDICTS[c.result.verdict].label}</span>}
                    <Button size="sm" variant="outline" onClick={() => analyzeOne(c.key)} disabled={c.busy}>{c.busy ? "…" : c.result ? "أعد التحليل" : "حلّل"}</Button>
                    <Button size="sm" variant="outline" onClick={() => lieOne(c.key)} disabled={c.lieBusy}>{c.lieBusy ? "…" : "🔍 كشف الكذب"}</Button>
                  </div>
                </div>
                {c.lie && (
                  <div className="mt-2 space-y-1 rounded-lg border border-dashed p-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 ${LIES[c.lie.risk].cls}`}>{LIES[c.lie.risk].label}</span>
                    {c.lie.signals.length > 0 && (
                      <ul className="list-inside list-disc text-muted-foreground">
                        {c.lie.signals.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    )}
                    {c.lie.advice && <p className="font-semibold">💡 {c.lie.advice}</p>}
                  </div>
                )}
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{c.lines.map((l) => l.t).join(" — ").slice(0, 200)}</p>
                {c.result && (
                  <div className="mt-2 space-y-2 rounded-lg bg-secondary/50 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs">قوة الصفقة</span>
                      <Progress value={c.result.score} className="h-2 flex-1" />
                      <span className="text-xs font-bold">{c.result.score}%</span>
                    </div>
                    <p>{c.result.summary}</p>
                    {c.result.tips.length > 0 && (
                      <ul className="list-inside list-disc text-xs text-muted-foreground">
                        {c.result.tips.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-soft">
        <h3 className="font-display mb-1 text-primary">📋 حلّل محادثة يدوياً</h3>
        <p className="mb-3 text-xs text-muted-foreground">الصق أي محادثة (من أي منصة) — كل رسالة في سطر. ابدأ كلام الموظفة بـ "الموظفة:" عشان تفهم من يتكلم.</p>
        <Textarea rows={5} placeholder={"الزبون: السلام عليكم بكم العباية؟\nالموظفة: وعليكم السلام، العباية بـ 250 والتوصيل مجاني اليوم\nالزبون: غالية شوي…"} value={pasted} onChange={(e) => setPasted(e.target.value)} />
        <Button className="mt-2" onClick={analyzePasted} disabled={busy}>{busy ? "يحلل…" : "حلّل المحادثة"}</Button>
        {pasteResult && (
          <div className="mt-3 space-y-2 rounded-xl bg-secondary/50 p-3 text-sm">
            <span className={`rounded-full px-2 py-0.5 text-xs ${VERDICTS[pasteResult.verdict].cls}`}>{VERDICTS[pasteResult.verdict].label}</span>
            <div className="flex items-center gap-2"><Progress value={pasteResult.score} className="h-2 flex-1" /><span className="text-xs font-bold">{pasteResult.score}%</span></div>
            <p>{pasteResult.summary}</p>
            <ul className="list-inside list-disc text-xs text-muted-foreground">{pasteResult.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>
        )}
        {pasteLie && (
          <div className="mt-3 space-y-1 rounded-xl border border-dashed p-3 text-sm">
            <span className={`rounded-full px-2 py-0.5 text-xs ${LIES[pasteLie.risk].cls}`}>{LIES[pasteLie.risk].label}</span>
            {pasteLie.signals.length > 0 && (
              <ul className="list-inside list-disc text-xs text-muted-foreground">
                {pasteLie.signals.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            )}
            {pasteLie.advice && <p className="text-xs font-semibold">💡 {pasteLie.advice}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
