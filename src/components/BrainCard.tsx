import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { brainFill, brainTest, brainVoice } from "@/lib/brains.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type CardBrain = { id: string; name: string; emoji: string; specialty: string; source: string; instructions: string; uses: number; library_tag: string; scopes: string[]; store_id: string };
type Row = { id: string; trigger_text: string; reply_text: string };

export function BrainCard({ b, count, active, onPick, onDelete, onChanged }: { b: CardBrain; count: number; active: boolean; onPick: () => void; onDelete: () => void; onChanged: () => void }) {
  const fill = useServerFn(brainFill);
  const test = useServerFn(brainTest);
  const voice = useServerFn(brainVoice);
  const tag = b.library_tag || b.name.slice(0, 40);
  const paused = (b.scopes ?? []).includes("paused");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [nk, setNk] = useState(""); const [nr, setNr] = useState("");
  const [topic, setTopic] = useState(""); const [n, setN] = useState(25);
  const [tq, setTq] = useState(""); const [ans, setAns] = useState<{ reply: string; source: string } | null>(null);
  const [busy, setBusy] = useState("");

  const load = async () => {
    let qq = supabase.from("reply_library").select("id, trigger_text, reply_text").eq("store_id", b.store_id).eq("tag", tag).order("created_at", { ascending: false }).limit(100);
    const s = q.trim().replace(/[%_,()]/g, "");
    if (s) qq = qq.or(`trigger_text.ilike.%${s}%,reply_text.ilike.%${s}%`);
    setRows(((await qq).data ?? []) as Row[]);
  };
  useEffect(() => { if (open) void load(); }, [open, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async () => {
    const scopes = paused ? (b.scopes ?? []).filter((x) => x !== "paused") : [...(b.scopes ?? []), "paused"];
    const { error } = await supabase.from("brains").update({ scopes }).eq("id", b.id);
    if (error) toast.error(error.message); else { toast.success(paused ? "🟢 العقل اشتغل" : "⚪ العقل توقف"); onChanged(); }
  };
  const doFill = async () => {
    setBusy("fill");
    try { const r = await fill({ data: { brainId: b.id, topic, count: n } }); toast.success(`🪄 انضاف ${r.added} سالفة${r.skipped ? ` (تجاهلت ${r.skipped} مكرر)` : ""}`); window.dispatchEvent(new Event("data-changed")); await load(); onChanged(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(""); }
  };
  const add = async () => {
    if (!nk.trim() || !nr.trim()) { toast.error("اكتب السؤال والرد"); return; }
    if (!b.library_tag) await supabase.from("brains").update({ library_tag: tag }).eq("id", b.id);
    const { error } = await supabase.from("reply_library").insert({ store_id: b.store_id, tag, trigger_text: nk.trim().slice(0, 500), reply_text: nr.trim().slice(0, 2000) });
    if (error) { toast.error(error.message); return; }
    setNk(""); setNr(""); toast.success("✅ انحفظ"); await load(); onChanged();
  };
  const edit = async (r: Row) => {
    const t = prompt("كلام الزبون", r.trigger_text)?.trim(); if (!t) return;
    const a = prompt("الرد", r.reply_text)?.trim(); if (!a) return;
    const { error } = await supabase.from("reply_library").update({ trigger_text: t, reply_text: a }).eq("id", r.id);
    if (error) toast.error(error.message); else setRows((p) => p.map((x) => (x.id === r.id ? { ...x, trigger_text: t, reply_text: a } : x)));
  };
  const remove = async (id: string) => {
    if (!confirm("تحذف هذا الرد؟")) return;
    await supabase.from("reply_library").delete().eq("id", id); setRows((p) => p.filter((x) => x.id !== id)); onChanged();
  };
  const doTest = async () => {
    if (!tq.trim()) return; setBusy("test");
    try { setAns(await test({ data: { brainId: b.id, text: tq } })); onChanged(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(""); }
  };
  const speak = async (t: string) => {
    setBusy("voice");
    try { const { audio } = await voice({ data: { text: t.slice(0, 600) } }); await new Audio(`data:audio/mpeg;base64,${audio}`).play(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(""); }
  };

  return (
    <div className={`rounded-xl border p-2 text-sm ${active ? "border-primary bg-secondary" : ""} ${paused ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-2">
        <button className="min-w-0 flex-1 text-right" onClick={() => setOpen(!open)}>
          <span className="font-semibold">{b.emoji} {b.name}</span>
          <span className="block text-xs text-muted-foreground">📚 {count.toLocaleString()} رد • {b.uses} استخدام</span>
          <span className="mt-1 flex flex-wrap gap-1 text-[10px]">
            {paused ? <span className="rounded-full bg-muted px-2">⚪ متوقف</span> : <>
              <span className="rounded-full bg-primary/15 px-2">🧠 جاهز للاستدعاء</span>
              {count > 0 && <span className="rounded-full bg-primary/15 px-2">⚡ ردود تلقائية</span>}
            </>}
            {count === 0 && <span className="rounded-full bg-destructive/15 px-2">فاضي — عبّه</span>}
          </span>
        </button>
        <button onClick={toggle} className="text-lg" aria-label="تشغيل/إيقاف" title={paused ? "شغّل" : "أوقف"}>{paused ? "⚪" : "🟢"}</button>
        <button onClick={onDelete} className="text-xs text-destructive" aria-label="حذف">🗑️</button>
      </div>

      {open && (
        <div className="mt-2 space-y-3 border-t pt-2">
          <Button size="sm" variant={active ? "secondary" : "outline"} className="w-full" onClick={onPick}>{active ? "✅ تكلمه الحين في الصندوق" : "💬 كلمه في صندوق الأوامر"}</Button>

          <div className="space-y-1 rounded-lg bg-background p-2">
            <p className="text-xs font-semibold">🪄 عبّه سوالف بالذكاء (2 نقطة)</p>
            <Input className="h-8 text-xs" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="الموضوع (اختياري): دلع، أسعار، توصيل…" />
            <div className="flex gap-1">
              {[15, 25, 50].map((x) => <button key={x} onClick={() => setN(x)} className={`flex-1 rounded-full border px-2 py-0.5 text-xs ${n === x ? "border-primary bg-secondary" : ""}`}>{x}</button>)}
            </div>
            <Button size="sm" className="w-full" disabled={busy === "fill"} onClick={doFill}>{busy === "fill" ? "…يكتب السوالف" : `🪄 ولّد ${n} سالفة واحفظها`}</Button>
          </div>

          <div className="space-y-1 rounded-lg bg-background p-2">
            <p className="text-xs font-semibold">🧪 جرّب الرد الفوري</p>
            <div className="flex gap-1">
              <Input className="h-8 text-xs" value={tq} onChange={(e) => setTq(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doTest()} placeholder="اكتب كلام زبون…" />
              <Button size="sm" disabled={busy === "test"} onClick={doTest}>{busy === "test" ? "…" : "جرّب"}</Button>
            </div>
            {ans && <div className="rounded-lg bg-secondary p-2 text-xs">
              <p className="whitespace-pre-wrap">{ans.reply}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">{ans.source === "library" ? "📚 من مكتبته (مجاني)" : "🧠 ذكاء بشخصيته"}</p>
              <div className="mt-1 flex gap-1">
                <Button size="sm" variant="outline" disabled={busy === "voice"} onClick={() => speak(ans.reply)}>{busy === "voice" ? "…" : "🔊 سمّعني (1 نقطة)"}</Button>
                <Button size="sm" variant="ghost" onClick={() => { setNk(tq); setNr(ans.reply); }}>💾 احفظه كرد</Button>
              </div>
            </div>}
          </div>

          <div className="space-y-1 rounded-lg bg-background p-2">
            <p className="text-xs font-semibold">➕ أضف رد</p>
            <Input className="h-8 text-xs" value={nk} onChange={(e) => setNk(e.target.value)} placeholder="كلام الزبون" />
            <Input className="h-8 text-xs" value={nr} onChange={(e) => setNr(e.target.value)} placeholder="الرد" />
            <Button size="sm" className="w-full" onClick={add}>حفظ</Button>
          </div>

          <div className="space-y-1">
            <Input className="h-8 text-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`🔎 ابحث في ${count} رد`} />
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {rows.map((r) => (
                <div key={r.id} className="rounded-lg border p-1.5 text-xs">
                  <p className="font-semibold">👤 {r.trigger_text}</p>
                  <p className="text-muted-foreground">💬 {r.reply_text}</p>
                  <div className="mt-1 flex gap-2"><button onClick={() => edit(r)}>✏️</button><button onClick={() => speak(r.reply_text)}>🔊</button><button className="text-destructive" onClick={() => remove(r.id)}>🗑️</button></div>
                </div>
              ))}
              {!rows.length && <p className="text-xs text-muted-foreground">ما فيه ردود — اضغط «عبّه سوالف».</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
