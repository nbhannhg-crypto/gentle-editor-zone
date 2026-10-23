import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { waList, inboxChats, inboxMessages, inboxSend, inboxSuggest } from "@/lib/studio.functions";

type M = { msg_id: string; from_number: string; text: string; reply: string; status: string; created_at: string };
type Wa = { name: string; label: string; status: string; number: string };
type Chat = { jid: string; phone: string; name: string; pic: string; last: string; fromMe: boolean; at: number; unread: number };
type Msg = { id: string; me: boolean; text: string; at: number; read: boolean };

const time = (t: number) => {
  if (!t) return "";
  const d = new Date(t);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("ar-SA", { day: "numeric", month: "short" });
};

/** WhatsApp conversations inside the site: real chats from connected numbers + live send (text / voice). */
export function WaInbox({ storeId }: { storeId?: string | undefined }) {
  const listWa = useServerFn(waList);
  const getChats = useServerFn(inboxChats);
  const getMsgs = useServerFn(inboxMessages);
  const send = useServerFn(inboxSend);
  const suggest = useServerFn(inboxSuggest);

  const [was, setWas] = useState<Wa[]>([]);
  const [inst, setInst] = useState("");
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "new" | "today">("all");
  const [sel, setSel] = useState<Chat | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [newNum, setNewNum] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // Old local log (kept)
  const [rows, setRows] = useState<M[]>([]);
  useEffect(() => {
    if (!storeId) return;
    void supabase.from("wa_inbox").select("msg_id, from_number, text, reply, status, created_at").eq("store_id", storeId).order("created_at", { ascending: false }).limit(500)
      .then(({ data }) => setRows((data ?? []) as M[]));
  }, [storeId]);

  useEffect(() => {
    listWa().then((l) => {
      setWas(l);
      const first = l.find((w) => w.status === "open") ?? l[0];
      if (first) setInst((p) => p || first.name);
    }).catch((e) => toast.error((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadChats = async (silent = false) => {
    if (!inst) return;
    if (!silent) setLoading(true);
    try { setChats(await getChats({ data: { name: inst } })); } catch (e) { if (!silent) toast.error((e as Error).message); }
    setLoading(false);
  };
  useEffect(() => { setSel(null); setChats([]); void loadChats(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inst]);

  const loadMsgs = async (c: Chat) => {
    try { setMsgs(await getMsgs({ data: { name: inst, jid: c.jid } })); } catch (e) { toast.error((e as Error).message); }
  };
  useEffect(() => {
    if (!sel) return;
    void loadMsgs(sel);
    const t = setInterval(() => { void loadMsgs(sel); }, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.jid, inst]);
  useEffect(() => { const t = setInterval(() => { void loadChats(true); }, 20000); return () => clearInterval(t); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inst]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const today = new Date().toDateString();
    return chats.filter((c) => {
      if (filter === "new" && c.fromMe) return false;
      if (filter === "today" && new Date(c.at).toDateString() !== today) return false;
      return !s || c.name.toLowerCase().includes(s) || c.phone.includes(s.replace(/\D/g, "") || "§") || c.last.toLowerCase().includes(s);
    });
  }, [chats, q, filter]);

  const doSend = async (voice = false) => {
    const text = draft.trim();
    if (!sel || !text) return;
    setBusy(true);
    try {
      await send({ data: { name: inst, to: sel.phone || sel.jid, text, voice } });
      setMsgs((m) => [...m, { id: "local" + Date.now(), me: true, text: voice ? `🎙️ ${text}` : text, at: Date.now(), read: false }]);
      setDraft("");
      toast.success(voice ? "🎙️ انرسل فويس" : "✅ انرسل");
      setTimeout(() => { void loadMsgs(sel); }, 2500);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };

  const doSuggest = async () => {
    setBusy(true);
    try {
      const h = msgs.slice(-12).map((m) => `${m.me ? "أنا" : "العميل"}: ${m.text}`).join("\n");
      setDraft((await suggest({ data: { history: h } })).text);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };

  const startNew = () => {
    const n = newNum.replace(/\D/g, "");
    if (n.length < 8) { toast.error("اكتب الرقم كامل مع رمز الدولة"); return; }
    setSel({ jid: `${n}@s.whatsapp.net`, phone: n, name: "", pic: "", last: "", fromMe: true, at: Date.now(), unread: 0 });
    setNewNum("");
  };

  const cur = was.find((w) => w.name === inst);
  const pill = (on: boolean) => `shrink-0 rounded-full px-3 py-1 text-xs ${on ? "bg-primary text-primary-foreground" : "bg-secondary"}`;

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">💬 محادثات الواتساب</h2>
        <Button size="sm" variant="outline" onClick={() => loadChats()} disabled={loading}>{loading ? "⏳" : "🔄 تحديث"}</Button>
      </div>

      {/* Number picker */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {was.map((w) => (
          <button key={w.name} className={pill(inst === w.name)} onClick={() => setInst(w.name)}>
            {w.status === "open" ? "🟢" : "🔴"} {w.label} {w.number && <span dir="ltr">+{w.number}</span>}
          </button>
        ))}
        {!was.length && <p className="text-sm text-muted-foreground">ما فيه أرقام مربوطة. اربط رقمك من «القنوات».</p>}
      </div>
      {cur && cur.status !== "open" && <p className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">هذا الرقم غير متصل — امسح الكود من «القنوات».</p>}

      {!sel ? (
        <>
          <Input placeholder="🔍 ابحث بالاسم أو الرقم أو الكلام" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex gap-1.5">
            <button className={pill(filter === "all")} onClick={() => setFilter("all")}>الكل ({chats.length})</button>
            <button className={pill(filter === "new")} onClick={() => setFilter("new")}>📩 بانتظار رد</button>
            <button className={pill(filter === "today")} onClick={() => setFilter("today")}>📅 اليوم</button>
          </div>
          <div className="flex gap-2">
            <Input dir="ltr" placeholder="رقم جديد 9665…" value={newNum} onChange={(e) => setNewNum(e.target.value)} />
            <Button variant="outline" onClick={startNew}>➕ محادثة</Button>
          </div>
          <div className="max-h-[60vh] divide-y overflow-y-auto rounded-xl border">
            {loading && !chats.length && <p className="p-4 text-center text-sm text-muted-foreground">⏳ جاري جلب المحادثات…</p>}
            {!loading && !shown.length && <p className="p-4 text-center text-sm text-muted-foreground">ما فيه محادثات.</p>}
            {shown.map((c) => (
              <button key={c.jid} onClick={() => { setSel(c); setMsgs([]); setDraft(""); }} className="flex w-full items-center gap-2 p-2 text-right hover:bg-muted">
                {c.pic ? <img src={c.pic} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" /> : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary">👤</div>}
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{c.name || <span dir="ltr">+{c.phone || c.jid.split("@")[0]}</span>}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{time(c.at)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground">{c.fromMe ? "✓ " : ""}{c.last}</span>
                    {!c.fromMe && <span className="h-2 w-2 shrink-0 self-center rounded-full bg-primary" />}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-xl bg-primary p-2 text-primary-foreground">
            <button onClick={() => { setSel(null); void loadChats(true); }} className="px-2 text-lg">→</button>
            {sel.pic ? <img src={sel.pic} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span>👤</span>}
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{sel.name || "عميل"}</div>
              {sel.phone && <div dir="ltr" className="text-right text-[11px] opacity-80">+{sel.phone}</div>}
            </div>
          </div>
          <div className="h-[50vh] space-y-1.5 overflow-y-auto rounded-xl bg-muted p-2">
            {!msgs.length && <p className="p-4 text-center text-xs text-muted-foreground">⏳ جاري التحميل…</p>}
            {msgs.map((m) => (
              <div key={m.id} className={`flex ${m.me ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm ${m.me ? "bg-primary text-primary-foreground" : "bg-background"}`}>
                  {m.text || "…"}
                  <div className="mt-0.5 text-left text-[10px] opacity-70">{time(m.at)} {m.me && (m.read ? "✓✓" : "✓")}</div>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <Textarea rows={2} placeholder="اكتب رسالتك…" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="grid grid-cols-3 gap-1.5">
            <Button disabled={busy || !draft.trim()} onClick={() => doSend(false)}>🚀 إرسال</Button>
            <Button variant="outline" disabled={busy || !draft.trim()} onClick={() => doSend(true)}>🎙️ فويس</Button>
            <Button variant="outline" disabled={busy || !msgs.length} onClick={doSuggest}>✍️ اقترح رد</Button>
          </div>
          <Button size="sm" variant="ghost" className="w-full" onClick={() => window.open(`https://wa.me/${sel.phone}?text=${encodeURIComponent(draft)}`, "_blank")} disabled={!sel.phone}>↗️ افتح في تطبيق الواتساب</Button>
        </div>
      )}

      {rows.length > 0 && (
        <details className="rounded-xl border p-2 text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground">📜 سجل الرد الآلي ({rows.length})</summary>
          <div className="mt-2 max-h-60 space-y-1 overflow-y-auto">
            {rows.slice(0, 100).map((m) => <p key={m.msg_id} className="text-xs"><span dir="ltr">{m.from_number}</span>: {m.text} {m.reply && <span className="text-primary">← {m.reply}</span>}</p>)}
          </div>
        </details>
      )}
    </div>
  );
}
