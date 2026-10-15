import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { queenListBrains, queenUpdateBrain, queenDeleteBrain, queenReplies, queenSaveReply, queenCopySection } from "@/lib/queen-control.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Brain = { id: string; name: string; emoji: string; instructions: string; library_tag: string; store_id: string; store_name: string; replies: number; is_kingdom: boolean };
type Sec = { store_id: string; tag: string; store_name: string; count: number };
type Rep = { id: string; trigger_text: string; reply_text: string };

/** Queen only: see, edit, rename, export and delete every merchant's brains and library sections. */
export function QueenMerchantBrains({ storeId }: { storeId?: string | undefined }) {
  const list = useServerFn(queenListBrains);
  const upd = useServerFn(queenUpdateBrain);
  const del = useServerFn(queenDeleteBrain);
  const [brains, setBrains] = useState<Brain[]>([]);
  const [secs, setSecs] = useState<Sec[]>([]);
  const [q, setQ] = useState("");
  const [openSec, setOpenSec] = useState<{ store_id: string; tag: string; store_name: string } | null>(null);
  const [err, setErr] = useState("");
  const load = async () => {
    try { const r = await list(); setBrains(r.brains as Brain[]); setSecs(r.sections); setErr(""); }
    catch (e) { setErr(e instanceof Error ? e.message : "تعذر التحميل"); }
  };
  useEffect(() => { load(); }, []);

  const f = q.trim();
  const shownB = brains.filter((b) => b.store_id !== storeId && (!f || `${b.name} ${b.store_name} ${b.library_tag}`.includes(f)));
  const shownS = secs.filter((s) => s.store_id !== storeId && (!f || `${s.tag} ${s.store_name}`.includes(f)));

  return (
    <section className="rounded-2xl border-2 border-gold bg-card p-4 shadow-soft">
      <h3 className="font-display text-lg text-primary">👸 عقول ومكتبات التجار (تحكم الملكة)</h3>
      <p className="text-xs text-muted-foreground">{shownB.length} عقل · {shownS.length} قسم مكتبة من التجار — تقدري تفتحي وتعدلي وتغيري الاسم وتنزلي الردود.</p>
      {err && <p className="mt-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">{err} <button className="underline" onClick={load}>إعادة المحاولة</button></p>}
      <div className="mt-2 flex gap-2">
        <Input className="h-8 text-xs" placeholder="🔎 ابحثي باسم العقل أو المتجر" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button size="sm" variant="outline" onClick={load}>تحديث</Button>
      </div>

      <p className="mt-3 text-sm font-semibold">🧠 العقول</p>
      <div className="mt-1 max-h-[50vh] space-y-2 overflow-y-auto">
        {shownB.map((b) => <BrainRow key={b.id} b={b} onOpen={() => setOpenSec({ store_id: b.store_id, tag: b.library_tag || b.name, store_name: b.store_name })}
          onSave={async (p) => { try { await upd({ data: { id: b.id, ...p } }); toast.success("انحفظ ✅"); load(); } catch (e) { toast.error(e instanceof Error ? e.message : "خطأ"); } }}
          onDelete={async () => { if (!confirm(`حذف عقل «${b.name}» من متجر ${b.store_name}؟ (الردود تبقى)`)) return; await del({ data: { id: b.id } }); toast.success("انحذف"); load(); }} />)}
        {!shownB.length && <p className="text-xs text-muted-foreground">ما فيه عقول من التجار.</p>}
      </div>

      <p className="mt-3 text-sm font-semibold">📚 أقسام المكتبة</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {shownS.map((s) => (
          <button key={`${s.store_id}|${s.tag}`} onClick={() => setOpenSec(s)} className="rounded-full bg-secondary px-3 py-1 text-xs">{s.tag} · {s.store_name} ({s.count})</button>
        ))}
      </div>

      {openSec && <SectionEditor sec={openSec} myStore={storeId} onClose={() => { setOpenSec(null); load(); }} />}
    </section>
  );
}

