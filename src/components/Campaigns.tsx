import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { PinnedReplies } from "@/components/KingdomBrains";
import { fetchCustomers } from "@/lib/channels";
import { supabase } from "@/integrations/supabase/client";
import { campaignPolish, campaignSendOne, waContacts, waList } from "@/lib/studio.functions";

type Person = { key: string; name: string; phone: string; src: "زبون" | "واتساب" | "ملف" };
type LogRow = { phone: string; name: string; ok: boolean; err?: string; at: string };

/** Fix Saudi numbers: 05xxxxxxxx → 9665xxxxxxxx, strip symbols/00. Returns "" if invalid. */
export function cleanPhone(raw: string): string {
  let n = String(raw).replace(/[^\d+]/g, "").replace(/^\+/, "").replace(/^00/, "");
  if (/^05\d{8}$/.test(n)) n = "966" + n.slice(1);
  else if (/^5\d{8}$/.test(n)) n = "966" + n;
  return /^\d{8,15}$/.test(n) ? n : "";
}

const PHRASES: Record<string, string[]> = {
  "تحايا": ["يا هلا ومرحبا يا {الاسم} 🌹", "صباح الخير والسرور يا {الاسم} ☀️", "مساء الورد يا {الاسم} 🌙"],
  "عروض": ["جهزنا لك عرض خاص ما يتفوّت 🔥", "خصم لفترة محدودة — الحق قبل يخلص ⏳", "التوصيل مجاني لك اليوم 🚚"],
  "مناسبات": ["كل عام وأنت بخير وعيدك مبارك 🎉", "رمضان كريم وتقبّل الله صيامك 🌙", "جمعة مباركة يا {الاسم} 🤍"],
  "إغلاق": ["تواصل معنا الحين وخلنا نخدمك 💬", "ردّ علينا بكلمة (أبي) ونرتب لك كل شي ✅"],
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Campaigns({ storeId }: { storeId?: string | undefined }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [instances, setInstances] = useState<{ name: string; label: string; status: string }[]>([]);
  const [instance, setInstance] = useState("");
  const [polishing, setPolishing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<keyof typeof PHRASES>("تحايا");
  const [audios, setAudios] = useState<{ id: string; text: string; voice_name: string }[]>([]);
  const [audioId, setAudioId] = useState("");
  const [gap, setGap] = useState(4);
  const [when, setWhen] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; wait?: number } | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const stopRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const merge = (list: Person[]) => setPeople((prev) => {
    const m = new Map(prev.map((p) => [p.phone, p]));
    for (const p of list) {
      const old = m.get(p.phone);
      if (!old) m.set(p.phone, p);
      else if (!old.name && p.name) m.set(p.phone, { ...old, name: p.name });
    }
    return [...m.values()];
  });

  const loadStatus = () => waList().then((l) => {
    const open = l.filter((i) => i.status === "open");
    setInstances(open);
    setInstance((cur) => cur || open[0]?.name || "");
  }).catch(() => toast.error("تعذر جلب حالة الواتساب"));

  useEffect(() => {
    fetchCustomers(storeId).then((cs) => merge(cs.map((c) => ({ key: c.id, name: c.name || "", phone: cleanPhone(c.phone || ""), src: "زبون" as const })).filter((p) => p.phone)));
    loadStatus();
    supabase.from("studio_audio").select("id, text, voice_name").order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => setAudios((data ?? []) as any));
    if (storeId) supabase.from("stores").select("*").eq("id", storeId).maybeSingle()
      .then(({ data }) => { const b = (data as any)?.points ?? (data as any)?.balance; if (typeof b === "number") setBalance(b); });
    try { setLog(JSON.parse(localStorage.getItem("campaign_log") || "[]")); } catch { /* ignore */ }
  }, [storeId]);

  useEffect(() => { try { localStorage.setItem("campaign_log", JSON.stringify(log.slice(0, 300))); } catch { /* ignore */ } }, [log]);

  const shown = useMemo(() => {
    const s = q.trim();
    return s ? people.filter((p) => p.name.includes(s) || p.phone.includes(s.replace(/\D/g, "") || "~")) : people;
  }, [people, q]);
  const selected = people.filter((p) => picked.has(p.phone));
  const toggle = (k: string) => setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const allShown = shown.length > 0 && shown.every((p) => picked.has(p.phone));

  const sync = async () => {
    if (!instance) { toast.error("اربط رقم واتساب أولاً"); return; }
    setSyncing(true);
    try {
      const r = await waContacts({ data: { name: instance } });
      merge(r.contacts.map((c) => ({ key: c.phone, name: c.name, phone: c.phone, src: "واتساب" as const })));
      toast.success(`سحبت ${r.contacts.length} جهة اتصال من الواتساب ✅`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "تعذر السحب"); }
    setSyncing(false);
  };

  const onFile = async (f: File) => {
    const raw = await f.text();
    const rows = raw.split(/\r?\n/).map((l) => l.split(/[,;\t]/));
    const seen = new Set<string>(); let bad = 0; const list: Person[] = [];
    for (const cols of rows) {
      const phoneCol = cols.find((c) => cleanPhone(c));
      const phone = phoneCol ? cleanPhone(phoneCol) : "";
      if (!phone) { if (cols.join("").trim()) bad++; continue; }
      if (seen.has(phone)) continue;
      seen.add(phone);
      const name = cols.filter((c) => c !== phoneCol).map((c) => c.trim().replace(/^"|"$/g, "")).find((c) => c && !/^\d+$/.test(c)) || "";
      list.push({ key: phone, name, phone, src: "ملف" });
    }
    merge(list);
    toast.success(`أضفت ${list.length} رقم نظيف${bad ? ` — تجاهلت ${bad} سطر خاطئ` : ""}`);
  };

  const polish = async () => {
    if (!text.trim()) { toast.error("اكتب رسالتك أولاً"); return; }
    setPolishing(true);
    try { const r = await campaignPolish({ data: { text } }); setText(r.text); toast.success("حسّنت رسالتك ✨"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "تعذر التحسين"); }
    setPolishing(false);
  };

  const personal = (p: Person) => text.replace(/\{الاسم\}/g, p.name || "الغالي");

  const send = async () => {
    if (!instance) { toast.error("اربط رقم واتساب أولاً من استوديو الأصوات"); return; }
    if (!text.trim() && !audioId) { toast.error("اكتب رسالة الحملة أو اختر فويس"); return; }
    if (selected.length === 0) { toast.error("اختر شخص واحد على الأقل"); return; }
    const list = [...selected];
    stopRef.current = false;
    if (when) {
      const ms = new Date(when).getTime() - Date.now();
      if (ms > 0) {
        toast.message(`الحملة مجدولة — خل الصفحة مفتوحة وتنطلق ${new Date(when).toLocaleString("ar-SA")}`);
        setProgress({ done: 0, total: list.length, wait: Math.ceil(ms / 1000) });
        const until = Date.now() + ms;
        while (Date.now() < until) { if (stopRef.current) { setProgress(null); return; } setProgress({ done: 0, total: list.length, wait: Math.ceil((until - Date.now()) / 1000) }); await sleep(1000); }
      }
    }
    let ok = 0, fail = 0;
    for (let i = 0; i < list.length; i++) {
      if (stopRef.current) break;
      const p = list[i]!;
      setProgress({ done: i, total: list.length });
      try {
        await campaignSendOne({ data: { name: instance, number: p.phone, text: personal(p), ...(audioId ? { audioId } : {}) } });
        ok++; setBalance((b) => (b == null ? b : b - 1));
        setLog((l) => [{ phone: p.phone, name: p.name, ok: true, at: new Date().toISOString() }, ...l]);
      } catch (e) {
        fail++;
        const err = e instanceof Error ? e.message : "فشل";
        setLog((l) => [{ phone: p.phone, name: p.name, ok: false, err, at: new Date().toISOString() }, ...l]);
        if (err.includes("رصيدك")) { toast.error(err); break; }
      }
      if (i < list.length - 1) await sleep((gap + Math.random() * 2) * 1000);
    }
    setProgress(null);
    toast.success(`انتهت الحملة: وصلت ${ok} ✅${fail ? ` — فشلت ${fail}` : ""}`);
  };

  const sample = selected[0] ?? people[0];
  const audio = audios.find((a) => a.id === audioId);
  const busy = progress !== null;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[["👥 جهات الاتصال", people.length], ["✅ مختارين", selected.length], ["🚀 انرسل", progress ? progress.done : log.filter((l) => l.ok).length], ["💰 الرصيد", balance ?? "—"]].map(([k, v]) => (
          <div key={String(k)} className="rounded-2xl border bg-card p-3 text-center shadow-soft">
            <p className="text-xs text-muted-foreground">{k}</p><p className="font-display text-xl text-primary">{v}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border bg-card p-5 shadow-soft">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="font-display text-lg text-primary">📣 حملات المملكة</h2>
          <span className={`rounded-full px-2 py-0.5 text-xs ${instances.length ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground"}`}>
            {instances.length ? "🟢 الواتساب متصل" : "🔴 غير متصل"}
          </span>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">أرسل عرضك لكل زبائنك على واتساب — والذكاء يحسّن الصياغة. كل رسالة = نقطة واحدة. اكتب {"{الاسم}"} ويتبدل باسم كل شخص.</p>
        {instances.length === 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary p-3 text-sm">
            <span>⚠️ ما عندك رقم واتساب مربوط — روح 🎤 استوديو الأصوات واربط رقمك.</span>
            <Button size="sm" variant="outline" onClick={loadStatus}>🔄 إعادة المزامنة</Button>
          </div>
        ) : (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span>ترسل من رقم:</span>
            {instances.map((i) => (
              <button key={i.name} onClick={() => setInstance(i.name)}
                className={`rounded-full px-3 py-1 text-xs ${instance === i.name ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{i.label}</button>
            ))}
            <Button size="sm" variant="ghost" onClick={loadStatus}>🔄</Button>
          </div>
        )}

        <Textarea rows={4} placeholder="اكتب رسالة حملتك… مثال: يا هلا يا {الاسم}، جهزنا لك خصم 30%!" value={text} onChange={(e) => setText(e.target.value)} />

        {/* Quick phrases */}
        <div className="mt-2 flex flex-wrap gap-1">
          {(Object.keys(PHRASES) as (keyof typeof PHRASES)[]).map((k) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-full px-3 py-1 text-xs ${tab === k ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{k}</button>
          ))}
          <button onClick={() => setText((t) => t + "{الاسم}")} className="rounded-full bg-accent px-3 py-1 text-xs">+ {"{الاسم}"}</button>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {PHRASES[tab]!.map((p) => (
            <button key={p} onClick={() => setText((t) => (t ? t + "\n" : "") + p)} className="rounded-lg border px-2 py-1 text-xs hover:bg-secondary">{p}</button>
          ))}
        </div>
        <PinnedReplies use="campaign" onPick={setText} />

        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <label className="text-xs">🎙️ إرفاق فويس من مكتبة الأصوات
            <select className="mt-1 w-full rounded-lg border bg-background p-2 text-sm" value={audioId} onChange={(e) => setAudioId(e.target.value)}>
              <option value="">بدون فويس</option>
              {audios.map((a) => <option key={a.id} value={a.id}>{a.text.slice(0, 40)} — {a.voice_name}</option>)}
            </select>
          </label>
          <label className="text-xs">🛡️ فاصل الأمان بين الرسائل: {gap}–{gap + 2} ثانية
            <input type="range" min={2} max={15} value={gap} onChange={(e) => setGap(+e.target.value)} className="mt-2 w-full" />
          </label>
          <label className="text-xs">⏰ جدولة الإرسال (اختياري)
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="mt-1" />
          </label>
        </div>

        {/* Live WhatsApp preview */}
        {(text.trim() || audio) && (
          <div className="mt-3 rounded-2xl bg-secondary p-3">
            <p className="mb-2 text-xs text-muted-foreground">📱 معاينة عند {sample?.name || "المستلم"}</p>
            <div className="mr-auto max-w-[85%] space-y-1 rounded-2xl rounded-tl-sm bg-card p-3 text-sm shadow-soft">
              {text.trim() && <p className="whitespace-pre-wrap">{sample ? personal(sample) : text.replace(/\{الاسم\}/g, "الغالي")}</p>}
              {audio && <p className="rounded-xl bg-primary/10 px-2 py-1 text-xs">▶️ 🎙️ فويس: {audio.text.slice(0, 30)}</p>}
              <p className="text-left text-[10px] text-muted-foreground">{new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })} ✓✓</p>
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" onClick={polish} disabled={polishing}>{polishing ? "يحسّن…" : "✨ إعادة الصياغة بالذكاء"}</Button>
          {!busy ? (
            <Button onClick={send} disabled={instances.length === 0}>🚀 أرسل لـ {selected.length} شخص</Button>
          ) : (
            <Button variant="destructive" onClick={() => { stopRef.current = true; }}>⏹️ أوقف الحملة</Button>
          )}
        </div>
        {progress && (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
            <p className="mt-1 text-xs text-muted-foreground">{progress.wait ? `⏰ تنطلق بعد ${progress.wait} ثانية` : `يرسل ${progress.done}/${progress.total}… خل الصفحة مفتوحة`}</p>
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-soft">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-primary">👥 اختر الأشخاص ({selected.length}/{people.length})</h3>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={sync} disabled={syncing}>{syncing ? "يسحب…" : "🔄 سحب جهات الاتصال من الواتساب"}</Button>
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>📂 رفع ملف CSV</Button>
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
            <Button size="sm" variant="ghost" onClick={() => setPicked((p) => { const n = new Set(p); shown.forEach((s) => (allShown ? n.delete(s.phone) : n.add(s.phone))); return n; })}>
              {allShown ? "ألغِ الكل" : "اختر الكل"}
            </Button>
          </div>
        </div>
        <Input placeholder="🔍 ابحث بالاسم أو الرقم" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" />
        {people.length === 0 ? (
          <p className="text-sm text-muted-foreground">ما فيه أرقام بعد — اسحبها من الواتساب أو ارفع ملف، أو أضفهم من تبويب 👥 الزبائن.</p>
        ) : (
          <div className="grid max-h-[480px] gap-2 overflow-y-auto md:grid-cols-2">
            {shown.slice(0, 500).map((c) => (
              <label key={c.phone} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${picked.has(c.phone) ? "border-primary bg-secondary/60" : ""}`}>
                <input type="checkbox" checked={picked.has(c.phone)} onChange={() => toggle(c.phone)} />
                <div className="flex-1">
                  <p className="font-semibold">{c.name || "بدون اسم"}</p>
                  <p className="text-xs text-muted-foreground" dir="ltr">+{c.phone}</p>
                </div>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px]">{c.src}</span>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-soft">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-primary">📜 سجل الإرسال</h3>
          {log.length > 0 && <Button size="sm" variant="ghost" onClick={() => setLog([])}>مسح السجل</Button>}
        </div>
        {log.length === 0 ? <p className="text-sm text-muted-foreground">ما فيه إرسال بعد.</p> : (
          <div className="max-h-72 space-y-1 overflow-y-auto text-xs">
            {log.slice(0, 200).map((l, i) => (
              <div key={i} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                <span>{l.ok ? "✅" : "❌"} {l.name || "بدون اسم"} <span dir="ltr">+{l.phone}</span></span>
                <span className="text-muted-foreground">{l.ok ? "وصلت" : l.err?.slice(0, 40)} · {new Date(l.at).toLocaleTimeString("ar-SA")}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
