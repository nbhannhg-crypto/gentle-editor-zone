import { Component, Suspense, useState, type ReactNode } from "react";
import { Link, useRouteContext } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardPaste, ContactRound, Save, Send, RefreshCw, Maximize2, Copy, Plus, MessageSquare } from "lucide-react";
import { smsSaveDraft, smsSaveContact, smsSendDraft, smsRefreshStatus } from "@/lib/sms.functions";
import { smsQueryOptions } from "@/lib/sms-query";
import { estimateSmsCost, normalizeSmsNumber, smsMetrics, smsRouteProblem, smsStatusLabel } from "@/lib/sms";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type Message = Database["public"]["Tables"]["sms_messages"]["Row"];
type ContactPicker = { select: (props: string[], options: { multiple: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]> };

class SmsBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() {
    if (this.state.error) return <div className="space-y-2 border-b py-3"><p role="alert" className="text-sm text-destructive">{this.state.error}</p><Button asChild variant="outline" size="sm"><Link to="/sms">فتح الرسائل</Link></Button></div>;
    return this.props.children;
  }
}

export function SmsSender({ expanded = false }: { expanded?: boolean }) {
  return <SmsBoundary><Suspense fallback={<p className="py-4 text-sm text-muted-foreground">جارٍ تحميل الرسائل…</p>}><SmsWorkspace expanded={expanded} /></Suspense></SmsBoundary>;
}

