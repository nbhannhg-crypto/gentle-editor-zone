import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadCockpit, COCKPIT_KEY } from "@/components/LiveCockpit";
import { supabase } from "@/integrations/supabase/client";
import { isAdmin } from "@/lib/stores";

/** تعليمات الملكة العامة (تطبق على الجميع) — نسخة محلية تقرأها المكالمة */
export const GLOBAL_BOXES_LS = "call_boxes_global";
type Boxes = { persona: string[]; banned: string[] };
const EMPTY: Boxes = { persona: [], banned: [] };
const keyOf = (scope: string) => `call_boxes:${scope}`;

export function loadGlobalBoxes(): Boxes {
  try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(GLOBAL_BOXES_LS) ?? "{}") }; } catch { return EMPTY; }
}

async function readCloud(scope: string): Promise<Boxes | null> {
  const { data } = await supabase.from("training_rules").select("response_text").eq("trigger_text", keyOf(scope)).limit(1).maybeSingle();
  if (!data) return null;
  try { return { ...EMPTY, ...JSON.parse(data.response_text) }; } catch { return null; }
}
async function writeCloud(scope: string, b: Boxes) {
  const k = keyOf(scope); const body = JSON.stringify(b);
  const { data } = await supabase.from("training_rules").select("id").eq("trigger_text", k).limit(1).maybeSingle();
  const { error } = data
    ? await supabase.from("training_rules").update({ response_text: body }).eq("id", data.id)
    : await supabase.from("training_rules").insert({ trigger_text: k, response_text: body, category: "settings", store_id: null });
  if (error) toast.error("تعذر الحفظ بالسحابة");
}

/** مربع قائمة: إضافة / تعديل / حذف */
function ListBox({ title, hint, items, onSave, tone }: { title: string; hint: string; items: string[]; onSave: (v: string[]) => void; tone: string }) {
  const [draft, setDraft] = useState("");
  const [edit, setEdit] = useState<number | null>(null);
  const [val, setVal] = useState("");
  const add = () => { const t = draft.trim(); if (!t) return; onSave([...items, t]); setDraft(""); toast.success("✅ انضاف وانحفظ"); };
  return (
    <details className={`rounded-2xl border p-3 ${tone}`}>
      <summary className="cursor-pointer text-sm font-semibold">{title} ({items.length})</summary>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
      <div className="mt-2 flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="اكتب واضغط ➕" onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <Button type="button" onClick={add}>➕</Button>
      </div>
      <ul className="mt-2 space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2 rounded-xl bg-secondary px-2 py-1.5 text-sm">
            {edit === i ? (
              <>
                <Input value={val} onChange={(e) => setVal(e.target.value)} className="h-8" autoFocus />
                <Button size="sm" onClick={() => { const n = [...items]; if (val.trim()) n[i] = val.trim(); onSave(n); setEdit(null); toast.success("✏️ انعدل"); }}>💾</Button>
              </>
            ) : (
              <>
                <span className="flex-1 break-words">{it}</span>
                <button type="button" aria-label="تعديل" onClick={() => { setEdit(i); setVal(it); }}>✏️</button>
                <button type="button" aria-label="حذف" onClick={() => { onSave(items.filter((_, j) => j !== i)); toast.success("🗑️ انحذف"); }}>🗑️</button>
              </>
            )}
          </li>
        ))}
        {!items.length && <li className="text-xs text-muted-foreground">فاضي للحين.</li>}
      </ul>
    </details>
  );
}

export function CallBoxes({ storeId }: { storeId?: string | undefined }) {
  const [mine, setMine] = useState<Boxes>(EMPTY);
  const [glob, setGlob] = useState<Boxes>(EMPTY);
  const [admin, setAdmin] = useState(false);

  const toLocal = (b: Boxes) => {
    const c = { ...loadCockpit(), persona: b.persona.join("\n"), banned: b.banned };
    localStorage.setItem(COCKPIT_KEY, JSON.stringify(c));
  };

  useEffect(() => {
    const c = loadCockpit();
    setMine({ persona: c.persona.split("\n").map((s) => s.trim()).filter(Boolean), banned: c.banned });
    setGlob(loadGlobalBoxes());
    void isAdmin().then(setAdmin);
    void readCloud("global").then((g) => { const v = g ?? EMPTY; setGlob(v); localStorage.setItem(GLOBAL_BOXES_LS, JSON.stringify(v)); });
    if (storeId) void readCloud(storeId).then((m) => {
      // حساب كل متجر مستقل: السحابة هي المرجع حتى لو فاضية (ما ينقل كلام حساب ثاني من نفس الجوال)
      if (m) { setMine(m); toLocal(m); }
      else { const local = { persona: c.persona.split("\n").map((s) => s.trim()).filter(Boolean), banned: c.banned }; void writeCloud(storeId, local); }
    });
  }, [storeId]);

  const saveMine = (b: Boxes) => { setMine(b); toLocal(b); if (storeId) void writeCloud(storeId, b); };
  const saveGlob = (b: Boxes) => { setGlob(b); localStorage.setItem(GLOBAL_BOXES_LS, JSON.stringify(b)); void writeCloud("global", b); };

  return (
    <section className="mt-4 grid gap-3">
      <p className="text-xs text-muted-foreground">🔒 اللي تضيفه هنا خاص فيك وبمتجرك بس، ينحفظ بالسحابة ويطلع لك من أي جوال.</p>
      <ListBox title="💗 معلومات وقصة الموظفة (تنفذها حرفياً)" hint="كل سطر معلومة: اسمها، علاقتكم، طريقة دلعها… تلتزم فيها ولا تألف غيرها." tone="bg-card"
        items={mine.persona} onSave={(v) => saveMine({ ...mine, persona: v })} />
      <ListBox title="🚫 الكلام الممنوع" hint="أي كلمة أو عبارة هنا ما تقولها أبداً — ولو طلعت بالرد تنشال." tone="bg-card"
        items={mine.banned} onSave={(v) => saveMine({ ...mine, banned: v })} />
      {admin && (
        <>
          <p className="text-xs font-semibold">👑 تعليمات الملكة العامة — تطبق على كل المستخدمين</p>
          <ListBox title="👑 تعليمات عامة للجميع" hint="تنطبق على موظفات كل المتاجر." tone="bg-accent/30"
            items={glob.persona} onSave={(v) => saveGlob({ ...glob, persona: v })} />
          <ListBox title="👑 ممنوع عام للجميع" hint="كلمات ممنوعة على كل المتاجر." tone="bg-accent/30"
            items={glob.banned} onSave={(v) => saveGlob({ ...glob, banned: v })} />
        </>
      )}
    </section>
  );
}
