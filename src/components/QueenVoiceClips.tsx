import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { pullAllMerchants, publishKingdom, queenUpdate } from "@/lib/voice-vault-cloud";
import type { VaultClip } from "@/components/VoiceSmartVault";

/** Queen only: browse every merchant's voice clips, copy to her own bank, or publish to the kingdom. */
export function QueenVoiceClips() {
  const [rows, setRows] = useState<(VaultClip & { store: string })[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const load = async () => {
    try {
      const r = await pullAllMerchants(); setRows(r);
      const { data } = await supabase.from("stores").select("id, name");
      setNames(Object.fromEntries((data ?? []).map((s) => [s.id, s.name])));
    } catch (e) { toast.error((e as Error).message); }
  };
  useEffect(() => { void load(); }, []);
  const copy = (c: VaultClip) => {
    try {
      const list = JSON.parse(localStorage.getItem("live_clips") ?? "[]") as VaultClip[];
      localStorage.setItem("live_clips", JSON.stringify([{ ...c, id: Math.random().toString(36).slice(2, 9), cat: "personal" }, ...list]));
      toast.success("📥 انسخ لمكتبتك الخاصة — يظهر في شاشة المكالمات");
    } catch { toast.error("المساحة ممتلئة"); }
  };
  /* 📂 سحب مجلد تاجر كامل لمكتبة الملكة كمجلد جديد */
  const pullFolder = (store: string, cat: string, items: VaultClip[]) => {
    try {
      const fid = `f_${Math.random().toString(36).slice(2, 9)}`;
      const name = `${names[store] ?? store.slice(0, 6)} — ${cat}`;
      const fl = JSON.parse(localStorage.getItem("live_vault_folders") ?? "[]") as [string, string][];
      localStorage.setItem("live_vault_folders", JSON.stringify([...fl, [fid, `📁 ${name}`]]));
      const list = JSON.parse(localStorage.getItem("live_clips") ?? "[]") as VaultClip[];
      localStorage.setItem("live_clips", JSON.stringify([...items.map((c) => ({ ...c, id: Math.random().toString(36).slice(2, 9), cat: fid })), ...list]));
      toast.success(`📥 انسحب المجلد (${items.length} مقطع) — افتحي بنك الأصوات`);
    } catch { toast.error("المساحة ممتلئة"); }
  };
  const publishFolder = async (store: string, cat: string, items: VaultClip[]) => {
    const fname = window.prompt("اسم المجلد الملكي؟", `${names[store] ?? ""} ${cat}`.trim())?.trim(); if (!fname) return;
    let ok = 0; for (const c of items) { try { await publishKingdom({ ...c, cat: `${store.slice(0, 6)}_${cat}`, fname }, true, true); ok++; } catch { /* يكمل */ } }
    toast.success(`👑 انتشر المجلد «${fname}» (${ok} مقطع)`);
  };
  const edit = async (c: VaultClip & { store: string }) => {
    const text = window.prompt("نص الرد", c.text); if (text === null) return;
    const triggers = window.prompt("عبارات الزبون (افصل بـ / أو |)", c.triggers ?? ""); if (triggers === null) return;
    const { store, ...clip } = c; const next = { ...clip, text: text.trim() || c.text, triggers: triggers.trim() };
    try { await queenUpdate(store, next); setRows((r) => r.map((x) => (x.store === store && x.id === c.id ? { ...next, store } : x))); toast.success("✏️ تعدّل عند التاجر"); } catch (e) { toast.error((e as Error).message); }
  };
  const f = q.trim();
  const shown = rows.filter((c) => !f || `${c.title ?? ""} ${c.text} ${names[c.store] ?? ""}`.includes(f));
  return (
    <section className="rounded-2xl border-2 border-gold bg-card p-4 shadow-soft">
      <h3 className="font-display text-lg text-primary">👸 أصوات ومقاطع التجار</h3>
      <p className="text-xs text-muted-foreground">{shown.length} مقطع من التجار — اسمعي، انسخي، أو انشري للمملكة.</p>
      <div className="mt-2 flex gap-2">
        <Input className="h-8 text-xs" placeholder="🔎 ابحثي بالاسم أو المتجر" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button size="sm" variant="outline" onClick={load}>تحديث</Button>
      </div>
      <div className="mt-2 max-h-[50vh] space-y-2 overflow-y-auto">
        {Object.entries(shown.reduce<Record<string, (VaultClip & { store: string })[]>>((m, c) => { (m[`${c.store}|${c.cat}`] ??= []).push(c); return m; }, {})).map(([k, items]) => {
          const [store, cat] = k.split("|") as [string, string];
          return (
            <div key={k} className="flex flex-wrap items-center gap-1 rounded-lg bg-secondary p-2 text-xs">
              <span className="flex-1">📂 {names[store] ?? store.slice(0, 8)} / {cat} · {items.length} مقطع</span>
              <Button size="sm" variant="secondary" onClick={() => pullFolder(store, cat, items)}>📥 اسحبي المجلد</Button>
              <Button size="sm" variant="outline" onClick={() => publishFolder(store, cat, items)}>👑 انشري المجلد</Button>
            </div>
          );
        })}
        {shown.map((c) => (
          <div key={`${c.store}_${c.id}`} className="rounded-xl bg-muted p-3 text-sm">
            <p><b>{c.title || c.text.slice(0, 40)}</b> · <span className="text-xs text-muted-foreground">{names[c.store] ?? c.store.slice(0, 8)}</span></p>
            {c.audio && <audio controls src={c.audio} className="mt-1 h-8 w-full" />}
            <div className="mt-1 flex gap-1">
              <Button size="sm" variant="secondary" onClick={() => copy(c)}>📥 انسخ لي</Button>
              <Button size="sm" variant="outline" onClick={() => edit(c)}>✏️ عدّلي</Button>
              <Button size="sm" variant="outline" onClick={async () => { try { await publishKingdom(c, true); toast.success("👑 انتشر للمملكة"); } catch (e) { toast.error((e as Error).message); } }}>👑 انشر للمملكة</Button>
            </div>
          </div>
        ))}
        {!shown.length && <p className="text-xs text-muted-foreground">ما فيه مقاطع محفوظة سحابياً من التجار بعد.</p>}
      </div>
    </section>
  );
}
