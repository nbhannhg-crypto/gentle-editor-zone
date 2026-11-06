import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fishSpeak } from "@/lib/ai.functions";
import { loadVoice } from "@/components/VoiceStudio";
import { getStudioVoice, getVoiceModel } from "@/lib/voice-model";
import { listClips, clipUrl, deleteClip, deleteAllClips, pinClip, replaceClip, vaultOn, setVaultOn, type CallClip } from "@/lib/call-vault";

const BUILTIN = "ca005277ffeb4282961e5253b18c6280";

/** 💾 لوحة خزينة صوت المكالمة: تشغيل، تعديل، إعادة توليد، تثبيت، حذف. */
export function CallVoiceVault({ playAudio }: { playAudio?: (src: string) => void }) {
  const fish = useServerFn(fishSpeak);
  const [on, setOn] = useState(true);
  const [list, setList] = useState<CallClip[]>([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"new" | "uses">("new");
  const [edit, setEdit] = useState<{ id: string; t: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const audio = useRef<HTMLAudioElement | null>(null);

  const load = async () => { setLoading(true); try { setList(await listClips()); } catch { /* ignore */ } setLoading(false); };
  useEffect(() => {
    setOn(vaultOn()); void load();
    let t: ReturnType<typeof setTimeout>;
    const h = () => { setOn(vaultOn()); clearTimeout(t); t = setTimeout(() => void load(), 600); };
    window.addEventListener("cv-change", h);
    return () => { window.removeEventListener("cv-change", h); clearTimeout(t); };
  }, []);

  const voice = () => {
    const v = loadVoice();
    const voiceId = getStudioVoice() || v.voiceId || BUILTIN;
    return { voiceId, model: getVoiceModel(), speed: v.speed, emotion: v.emotion || "", volume: v.volume, custom: voiceId !== BUILTIN };
  };
  const gen = async (text: string) => { const v = voice(); return (await fish({ data: { text, voiceId: v.voiceId, speed: v.speed, volume: v.volume, emotion: v.emotion, custom: v.custom, model: v.model as never } })).audio; };

  const play = async (c: CallClip) => {
    try {
      const url = await clipUrl(c);
      if (playAudio) { playAudio(url); return; }
      audio.current?.pause(); audio.current = new Audio(url); await audio.current.play();
    } catch (e) { toast.error((e as Error).message); }
  };
  const redo = async (c: CallClip, text: string) => {
    if (!text.trim()) return;
    setBusy(c.id);
    try { const url = await replaceClip(c, text, voice(), gen); setEdit(null); toast.success("✅ تم التحديث"); audio.current?.pause(); audio.current = new Audio(url); void audio.current.play(); }
    catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  };
  const del = async (c: CallClip) => { if (!confirm(`حذف «${c.text.slice(0, 40)}»؟`)) return; setBusy(c.id); try { await deleteClip(c); setList((l) => l.filter((x) => x.id !== c.id)); } catch (e) { toast.error((e as Error).message); } setBusy(null); };

  const shown = useMemo(() => {
    const s = q.trim();
    const f = s ? list.filter((c) => c.text.includes(s)) : list;
    return [...f].sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (sort === "uses" ? b.uses - a.uses : b.created_at.localeCompare(a.created_at)));
  }, [list, q, sort]);
  const saved = list.reduce((s, c) => s + Math.max(0, c.uses - 1), 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="font-bold">💾 خزينة صوت المكالمة</div>
          <div className="text-xs text-muted-foreground">أي جملة تتكرر بالحرف وبنفس الصوت تشتغل فوراً بدون توليد</div>
        </div>
        <button onClick={() => setVaultOn(!on)}
          className={`rounded-full px-3 py-1.5 text-xs font-bold border ${on ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border"}`}>
          {on ? "💾 الخزينة الذكية شغالة" : "⚡ توليد عادي كل مرة"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-muted p-2"><div className="text-lg font-bold">{list.length}</div><div className="text-[11px] text-muted-foreground">مقطع محفوظ</div></div>
        <div className="rounded-xl bg-muted p-2"><div className="text-lg font-bold">{saved}</div><div className="text-[11px] text-muted-foreground">مرة بدون توليد</div></div>
        <div className="rounded-xl bg-muted p-2"><div className="text-lg font-bold">{list.filter((c) => c.pinned).length}</div><div className="text-[11px] text-muted-foreground">مثبت</div></div>
      </div>

      <div className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 ابحث بالجملة…" />
        <select value={sort} onChange={(e) => setSort(e.target.value as "new" | "uses")} className="rounded-md border border-input bg-background px-2 text-sm">
          <option value="new">الأحدث</option><option value="uses">الأكثر استخدام</option>
        </select>
      </div>

      <div className="max-h-[420px] overflow-y-auto space-y-2 pe-1">
        {loading && !list.length && <div className="text-center text-sm text-muted-foreground py-4">جاري التحميل…</div>}
        {!loading && !shown.length && <div className="text-center text-sm text-muted-foreground py-4">الخزينة فاضية — أول ما تنطق الموظفة جملة تنحفظ هنا تلقائياً</div>}
        {shown.map((c) => (
          <div key={c.id} className="rounded-xl border border-border bg-background p-2 animate-in fade-in duration-200">
            {edit?.id === c.id ? (
              <div className="space-y-2">
                <Input value={edit.t} onChange={(e) => setEdit({ id: c.id, t: e.target.value })} autoFocus />
                <div className="flex gap-2">
                  <Button size="sm" disabled={busy === c.id} onClick={() => void redo(c, edit.t)}>{busy === c.id ? "…" : "💾 احفظ وولّد"}</Button>
                  <Button size="sm" variant="outline" onClick={() => setEdit(null)}>إلغاء</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="text-sm leading-relaxed">{c.pinned && "📌 "}{c.text}</div>
                <div className="mt-1 flex items-center gap-1 flex-wrap">
                  <span className="text-[11px] text-muted-foreground me-auto">🔁 {c.uses} · {c.model} · {Number(c.speed).toFixed(2)}x</span>
                  <Button size="sm" variant="secondary" className="h-7 px-2" onClick={() => void play(c)}>▶️</Button>
                  <Button size="sm" variant="outline" className="h-7 px-2" title="تعديل" onClick={() => setEdit({ id: c.id, t: c.text })}>✏️</Button>
                  <Button size="sm" variant="outline" className="h-7 px-2" title="إعادة توليد بالصوت الحالي" disabled={busy === c.id} onClick={() => void redo(c, c.text)}>{busy === c.id ? "…" : "🔄"}</Button>
                  <Button size="sm" variant="outline" className="h-7 px-2" title="تثبيت" onClick={() => void pinClip(c, !c.pinned)}>{c.pinned ? "📍" : "📌"}</Button>
                  <Button size="sm" variant="outline" className="h-7 px-2" title="حذف" disabled={busy === c.id} onClick={() => void del(c)}>🗑️</Button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {list.length > 0 && (
        <div className="flex justify-between gap-2">
          <Button size="sm" variant="outline" onClick={() => void load()}>🔃 تحديث</Button>
          <Button size="sm" variant="outline" onClick={async () => {
            const victims = list.filter((c) => !c.pinned);
            if (!victims.length || !confirm(`حذف ${victims.length} مقطع غير مثبت؟`)) return;
            await deleteAllClips(victims); void load();
          }}>🗑️ حذف غير المثبت</Button>
        </div>
      )}
    </div>
  );
}
