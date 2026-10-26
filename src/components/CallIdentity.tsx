import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { staffKey, identityText, pickActive, type Identity, type Staff, type StaffRoster } from "@/lib/staff";

/** 👯 طاقم الموظفات — كل موظفة بهويتها، وزر يختار المناوبة اللي ترد بالمكالمات والواتساب. */
export type { Identity, Staff };
export { identityText };

const EMPTY: Identity = { name: "", age: "", status: "", city: "", family: "", work: "", free: "" };
const FIELDS: [keyof Identity, string, string][] = [
  ["name", "الاسم", "مثلاً: ريم"],
  ["age", "العمر", "مثلاً: 24 سنة"],
  ["status", "الحالة الاجتماعية", "عزباء، مطلقة، مخطوبة…"],
  ["city", "وين ساكنة", "مثلاً: الرياض - حي النرجس"],
  ["family", "مين عندها / مع مين عايشة", "مثلاً: مع أمي وأختي الصغيرة"],
  ["work", "دراستها أو شغلها ويومها", "مثلاً: طالبة جامعة، تحب القهوة والمشي"],
];
const TONES = ["💕 رومانسية", "🙈 خجولة", "😄 مرحة", "👑 ثقيلة ودلوعة", "🤍 هادية وحنونة"];
const AVATARS = ["🌸", "🌙", "💎", "🦋", "🌹", "✨", "🍯", "🕊️"];
const LS = "kingdom_call_staff";
const OLD_LS = "kingdom_call_identity";
const EVT = "kingdom-staff-changed";
const uid = () => Math.random().toString(36).slice(2, 9);

// ✨ مولّد شخصيات سعودية جاهزة (مجاني بدون ذكاء) — تعدلها بعدين بكلمة
const NAMES = ["ريم", "نوف", "سارة", "لمى", "جود", "غلا", "شهد", "رهف", "دانة", "وعد", "لين", "ريماس"];
const CITIES = ["الرياض - حي الملقا", "جدة - حي الشاطئ", "الدمام - حي الفيصلية", "الخبر", "مكة - العزيزية", "المدينة", "أبها", "الطائف", "القصيم - بريدة", "حائل"];
const STATUS = ["عزباء", "مطلقة بدون عيال", "مخطوبة بس الخطبة متعثرة", "عزباء وتدور نصيبها"];
const FAMILY = ["مع أمي وأختي الصغيرة", "مع أهلي وأخواني", "لحالي في شقة قريبة من شغلي", "مع خالتي بعد ما انتقلت للدراسة"];
const WORK = ["طالبة جامعة تخصص تصميم، تحب القهوة المختصة", "موظفة استقبال في مستشفى، دوامها مسائي", "معلمة رياض أطفال وتحب الطبخ", "تشتغل من البيت بالتسويق الإلكتروني", "خريجة وتدور وظيفة، تحب المشي والمسلسلات"];
const FREE = [
  "تحب الشتاء والمطر، وأكلتها المفضلة الكبسة والحلا البارد. طبعها خجولة أول بس إذا ارتاحت تصير دلوعة. تكره الكذب وتحب اللي يهتم فيها.",
  "تعشق البحر والسهر على القهوة، تسمع عبادي ورابح صقر. ضحكتها حلوة وتحب المزح الخفيف. تزعل بسرعة وترضى بكلمة حلوة.",
  "تحب الورد الجوري والعطور، عندها قطة اسمها لولو. رومانسية وتحب الكلام الحلو، وتسأل كثير عن يوم اللي تكلمه.",
  "رياضية تحب المشي في الممشى المسائي، تحب الشوكولاتة. واثقة من نفسها وثقيلة شوي بس قلبها طيب.",
];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]!;
export function generateStaff(): Staff {
  return {
    id: uid(), avatar: pick(AVATARS), tone: pick(TONES),
    name: pick(NAMES), age: `${20 + Math.floor(Math.random() * 9)} سنة`, status: pick(STATUS),
    city: pick(CITIES), family: pick(FAMILY), work: pick(WORK), free: pick(FREE),
  };
}

let cache: StaffRoster | null = null;
const emit = (r: StaffRoster) => { cache = r; try { localStorage.setItem(LS, JSON.stringify(r)); } catch { /* ignore */ } window.dispatchEvent(new CustomEvent(EVT, { detail: r })); };

