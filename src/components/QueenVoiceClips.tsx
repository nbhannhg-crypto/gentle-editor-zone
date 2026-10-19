import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { pullAllMerchants, publishKingdom } from "@/lib/voice-vault-cloud";
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
        {shown.map((c) => (
          <div key={`${c.store}_${c.id}`} className="rounded-xl bg-muted p-3 text-sm">
            <p><b>{c.title || c.text.slice(0, 40)}</b> · <span className="text-xs text-muted-foreground">{names[c.store] ?? c.store.slice(0, 8)}</span></p>
            {c.audio && <audio controls src={c.audio} className="mt-1 h-8 w-full" />}
            <div className="mt-1 flex gap-1">
              <Button size="sm" variant="secondary" onClick={() => copy(c)}>📥 انسخ لي</Button>
              <Button size="sm" variant="outline" onClick={async () => { try { await publishKingdom(c, true); toast.success("👑 انتشر للمملكة"); } catch (e) { toast.error((e as Error).message); } }}>👑 انشر للمملكة</Button>
            </div>
          </div>
        ))}
        {!shown.length && <p className="text-xs text-muted-foreground">ما فيه مقاطع محفوظة سحابياً من التجار بعد.</p>}
      </div>
    </section>
  );
}