function BrainRow({ b, onOpen, onSave, onDelete }: { b: Brain; onOpen: () => void; onSave: (p: { name: string; instructions: string; library_tag: string; renameSection: boolean }) => void; onDelete: () => void }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(b.name); const [ins, setIns] = useState(b.instructions); const [tag, setTag] = useState(b.library_tag || b.name);
  const [ren, setRen] = useState(true);
  return (
    <div className="rounded-xl bg-muted p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{b.emoji} <b>{b.name}</b> · <span className="text-xs text-muted-foreground">{b.store_name}</span> · 📚 {b.replies} رد</span>
        <div className="flex gap-1">
          <Button size="sm" variant="secondary" onClick={onOpen}>📂 الردود</Button>
          <Button size="sm" variant="outline" onClick={() => setEdit(!edit)}>✏️ تعديل</Button>
          <Button size="sm" variant="destructive" onClick={onDelete}>🗑️</Button>
        </div>
      </div>
      {edit && (
        <div className="mt-2 space-y-2">
          <Input className="h-8 text-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم العقل" />
          <Input className="h-8 text-xs" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="اسم قسم المكتبة" />
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={ren} onChange={(e) => setRen(e.target.checked)} /> انقلي الردود لاسم القسم الجديد</label>
          <Textarea className="text-xs" rows={3} value={ins} onChange={(e) => setIns(e.target.value)} placeholder="تعليمات العقل" />
          <div className="flex gap-1">
            <Button size="sm" onClick={() => { onSave({ name, instructions: ins, library_tag: tag, renameSection: ren }); setEdit(false); }}>حفظ</Button>
            <Button size="sm" variant="outline" onClick={() => setTag(name.slice(0, 40))}>اجعلي القسم = اسم العقل</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionEditor({ sec, myStore, onClose }: { sec: { store_id: string; tag: string; store_name: string }; myStore?: string | undefined; onClose: () => void }) {
  const get = useServerFn(queenReplies);
  const save = useServerFn(queenSaveReply);
  const copy = useServerFn(queenCopySection);
  const [rows, setRows] = useState<Rep[]>([]);
  const [t, setT] = useState(""); const [r, setR] = useState("");
  const load = async () => setRows(await get({ data: { storeId: sec.store_id, tag: sec.tag } }));
  useEffect(() => { load(); }, [sec.store_id, sec.tag]);
  const act = async (p: { id?: string; trigger_text: string; reply_text: string; remove?: boolean }) => {
    try { await save({ data: { storeId: sec.store_id, tag: sec.tag, ...p } }); load(); } catch (e) { toast.error(e instanceof Error ? e.message : "خطأ"); }
  };
  const exportX = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([["كلام الزبون", "الرد"], ...rows.map((x) => [x.trigger_text, x.reply_text])]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "ردود");
    XLSX.writeFile(wb, `${sec.store_name}-${sec.tag}-${rows.length}.xlsx`);
  };
  return (
    <div className="mt-4 rounded-xl border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">📂 {sec.tag} · {sec.store_name} ({rows.length})</p>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" onClick={exportX}>⬇️ تنزيل Excel</Button>
          {myStore && <Button size="sm" variant="secondary" onClick={async () => { const c = await copy({ data: { fromStore: sec.store_id, tag: sec.tag, toStore: myStore } }); toast.success(`👑 انسخ ${c.copied} رد لمكتبتك`); }}>👑 انسخيه لمكتبتي</Button>}
          <Button size="sm" variant="ghost" onClick={onClose}>إغلاق</Button>
        </div>
      </div>
      <div className="mt-2 flex flex-col gap-1 sm:flex-row">
        <Input className="h-8 text-xs" placeholder="كلام الزبون" value={t} onChange={(e) => setT(e.target.value)} />
        <Input className="h-8 text-xs" placeholder="الرد" value={r} onChange={(e) => setR(e.target.value)} />
        <Button size="sm" onClick={() => { if (t.trim() && r.trim()) { act({ trigger_text: t, reply_text: r }); setT(""); setR(""); } }}>➕ أضيفي</Button>
      </div>
      <div className="mt-2 max-h-[50vh] space-y-1 overflow-y-auto">
        {rows.map((x) => <RepRow key={x.id} x={x} onSave={(a, b) => act({ id: x.id, trigger_text: a, reply_text: b })} onDel={() => act({ id: x.id, trigger_text: x.trigger_text, reply_text: x.reply_text, remove: true })} />)}
      </div>
    </div>
  );
}

function RepRow({ x, onSave, onDel }: { x: Rep; onSave: (t: string, r: string) => void; onDel: () => void }) {
  const [t, setT] = useState(x.trigger_text); const [r, setR] = useState(x.reply_text);
  const dirty = t !== x.trigger_text || r !== x.reply_text;
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-muted p-2 sm:flex-row">
      <Input className="h-8 text-xs" value={t} onChange={(e) => setT(e.target.value)} />
      <Input className="h-8 text-xs" value={r} onChange={(e) => setR(e.target.value)} />
      <div className="flex gap-1">
        {dirty && <Button size="sm" onClick={() => onSave(t, r)}>حفظ</Button>}
        <Button size="sm" variant="destructive" onClick={onDel}>🗑️</Button>
      </div>
    </div>
  );
}