/** طاقم الموظفات مع حفظ سحابي ومزامنة بين كل الشاشات. */
export function useStaff(storeId?: string) {
  const [roster, setRoster] = useState<StaffRoster>(cache ?? { active: "", list: [] });
  useEffect(() => {
    const on = (e: Event) => setRoster((e as CustomEvent<StaffRoster>).detail);
    window.addEventListener(EVT, on);
    try {
      const s = localStorage.getItem(LS);
      if (s) setRoster((cache = JSON.parse(s)));
      else {
        const old = localStorage.getItem(OLD_LS);
        if (old) { const o = { ...EMPTY, ...JSON.parse(old) }; if (identityText(o)) setRoster((cache = { active: "a", list: [{ ...o, id: "a", avatar: "🌸", tone: TONES[0]! }] })); }
      }
    } catch { /* ignore */ }
    if (storeId) {
      void supabase.from("training_rules").select("response_text").eq("trigger_text", staffKey(storeId)).limit(1).maybeSingle().then(async ({ data }) => {
        if (data) { try { const r = JSON.parse(data.response_text) as StaffRoster; if (Array.isArray(r.list)) emit(r); } catch { /* ignore */ } return; }
        // ترحيل الهوية القديمة (موظفة واحدة) للطاقم
        const { data: old } = await supabase.from("training_rules").select("response_text").eq("trigger_text", `call_identity:${storeId}`).limit(1).maybeSingle();
        if (old) try { const o = { ...EMPTY, ...JSON.parse(old.response_text) }; if (identityText(o)) emit({ active: "a", list: [{ ...o, id: "a", avatar: "🌸", tone: TONES[0]! }] }); } catch { /* ignore */ }
      });
    }
    return () => window.removeEventListener(EVT, on);
  }, [storeId]);

  const save = async (next: StaffRoster) => {
    emit(next); setRoster(next);
    if (!storeId) return;
    const body = JSON.stringify(next);
    const k = staffKey(storeId);
    const { data } = await supabase.from("training_rules").select("id").eq("trigger_text", k).limit(1).maybeSingle();
    const { error } = data
      ? await supabase.from("training_rules").update({ response_text: body }).eq("id", data.id)
      : await supabase.from("training_rules").insert({ trigger_text: k, response_text: body, category: "settings", store_id: null });
    if (error) throw error;
  };
  const active = pickActive(roster);
  return { roster, active, save, activeText: active ? identityText(active) : "" };
}

/** للتوافق مع الشاشات القديمة: هوية المناوبة الحالية. */
export function useIdentity(storeId?: string) {
  const s = useStaff(storeId);
  return { id: (s.active ?? EMPTY) as Identity, save: async () => {} };
}

/** شريط أزرار سريع لاختيار الموظفة المناوبة (يُستخدم بالمكالمة المباشرة وغيرها). */
export function StaffSwitcher({ storeId, compact }: { storeId?: string | undefined; compact?: boolean }) {
  const { roster, active, save } = useStaff(storeId);
  if (!roster.list.length) return compact ? null : <p className="text-xs text-muted-foreground">ما فيه موظفات — أضفهن من «مكالمة المملكة» ← طاقم الموظفات.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">👯 المناوبة:</span>
      {roster.list.map((s) => (
        <Button key={s.id} size="sm" variant={active?.id === s.id ? "default" : "outline"} className="rounded-full"
          onClick={() => save({ ...roster, active: s.id }).then(() => toast.success(`${s.avatar} ${s.name || "الموظفة"} على الخط`), (e) => toast.error((e as Error).message))}>
          {active?.id === s.id && "🟢 "}{s.avatar} {s.name || "بدون اسم"}
        </Button>
      ))}
    </div>
  );
}