function SmsWorkspace({ expanded }: { expanded: boolean }) {
  const { user } = useRouteContext({ from: "/_authenticated" });
  const options = smsQueryOptions(user.id);
  const { data, isFetching } = useSuspenseQuery(options);
  const queryClient = useQueryClient();
  const [to, setTo] = useState("+966");
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [text, setText] = useState("");
  const [draftId, setDraftId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<Message | null>(null);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [filter, setFilter] = useState("all");
  const selectedFrom = from || data.senders.find((s) => s.profile && (s.domestic || s.international))?.number || "";
  const sender = data.senders.find((s) => s.number === selectedFrom);
  const problem = smsRouteProblem(sender, to);
  const metrics = smsMetrics(text);
  let normalizedTo = "";
  try { normalizedTo = normalizeSmsNumber(to); } catch { /* Editable incomplete numbers are expected. */ }
  const previous = data.history.find((m) => m.from_number === selectedFrom && m.to_number === normalizedTo && m.status === "delivered" && m.cost_amount !== null);
  const estimate = estimateSmsCost(metrics.parts, previous);
  const confirmationEstimate = confirm ? estimateSmsCost(confirm.parts, data.history.find((m) => m.from_number === confirm.from_number && m.to_number === confirm.to_number && m.status === "delivered" && m.cost_amount !== null)) : null;
  const canSave = Boolean(text.trim() && normalizedTo && text.length <= 670);
  const refresh = () => queryClient.invalidateQueries({ queryKey: options.queryKey });
  function report(e: unknown) { const message = e instanceof Error ? e.message : "تعذر إكمال الطلب"; setError(message); toast.error(message); }

  async function saveDraft(forSend = false) {
    setBusy(true); setError("");
    try {
      const row = await smsSaveDraft({ data: { ...(draftId ? { id: draftId } : {}), from: selectedFrom, to, text } });
      setDraftId(row.id);
      await refresh();
      if (forSend) setConfirm(row); else toast.success("انحفظت المسودة ورقم المستلم");
    } catch (e) { report(e); } finally { setBusy(false); }
  }

  async function sendConfirmed() {
    if (!confirm || busy) return;
    setBusy(true); setError("");
    try {
      const row = await smsSendDraft({ data: { id: confirm.id } });
      toast.success(smsStatusLabel(row.status));
      setText(""); setDraftId(undefined);
    } catch (e) { report(e); } finally { setConfirm(null); await refresh(); setBusy(false); }
  }

  async function saveContact() {
    setBusy(true); setError("");
    try { await smsSaveContact({ data: { phone: to, name } }); await refresh(); toast.success("انحفظت جهة الاتصال"); }
    catch (e) { report(e); } finally { setBusy(false); }
  }

  async function pickDeviceContact() {
    const picker = (navigator as Navigator & { contacts?: ContactPicker }).contacts;
    if (!picker) { setContactsOpen(true); return; }
    try {
      const chosen = (await picker.select(["name", "tel"], { multiple: false }))[0];
      if (chosen?.tel?.[0]) { setTo(chosen.tel[0]); setName(chosen.name?.[0] ?? ""); }
    } catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) report(e); }
  }

  async function pasteNumber() {
    try { setTo(await navigator.clipboard.readText()); } catch { setError("تعذر الوصول للحافظة؛ الصق الرقم في خانة المستلم"); }
  }

  function openMessage(row: Message) {
    setTo(row.to_number); setFrom(row.from_number); setText(row.text); setDraftId(row.status === "draft" ? row.id : undefined); setError("");
  }

  const shown = data.history.filter((m) => (filter === "all" || (filter === "draft" ? m.status === "draft" : filter === "delivered" ? m.status === "delivered" : m.status !== "draft")) && `${m.to_number} ${m.from_number} ${m.text}`.toLowerCase().includes(historySearch.toLowerCase()));

  return <section dir="rtl" aria-label="الرسائل النصية" className="min-w-0 space-y-4 border-b pb-4">
    <div className="flex items-center justify-between gap-2">
      <h2 className="font-display flex items-center gap-2 text-xl"><MessageSquare className="size-5 text-primary" /> الرسائل النصية</h2>
      <div className="flex shrink-0 gap-1">
        <Button variant="ghost" size="icon" title="تحديث السجل والخط" aria-label="تحديث السجل والخط" disabled={busy || isFetching} onClick={() => void refresh()}><RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /></Button>
        {!expanded && <Button asChild variant="ghost" size="icon" title="فتح صفحة الرسائل"><Link to="/sms" aria-label="فتح صفحة الرسائل"><Maximize2 className="size-4" /></Link></Button>}
      </div>
    </div>
    {data.carrierError && <p role="alert" className="text-sm text-destructive">{data.carrierError}</p>}
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      <div className="min-w-0 space-y-2">
        <label htmlFor="sms-from" className="text-sm font-medium">من أي رقم؟</label>
        <select id="sms-from" aria-label="الرقم المرسل منه" value={selectedFrom} onChange={(e) => setFrom(e.target.value)} disabled={busy} className="h-10 w-full min-w-0 rounded-md border bg-background px-2 text-sm" dir="ltr">
          <option value="">اختر رقم الإرسال</option>
          {data.senders.map((s) => <option key={s.number} value={s.number}>{s.number} — {s.profile ? s.international ? "دولي" : "محلي فقط" : "غير مهيّأ"}</option>)}
        </select>
      </div>
      <div className="min-w-0 space-y-2">
        <label htmlFor="sms-to" className="text-sm font-medium">رقم المستلم</label>
        <div className="flex min-w-0 gap-1">
          <Input id="sms-to" dir="ltr" inputMode="tel" value={to} onChange={(e) => setTo(e.target.value)} disabled={busy} aria-label="رقم مستلم الرسالة" className="min-w-0 flex-1" />
          <Button variant="outline" size="icon" title="لصق رقم المستلم" aria-label="لصق رقم المستلم" disabled={busy} onClick={() => void pasteNumber()}><ClipboardPaste className="size-4" /></Button>
          <Button variant="outline" size="icon" title="جهات الاتصال المحفوظة" aria-label="جهات الاتصال المحفوظة" disabled={busy} onClick={() => setContactsOpen(true)}><ContactRound className="size-4" /></Button>
        </div>
      </div>
    </div>
    {problem && <p className="text-sm text-destructive" role="status">{problem}</p>}
    <div className="flex min-w-0 gap-2">
      <Input aria-label="اسم جهة الاتصال" placeholder="اسم جهة الاتصال (اختياري)" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} className="min-w-0 flex-1" />
      <Button variant="outline" size="sm" disabled={busy || !normalizedTo} onClick={() => void saveContact()}><Save className="size-4" /> حفظ الرقم</Button>
    </div>
    <label htmlFor="sms-text" className="block text-sm font-medium">نص الرسالة</label>
    <Textarea id="sms-text" value={text} onChange={(e) => setText(e.target.value)} disabled={busy} rows={expanded ? 6 : 3} aria-label="نص الرسالة" />
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-live="polite">
      <span>{metrics.characters} حرف</span><span>{metrics.parts} مقطع</span><span dir="ltr">{metrics.encoding}</span>
      <span>{metrics.parts > 1 ? metrics.multipartLimit : metrics.singleLimit} وحدة لكل مقطع{metrics.units !== metrics.characters ? ` — ${metrics.units} وحدة مستخدمة` : ""}</span>
    </div>
    {text.length > 670 && <p role="alert" className="text-sm text-destructive">الرسالة أطول من الحد المسموح؛ اختصرها قبل الحفظ أو الإرسال.</p>}
    <p className="text-sm text-muted-foreground">{estimate ? `تكلفة تقديرية: ${estimate.amount} ${estimate.currency} — حسب آخر رسالة مسلّمة لنفس الرقم، وقد تتغير الرسوم.` : "التكلفة المسبقة غير متاحة من المزود؛ تظهر التكلفة الفعلية بعد الإرسال إذا أعادها المزود. كل مقطع يُحاسب منفصلاً."}</p>
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy || !canSave || Boolean(problem)} onClick={() => void saveDraft(true)}><Send className="size-4" /> مراجعة الإرسال</Button>
      <Button variant="outline" disabled={busy || !canSave} onClick={() => void saveDraft()}><Save className="size-4" /> حفظ مسودة</Button>
      <Button variant="ghost" size="icon" title="رسالة جديدة" aria-label="رسالة جديدة" disabled={busy} onClick={() => { setDraftId(undefined); setText(""); setError(""); }}><Plus className="size-4" /></Button>
    </div>
    {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
    <div className="space-y-3 border-t pt-4">
      <h3 className="font-display text-lg">سجل الرسائل</h3>
      <div className="flex min-w-0 gap-2">
        <Input aria-label="البحث في الرسائل" placeholder="بحث بالرقم أو النص" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} className="min-w-0 flex-1" />
        <select aria-label="تصفية الرسائل" value={filter} onChange={(e) => setFilter(e.target.value)} className="min-w-0 rounded-md border bg-background px-2 text-sm"><option value="all">الكل</option><option value="draft">المسودات</option><option value="submitted">المقدّمة للمزود</option><option value="delivered">المسلّمة</option></select>
      </div>
      {!shown.length && <p className="text-sm text-muted-foreground">ما فيه رسائل {data.history.length ? "تطابق البحث" : "محفوظة بعد"}.</p>}
      <div className={expanded ? "space-y-3" : "max-h-72 space-y-3 overflow-y-auto"}>
        {shown.map((row) => <article key={row.id} className="min-w-0 space-y-2 rounded-lg border bg-card p-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 text-xs"><p>إلى <bdi>{row.to_number}</bdi></p><p className="text-muted-foreground">من <bdi>{row.from_number || "غير محدد"}</bdi></p></div><span className={row.status === "delivered" ? "text-xs text-primary" : "text-xs text-muted-foreground"}>{smsStatusLabel(row.status)}</span></div>
          <p className="whitespace-pre-wrap break-words text-sm">{row.text}</p>
          <p className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString("ar-SA")} — {row.parts} مقطع — {row.cost_amount !== null ? `${row.cost_amount} ${row.cost_currency ?? ""}` : row.status === "draft" ? "لم تُرسل" : "التكلفة لم تتوفر بعد"}</p>
          {row.error && <p className="break-words text-xs text-destructive">{row.error}</p>}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => openMessage(row)}>{row.status === "draft" ? "فتح المسودة" : "استخدام النص والرقم"}</Button>
            <Button size="icon" variant="ghost" title="نسخ رقم المستلم" aria-label="نسخ رقم المستلم" onClick={() => void navigator.clipboard.writeText(row.to_number).catch(report)}><Copy className="size-4" /></Button>
            {row.provider_id && <Button size="icon" variant="ghost" title="تحديث حالة التسليم والتكلفة" aria-label="تحديث حالة التسليم والتكلفة" disabled={busy} onClick={async () => { setBusy(true); try { await smsRefreshStatus({ data: { id: row.id } }); await refresh(); } catch (e) { report(e); } finally { setBusy(false); } }}><RefreshCw className="size-4" /></Button>}
          </div>
        </article>)}
      </div>
    </div>
    <Dialog open={contactsOpen} onOpenChange={setContactsOpen}><DialogContent dir="rtl" className="max-w-md"><DialogHeader><DialogTitle>جهات الاتصال</DialogTitle><DialogDescription>الأرقام المحفوظة وزبائن متجرك</DialogDescription></DialogHeader>
      <Input aria-label="البحث في جهات الاتصال" placeholder="بحث بالاسم أو الرقم" value={search} onChange={(e) => setSearch(e.target.value)} />
      <Button variant="outline" onClick={() => void pickDeviceContact()}><ContactRound className="size-4" /> جهات جوالي (إذا يدعمها المتصفح)</Button>
      <div className="max-h-80 space-y-1 overflow-y-auto">{data.contacts.filter((c) => `${c.name} ${c.phone}`.toLowerCase().includes(search.toLowerCase())).map((c) => <Button key={c.phone} variant="ghost" className="h-auto w-full justify-between gap-2 py-3" onClick={() => { setTo(c.phone); setName(c.name); setContactsOpen(false); }}><span className="min-w-0 truncate">{c.name || "بدون اسم"}</span><bdi className="shrink-0 text-xs">{c.phone}</bdi></Button>)}{!data.contacts.length && <p className="py-3 text-sm text-muted-foreground">ما فيه جهات اتصال محفوظة بعد.</p>}</div>
    </DialogContent></Dialog>
    <Dialog open={Boolean(confirm)} onOpenChange={(open) => { if (!open && !busy) setConfirm(null); }}><DialogContent dir="rtl" className="max-w-md"><DialogHeader><DialogTitle>تأكيد إرسال رسالة مدفوعة</DialogTitle><DialogDescription>قبول المزود للرسالة لا يعني وصولها؛ تظهر حالة التسليم في السجل.</DialogDescription></DialogHeader>
      {confirm && <div className="space-y-3 text-sm"><p>من: <bdi>{confirm.from_number}</bdi></p><p>إلى: <bdi>{confirm.to_number}</bdi></p><p className="whitespace-pre-wrap break-words">{confirm.text}</p><p>{confirm.parts} مقطع</p><p>{confirmationEstimate ? `تقدير سابق: ${confirmationEstimate.amount} ${confirmationEstimate.currency}؛ قد تتغير الرسوم.` : "التكلفة غير معروفة مسبقاً؛ بالإرسال توافق على رسوم المزود لكل المقاطع."}</p><div className="flex gap-2"><Button disabled={busy} onClick={() => void sendConfirmed()}><Send className="size-4" />{busy ? "جارٍ الإرسال…" : "إرسال برسوم المزود"}</Button><Button disabled={busy} variant="outline" onClick={() => setConfirm(null)}>إلغاء</Button></div></div>}
    </DialogContent></Dialog>
  </section>;
}
