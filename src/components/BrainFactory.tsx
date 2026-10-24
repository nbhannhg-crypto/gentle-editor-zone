import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { brainChat, brainVoice } from "@/lib/brains.functions";
import { SPECIALISTS } from "@/lib/brains";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BrainUsageSummary } from "@/components/KingdomBrains";
import { BrainCard, type CardBrain } from "@/components/BrainCard";

type Msg = { role: "user" | "assistant"; content: string; image?: string; sp?: string; tab?: string; voice?: string; created?: string };

const QUICK = ["ابي عقل يبيع منتجاتي", "ابي اربط الواتس تبعي", "ابي عقل يشحن موقعي", "ابي اربط تيك توك وارد على التعليقات", "ابي ارسل مساء الخير صوت لزبوني", "ابي عقل يدير البث المباشر", "صمم لي بوستر عرض", "ابي عقل يتصل واتس لرقم"];

async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = url; });
  const s = Math.min(1, 1400 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = img.width * s; c.height = img.height * s;
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return c.toDataURL("image/jpeg", 0.85);
}

export function BrainFactory({ onTab }: { onTab: (t: string) => void }) {
  const chat = useServerFn(brainChat);
  const voice = useServerFn(brainVoice);
  const navigate = useNavigate();
  const [msgs, setMsgsRaw] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [img, setImg] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [brains, setBrains] = useState<CardBrain[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [activeId, setActiveId] = useState<string | undefined>();
  const [playing, setPlaying] = useState<number | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const KEY = (id?: string) => `bf_chat_${id ?? "main"}`;
  // Conversation survives tab switches / reloads (saved per brain, images dropped to save space)
  const setMsgs = (m: Msg[]) => { setMsgsRaw(m); try { localStorage.setItem(KEY(activeId), JSON.stringify(m.slice(-40).map(({ image: _i, ...r }) => r))); } catch { /* full */ } };
  useEffect(() => { try { setMsgsRaw(JSON.parse(localStorage.getItem(KEY(activeId)) || "[]")); } catch { setMsgsRaw([]); } }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadBrains = async () => {
    const { data } = await supabase.from("brains").select("id, name, emoji, specialty, source, instructions, uses, library_tag, scopes, store_id").order("created_at", { ascending: false });
    const list = (data ?? []) as CardBrain[];
    setBrains(list);
    const c: Record<string, number> = {};
    await Promise.all(list.map(async (b) => {
      const { count } = await supabase.from("reply_library").select("id", { count: "exact", head: true }).eq("store_id", b.store_id).eq("tag", b.library_tag || b.name.slice(0, 40));
      c[b.id] = count ?? 0;
    }));
    setCounts(c);
  };
  useEffect(() => { void loadBrains(); box.current?.focus(); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs, busy]);

  const send = async (t = text) => {
    const content = t.trim();
    if ((!content && !img) || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: content || "اقرأ المحادثة وكمّلها", ...(img ? { image: img } : {}) }];
    setMsgs(next); setText(""); const image = img; setImg(undefined); setBusy(true);
    try {
      const r = await chat({ data: { history: next.slice(-20).map((m) => ({ role: m.role, content: m.content })), ...(image ? { image } : {}), ...(activeId ? { brainId: activeId } : {}) } });
      setMsgs([...next, { role: "assistant", content: r.reply, sp: r.specialist, tab: r.tab, voice: r.voice_text, ...(r.created ? { created: `${r.created.name} ومعه ${r.created.replies} سالفة` } : {}) }]);
      if (r.created) { toast.success(`🧠 تم إنشاء ${r.created.name} + ${r.created.replies} سالفة`); void loadBrains(); }
      window.dispatchEvent(new Event("data-changed"));
    } catch (e) { toast.error((e as Error).message); setMsgs(next); }
    finally { setBusy(false); box.current?.focus(); }
  };

  const play = async (i: number, t: string) => {
    setPlaying(i);
    try { const { audio } = await voice({ data: { text: t } }); await new Audio(`data:audio/mpeg;base64,${audio}`).play(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setPlaying(null); }
  };

  const open = (t: string) => (t === "studio" ? navigate({ to: "/studio" }) : onTab(t));
  const del = async (id: string) => { if (!confirm("تحذف هذا العقل؟ (ردوده تبقى في المكتبة)")) return; await supabase.from("brains").delete().eq("id", id); if (activeId === id) setActiveId(undefined); void loadBrains(); };
  const cleanEmpty = async () => {
    const empty = brains.filter((b) => !counts[b.id]);
    if (!empty.length || !confirm(`تحذف ${empty.length} عقل فاضي (بدون أي رد)؟`)) return;
    await supabase.from("brains").delete().in("id", empty.map((b) => b.id));
    toast.success(`🧹 انحذف ${empty.length} عقل فاضي`); setActiveId(undefined); void loadBrains();
  };
  const active = brains.find((b) => b.id === activeId);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <BrainUsageSummary />
      <section className="flex min-h-[70vh] min-w-0 flex-col sm:min-h-[560px] rounded-2xl border bg-card shadow-soft">
        <div className="border-b p-4">
          <h2 className="font-display text-xl text-primary">🧠 مصنع العقول</h2>
          <p className="text-sm text-muted-foreground">{active ? `تكلم الحين ${active.emoji} ${active.name}` : "اكتب أي شي بكلامك — يطلع لك العقل المتخصص وينفذ. ارسل صورة محادثة ويكملها عنك."}</p>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {msgs.length === 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 [&_button]:min-w-0">
              {SPECIALISTS.map((s) => (
                <button key={s.id} onClick={() => send(`ابي ${s.name}`)} className="rounded-xl border bg-background p-2 text-center text-xs hover:border-primary">
                  <div className="text-2xl">{s.emoji}</div>{s.name.replace("عقل ", "")}
                </button>
              ))}
            </div>
          )}
          {msgs.map((m, i) => {
            const sp = SPECIALISTS.find((s) => s.id === m.sp);
            return m.role === "user" ? (
              <div key={i} className="mr-auto max-w-[85%] rounded-2xl bg-primary px-4 py-2 text-primary-foreground">
                {m.image && <img src={m.image} alt="محادثة مرفقة" className="mb-2 max-h-48 rounded-lg" />}
                {m.content}
              </div>
            ) : (
              <div key={i} className="max-w-[95%]">
                {sp && <p className="mb-1 text-xs font-semibold text-gold">{sp.emoji} {sp.name}</p>}
                <div className="prose prose-sm max-w-none text-foreground"><ReactMarkdown>{m.content}</ReactMarkdown></div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(m.content); toast.success("نسخ"); }}>📋 نسخ</Button>
                  {m.voice && <Button size="sm" variant="outline" disabled={playing === i} onClick={() => play(i, m.voice!)}>{playing === i ? "…" : "🔊 سمّعني الصوت"}</Button>}
                  {m.voice && <Button size="sm" variant="outline" onClick={() => open("studio")}>📤 أرسله واتس</Button>}
                  {m.tab && <Button size="sm" onClick={() => open(m.tab!)}>افتح الصفحة ←</Button>}
                  <Button size="sm" variant="ghost" onClick={() => send("عدّله وخلّه أقوى")}>✏️ عدّله</Button>
                </div>
                {m.created && <p className="mt-2 rounded-lg bg-secondary px-3 py-1 text-sm">✅ انضاف {m.created} لعقولك</p>}
              </div>
            );
          })}
          {busy && <p className="animate-pulse text-sm text-muted-foreground">🧠 العقل يفكر…</p>}
          <div ref={end} />
        </div>
        <div className="border-t p-3">
          <div className="mb-2 flex gap-2 overflow-x-auto">
            {QUICK.map((q) => <button key={q} onClick={() => send(q)} className="shrink-0 rounded-full border px-3 py-1 text-xs hover:border-primary">{q}</button>)}
          </div>
          {img && <div className="mb-2 flex items-center gap-2"><img src={img} alt="مرفق" className="h-14 rounded" /><button onClick={() => setImg(undefined)} className="text-xs text-destructive">إزالة</button></div>}
          <div className="flex items-end gap-2">
            <label className="cursor-pointer rounded-xl border px-3 py-2 text-lg" title="صورة محادثة">📷
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImg(await shrink(f)); e.target.value = ""; }} />
            </label>
            <Textarea ref={box} value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="مثال: ادخل واتس ورد على هذا الزبون واعطه السعر…"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} className="flex-1" />
            <Button onClick={() => send()} disabled={busy}>أرسل</Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">كل أمر = 2 نقطة • مع صورة = 3 • الصوت = 1</p>
        </div>
      </section>

      <aside className="space-y-3 rounded-2xl border bg-card p-4 shadow-soft">
        <h3 className="font-display text-primary">🧬 عقولي الخاصة</h3>
        <p className="text-xs text-muted-foreground">{brains.length} عقل • {Object.values(counts).reduce((a, c) => a + c, 0).toLocaleString()} رد • {brains.filter((b) => !counts[b.id]).length} فاضي</p>
        <button onClick={() => setActiveId(undefined)} className={`w-full rounded-xl border p-2 text-right text-sm ${!activeId ? "border-primary bg-secondary" : ""}`}>🧠 مصنع العقول (يختار تلقائي)</button>
        {brains.some((b) => !counts[b.id]) && <Button size="sm" variant="ghost" className="w-full text-destructive" onClick={cleanEmpty}>🧹 احذف العقول الفاضية</Button>}
        {brains.map((b) => (
          <BrainCard key={b.id} b={b} count={counts[b.id] ?? 0} active={activeId === b.id} onPick={() => setActiveId(b.id)} onDelete={() => del(b.id)} onChanged={loadBrains} />
        ))}
        {brains.length === 0 && <p className="text-xs text-muted-foreground">اكتب "ابي عقل يبيع عطوري" ويبنيه لك ويسألك الباقي.</p>}
        <Button variant="outline" className="w-full" onClick={() => { setActiveId(undefined); send("ابي انشئ عقل جديد خاص فيني"); }}>➕ أنشئ عقل جديد</Button>
      </aside>
    </div>
  );
}