/** لوحة طاقم الموظفات الكاملة: إضافة/توليد/تعديل/نسخ/حذف/تفعيل. */
export function CallIdentity({ storeId }: { storeId?: string | undefined; id?: Identity; save?: unknown }) {
  const { roster, active, save } = useStaff(storeId);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [busy, setBusy] = useState(false);

  const persist = async (next: StaffRoster, msg: string) => {
    setBusy(true);
    try { await save(next); toast.success(msg); } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };
  const add = (s: Staff) => setEditing(s);
  const commit = async () => {
    if (!editing) return;
    const exists = roster.list.some((x) => x.id === editing.id);
    const list = exists ? roster.list.map((x) => (x.id === editing.id ? editing : x)) : [...roster.list, editing];
    await persist({ active: roster.active || editing.id, list }, `💾 انحفظت ${editing.name || "الموظفة"}`);
    setEditing(null);
  };
  const remove = (s: Staff) => {
    if (!confirm(`متأكد تحذف ${s.name || "هذي الموظفة"}؟`)) return;
    const list = roster.list.filter((x) => x.id !== s.id);
    void persist({ active: roster.active === s.id ? (list[0]?.id ?? "") : roster.active, list }, "🗑️ انحذفت");
  };

  return (
    <section className="mt-4 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-lg">👯 طاقم الموظفات</h3>
          <p className="text-xs text-muted-foreground">
            {active ? `🟢 على الخط: ${active.avatar} ${active.name || "بدون اسم"} — ترد بالمكالمات والواتساب بهويتها` : "أضف موظفة واختر المناوبة"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => add(generateStaff())}>✨ ولّد موظفة</Button>
          <Button size="sm" onClick={() => add({ ...EMPTY, id: uid(), avatar: pick(AVATARS), tone: TONES[0]! })}>➕ جديدة فاضية</Button>
        </div>
      </div>

      {roster.list.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {roster.list.map((s) => {
            const on = active?.id === s.id;
            return (
              <div key={s.id} className={`rounded-xl border p-3 transition ${on ? "border-primary bg-primary/10 shadow-soft" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted text-2xl">{s.avatar}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{s.name || "بدون اسم"} {on && <span className="text-xs text-primary">• المناوبة</span>}</p>
                    <p className="truncate text-xs text-muted-foreground">{[s.age, s.city, s.tone].filter(Boolean).join(" • ")}</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Button size="sm" variant={on ? "default" : "outline"} disabled={busy || on} onClick={() => persist({ ...roster, active: s.id }, `${s.avatar} ${s.name || "الموظفة"} على الخط`)}>{on ? "🟢 على الخط" : "📞 شغّلها"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>✏️ تعديل</Button>
                  <Button size="sm" variant="ghost" onClick={() => add({ ...s, id: uid(), name: `${s.name} (نسخة)` })}>📄 نسخ</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(s)}>🗑️</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="mt-3 space-y-2 rounded-xl border bg-muted/30 p-3">
          <div className="flex flex-wrap gap-1">
            {AVATARS.map((a) => (
              <button key={a} type="button" onClick={() => setEditing({ ...editing, avatar: a })}
                className={`h-9 w-9 rounded-full text-xl ${editing.avatar === a ? "bg-primary/20 ring-2 ring-primary" : "bg-card"}`}>{a}</button>
            ))}
          </div>
          {FIELDS.map(([k, l, ph]) => (
            <label key={k} className="block text-sm">
              <span className="mb-1 block text-muted-foreground">{l}</span>
              <Input value={editing[k]} placeholder={ph} onChange={(e) => setEditing({ ...editing, [k]: e.target.value })} />
            </label>
          ))}
          <div>
            <span className="mb-1 block text-sm text-muted-foreground">طبعها وأسلوبها</span>
            <div className="flex flex-wrap gap-1">
              {TONES.map((t) => (
                <Button key={t} size="sm" type="button" variant={editing.tone === t ? "default" : "outline"} className="rounded-full" onClick={() => setEditing({ ...editing, tone: t })}>{t}</Button>
              ))}
            </div>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">كل شي ثاني يخصها وحياتها</span>
            <Textarea rows={4} value={editing.free} placeholder="هواياتها، أكلها المفضل، طبعها، سوالفها…" onChange={(e) => setEditing({ ...editing, free: e.target.value })} />
          </label>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={busy} onClick={commit}>{busy ? "يحفظ…" : "💾 حفظ"}</Button>
            <Button variant="outline" onClick={() => setEditing(null)}>إلغاء</Button>
          </div>
        </div>
      )}
    </section>
  );
}
