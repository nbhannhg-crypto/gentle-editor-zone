import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

/** هوية وسيرة موظفة المكالمة — تنحفظ بالسحابة (صف إعدادات) ونسخة بالجهاز. */
export type Identity = { name: string; age: string; status: string; city: string; family: string; work: string; free: string };
const EMPTY: Identity = { name: "", age: "", status: "", city: "", family: "", work: "", free: "" };
const FIELDS: [keyof Identity, string, string][] = [
  ["name", "الاسم", "مثلاً: ريم"],
  ["age", "العمر", "مثلاً: 24 سنة"],
  ["status", "الحالة الاجتماعية", "عزباء، مطلقة، مخطوبة…"],
  ["city", "وين ساكنة", "مثلاً: الرياض - حي النرجس"],
  ["family", "مين عندها / مع مين عايشة", "مثلاً: مع أمي وأختي الصغيرة"],
  ["work", "دراستها أو شغلها ويومها", "مثلاً: طالبة جامعة، تحب القهوة والمشي"],
];
const LS = "kingdom_call_identity";
const key = (store?: string) => `call_identity:${store ?? "local"}`;

/** نص الهوية اللي يوصل لعقل الموظفة. */
export function identityText(i: Identity): string {
  const lines = FIELDS.map(([k, l]) => (i[k].trim() ? `${l}: ${i[k].trim()}` : "")).filter(Boolean);
  if (i.free.trim()) lines.push(`تفاصيل عن حياتها: ${i.free.trim()}`);
  return lines.join("\n");
}

export function useIdentity(storeId?: string) {
  const [id, setId] = useState<Identity>(EMPTY);
  useEffect(() => {
    try { const s = localStorage.getItem(LS); if (s) setId({ ...EMPTY, ...JSON.parse(s) }); } catch { /* ignore */ }
    if (!storeId) return;
    void supabase.from("training_rules").select("response_text").eq("trigger_text", key(storeId)).limit(1).maybeSingle()
      .then(({ data }) => { if (data) try { const x = { ...EMPTY, ...JSON.parse(data.response_text) }; setId(x); localStorage.setItem(LS, JSON.stringify(x)); } catch { /* ignore */ } });
  }, [storeId]);
  const save = async (next: Identity) => {
    setId(next); localStorage.setItem(LS, JSON.stringify(next));
    if (!storeId) return;
    const body = JSON.stringify(next);
    const { data } = await supabase.from("training_rules").select("id").eq("trigger_text", key(storeId)).limit(1).maybeSingle();
    const { error } = data
      ? await supabase.from("training_rules").update({ response_text: body }).eq("id", data.id)
      : await supabase.from("training_rules").insert({ trigger_text: key(storeId), response_text: body, category: "settings", store_id: null });
    if (error) throw error;
  };
  return { id, save };
}

export function CallIdentity({ id, save }: { id: Identity; save: (i: Identity) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Identity>(id);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) setF(id); }, [id, open]);
  const filled = !!identityText(id);
  const go = async () => {
    setBusy(true);
    try { await save(f); toast.success("🪪 انحفظت هويتها — بتستخدمها بالمكالمة"); setOpen(false); }
    catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };
  return (
    <section className="mt-4 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-lg">🪪 هوية وسيرة الموظفة</h3>
          <p className="text-xs text-muted-foreground">{filled ? `${id.name || "بدون اسم"}${id.age ? ` • ${id.age}` : ""}${id.city ? ` • ${id.city}` : ""}` : "اكتب معلوماتها عشان ترد عن نفسها بدون تناقض"}</p>
        </div>
        <Button size="sm" variant={open ? "secondary" : "default"} onClick={() => setOpen(!open)}>{open ? "إغلاق" : filled ? "✏️ تعديل" : "➕ عبّي"}</Button>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          {FIELDS.map(([k, l, ph]) => (
            <label key={k} className="block text-sm">
              <span className="mb-1 block text-muted-foreground">{l}</span>
              <Input value={f[k]} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </label>
          ))}
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">كل شي ثاني يخصها وحياتها</span>
            <Textarea rows={4} value={f.free} placeholder="هواياتها، أكلها المفضل، طبعها، سوالفها، أي شي تحتاجه بالمكالمة…" onChange={(e) => setF({ ...f, free: e.target.value })} />
          </label>
          <Button className="w-full" disabled={busy} onClick={go}>{busy ? "يحفظ…" : "💾 حفظ الهوية"}</Button>
        </div>
      )}
    </section>
  );
}
