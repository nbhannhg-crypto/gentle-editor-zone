import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { waList } from "@/lib/studio.functions";
import { simulateMarriageWa, marriageWaSteps, startMarriageWaManual } from "@/lib/marriage.functions";

type Step = { k: string; q: string; opts: string[] };
type Learned = { q: string; a: string };
type Cfg = { enabled: boolean; instance: string; smart: boolean; welcome: string; questions: Record<string, string>; learned: Learned[] };
type Sess = { id: string; phone: string; step: number; done: boolean; paused?: boolean; gender: string; updated_at: string; data: Record<string, string> };
const EMPTY: Cfg = { enabled: true, instance: "", smart: true, welcome: "", questions: {}, learned: [] };

/** 🎛️ لوحة ضبط تسجيل الخطابة بالواتساب: تشغيل، رقم مخصص، ذكاء، تعديل الأسئلة، تعليم، جلسات، ومحاكي. */
export function MarriageWaPanel({ storeId, copy }: { storeId?: string | undefined; copy: (t: string) => void }) {
  const [cfg, setCfg] = useState<Cfg>(EMPTY);
  const [steps, setSteps] = useState<Step[]>([]);
  const [nums, setNums] = useState<{ name: string; label: string; status: string }[]>([]);
  const [sess, setSess] = useState<Sess[]>([]);
  const [view, setView] = useState<"main" | "q" | "learn" | "sess" | "sim" | "trash">("main");
  const [lq, setLq] = useState({ q: "", a: "" });
  const [chat, setChat] = useState<{ me: boolean; t: string }[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const listWa = useServerFn(waList);
  const sim = useServerFn(simulateMarriageWa);
  const getSteps = useServerFn(marriageWaSteps);
  const startManual = useServerFn(startMarriageWaManual);
  const [mPhone, setMPhone] = useState("");
  const [mBusy, setMBusy] = useState(false);
  const [pPhone, setPPhone] = useState("");
  const [trash, setTrash] = useState<{ id: string; kind: string; label: string; deleted_at: string }[]>([]);
  const loadTrash = async () => {
    let q = supabase.from("marriage_trash").select("id, kind, label, deleted_at").order("deleted_at", { ascending: false }).limit(300);
    if (storeId) q = q.eq("store_id", storeId);
    const { data } = await q; setTrash(data ?? []);
  };
  const setPaused = async (phone: string, paused: boolean) => {
    if (!storeId) return;
    const { error } = await supabase.rpc("set_marriage_wa_paused", { _store: storeId, _phone: phone, _paused: paused });
    if (error) { toast.error("تعذر التغيير، تأكد من الرقم"); return; }
    toast.success(paused ? "⏸️ انطفت الأسئلة على هذا الرقم" : "▶️ اشتغلت الأسئلة على هذا الرقم"); void loadSess();
  };
  const restore = async (id: string) => {
    const { error } = await supabase.rpc("restore_marriage_trash", { _id: id });
    if (error) { toast.error("تعذر الاسترجاع"); return; }
    toast.success("🔄 رجع مكانه"); void loadTrash(); void loadSess();
  };
  const [mNote, setMNote] = useState("");
  const end = useRef<HTMLDivElement>(null);

  const loadSess = async () => {
    if (!storeId) return;
    const { data } = await supabase.from("marriage_wa_sessions").select("id,phone,step,done,gender,updated_at,data").eq("store_id", storeId).neq("instance", "__sim__").order("updated_at", { ascending: false }).limit(50);
    setSess((data as unknown as Sess[]) ?? []);
  };
  useEffect(() => {
    if (!storeId) return;
    void supabase.from("marriage_wa_settings").select("*").eq("store_id", storeId).maybeSingle().then(({ data }) => { if (data) setCfg({ ...EMPTY, ...(data as unknown as Cfg) }); });
    void getSteps().then(setSteps).catch(() => {});
    void listWa().then((w) => setNums(w as { name: string; label: string; status: string }[])).catch(() => {});
    void loadSess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [chat]);

  const save = async (next: Cfg, note = "انحفظ ✅") => {
    setCfg(next);
    if (!storeId) return;
    const { error } = await supabase.from("marriage_wa_settings").upsert({ store_id: storeId, ...next, questions: next.questions as never, learned: next.learned as never, updated_at: new Date().toISOString() });
    if (error) toast.error("تعذر الحفظ"); else toast.success(note);
  };

  const send = async (text: string, reset = false) => {
    if (!storeId || !text.trim()) return;
    setBusy(true); setChat((c) => [...c, { me: true, t: text }]); setMsg("");
    try { const r = await sim({ data: { storeId, text, reset } }); setChat((c) => [...c, { me: false, t: r.reply }]); }
    catch (e) { setChat((c) => [...c, { me: false, t: "⚠️ " + (e as Error).message }]); }
    setBusy(false);
  };
  const lastOpts = (() => { const last = [...chat].reverse().find((m) => !m.me)?.t ?? ""; return [...last.matchAll(/(\d)️⃣ (.+)/g)].map((m) => m[2]!); })();

  const tabs: [typeof view, string][] = [["main", "🎛️ الضبط"], ["q", "📝 الأسئلة"], ["learn", "🧠 تعليم"], ["sess", `👥 الجلسات (${sess.filter((s) => !s.done).length})`], ["sim", "🧪 جرّب"]];
  const total = steps.length || 17;

  return (
    <div className="rounded-2xl border bg-card p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <b>💬 تسجيل الخطابة بالواتساب (بدون رابط)</b>
        <button onClick={() => void save({ ...cfg, enabled: !cfg.enabled }, cfg.enabled ? "انطفى التسجيل ⏸️" : "اشتغل التسجيل ✅")}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${cfg.enabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{cfg.enabled ? "🟢 شغّال" : "⏸️ موقف"}</button>
      </div>
      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map(([k, l]) => <button key={k} onClick={() => { setView(k); if (k === "sess") void loadSess(); }} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${view === k ? "border-primary bg-primary text-primary-foreground" : ""}`}>{l}</button>)}
      </div>

      {view === "main" && <div className="mt-2 space-y-2">
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-2">
          <b className="text-xs">🚀 ابدأ التسجيل مع شخص بنفسك</b>
          <p className="text-[11px] text-muted-foreground">للي ما عرف يكتب «تسجيل»: اكتب رقمه واضغط، ويوصله أول سؤال على الواتساب فوراً.</p>
          <div className="mt-1 flex gap-1.5">
            <input value={mPhone} onChange={(e) => setMPhone(e.target.value)} inputMode="tel" dir="ltr" placeholder="مثال: 0551234567" className="min-w-0 flex-1 rounded-lg border bg-background p-2 text-sm" />
            <button disabled={mBusy || mPhone.replace(/\D/g, "").length < 9} onClick={async () => {
              const inst = cfg.instance || nums.find((n) => n.status === "open")?.name || nums[0]?.name;
              if (!inst) { setMNote("ما فيه رقم واتساب مربوط"); return; }
              setMBusy(true); setMNote("");
              try { const r = await startManual({ data: { storeId, instance: inst, phone: mPhone } }); setMNote(`✅ انرسل أول سؤال للرقم ${r.phone}`); setMPhone(""); }
              catch (e) { setMNote(`❌ ${e instanceof Error ? e.message : "ما انرسل، تأكد من الرقم"}`); }
              setMBusy(false);
            }} className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">{mBusy ? "..." : "ابدأ التسجيل"}</button>
          </div>
          {mNote && <p className="mt-1 text-[11px]">{mNote}</p>}
        </div>
        <p className="text-xs text-muted-foreground">العميل يكتب «تسجيل» أو «خطابة» أو «استمارة» ← النظام يسأله سؤال سؤال بأزرار مرقمة، وأول ما يخلص ينحفظ طلبه هنا ويوصله رقم طلبه.</p>
        <label className="block text-xs"><span className="text-muted-foreground">📲 رقم الخطابة المخصص للتسجيل</span>
          <select value={cfg.instance} onChange={(e) => void save({ ...cfg, instance: e.target.value })} className="mt-0.5 w-full rounded-lg border bg-background p-2 text-sm">
            <option value="">كل أرقامي المربوطة</option>
            {nums.map((n) => <option key={n.name} value={n.name}>{n.label.replace(/_/g, " ")} {n.status === "open" ? "🟢" : "🔴"}</option>)}
          </select>
        </label>
        <label className="flex items-center justify-between gap-2 rounded-xl border p-2 text-xs">
          <span>✨ الوضع الذكي: لو العميل كتب أكثر من معلومة برسالة وحدة، يعبيها كلها ويتخطى الأسئلة اللي جاوبها</span>
          <input type="checkbox" checked={cfg.smart} onChange={(e) => void save({ ...cfg, smart: e.target.checked })} />
        </label>
        <label className="block text-xs"><span className="text-muted-foreground">👋 رسالة الترحيب (اختياري)</span>
          <textarea defaultValue={cfg.welcome} key={cfg.welcome} onBlur={(e) => e.target.value !== cfg.welcome && void save({ ...cfg, welcome: e.target.value })} rows={2} placeholder="مثال: يا هلا فيك مع خطابة أم ندى 🤍 بياناتك سرية تماماً" className="mt-0.5 w-full rounded-lg border bg-background p-2 text-sm" />
        </label>
        <button onClick={() => copy("للتسجيل بسرية وبدون روابط، اكتب لنا بالواتساب كلمة: تسجيل 🤍")} className="rounded-xl border px-3 py-1.5 text-xs">📋 نسخ رسالة دعوة العميل</button>
      </div>}

      {view === "q" && <div className="mt-2 space-y-2">
        <p className="text-xs text-muted-foreground">عدّل نص أي سؤال على ذوقك. اتركه فاضي يرجع للنص الأصلي. الأزرار المرقمة تطلع تلقائي.</p>
        {steps.map((s, i) => <label key={s.k} className="block text-xs"><span className="text-muted-foreground">{i + 1}. {s.q.split("\n").pop()}{s.opts.length ? ` • أزرار: ${s.opts.join("، ")}` : ""}</span>
          <input defaultValue={cfg.questions[s.k] ?? ""} placeholder={s.q.split("\n").pop()} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (cfg.questions[s.k] ?? "")) { const q = { ...cfg.questions }; if (v) q[s.k] = v; else delete q[s.k]; void save({ ...cfg, questions: q }); } }} className="mt-0.5 w-full rounded-lg border bg-background p-1.5 text-sm" />
        </label>)}
      </div>}

      {view === "learn" && <div className="mt-2 space-y-2">
        <p className="text-xs text-muted-foreground">علّم النظام: لو سأل العميل أثناء التسجيل سؤال مثل «كم السعر؟» أو «هل البيانات سرية؟» يرد بجوابك ويرجع يكمل نفس السؤال بدون ما يخبص الخانات.</p>
        <input value={lq.q} onChange={(e) => setLq({ ...lq, q: e.target.value })} placeholder="إذا قال العميل: كم السعر" className="w-full rounded-lg border bg-background p-2 text-sm" />
        <textarea value={lq.a} onChange={(e) => setLq({ ...lq, a: e.target.value })} rows={2} placeholder="رد عليه: التسجيل مجاني 🤍 وبعد التوافق نتفاهم" className="w-full rounded-lg border bg-background p-2 text-sm" />
        <button onClick={() => { if (!lq.q.trim() || !lq.a.trim()) return; void save({ ...cfg, learned: [...cfg.learned, { q: lq.q.trim(), a: lq.a.trim() }] }, "تعلّمها ✅"); setLq({ q: "", a: "" }); }} className="w-full rounded-xl bg-gold py-2 text-sm font-semibold text-accent-foreground">🧠 علّمه</button>
        {cfg.learned.map((l, i) => <div key={i} className="flex items-start justify-between gap-2 rounded-xl border p-2 text-xs"><div><b>❓ {l.q}</b><div className="text-muted-foreground">↩️ {l.a}</div></div><button onClick={() => void save({ ...cfg, learned: cfg.learned.filter((_, j) => j !== i) }, "انحذف")}>🗑️</button></div>)}
      </div>}

      {view === "sess" && <div className="mt-2 space-y-1.5">
        {!sess.length && <p className="text-xs text-muted-foreground">ما فيه أحد سجّل بالواتساب للحين.</p>}
        {sess.map((s) => <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl border p-2 text-xs">
          <div><b dir="ltr">+{s.phone}</b> {s.gender === "female" ? "👰" : s.gender === "male" ? "🤵" : ""} {s.data?.["name"] ?? ""}
            <div className="text-muted-foreground">{s.done ? "✅ اكتمل" : `⏳ واقف عند سؤال ${Math.min(s.step + 1, total)}/${total}: ${steps[s.step]?.q.split("\n").pop() ?? ""}`} • {new Date(s.updated_at).toLocaleString("ar")}</div></div>
          <div className="flex gap-1">
            <a href={`https://wa.me/${s.phone}`} target="_blank" rel="noreferrer" className="rounded-lg border px-2 py-1">💬</a>
            <button onClick={async () => { await supabase.from("marriage_wa_sessions").delete().eq("id", s.id); void loadSess(); }} className="rounded-lg border px-2 py-1">🗑️</button>
          </div>
        </div>)}
      </div>}

      {view === "sim" && <div className="mt-2 space-y-2">
        <p className="text-xs text-muted-foreground">جرّبه كأنك عميل — ما ينرسل شي لأحد وما ينحفظ طلب حقيقي.</p>
        <div className="max-h-80 space-y-1.5 overflow-y-auto rounded-xl bg-muted/40 p-2">
          {!chat.length && <p className="py-4 text-center text-xs text-muted-foreground">اضغط «ابدأ التجربة»</p>}
          {chat.map((m, i) => <div key={i} className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-1.5 text-xs ${m.me ? "mr-auto bg-primary text-primary-foreground" : "ml-auto bg-card border"}`}>{m.t}</div>)}
          <div ref={end} />
        </div>
        {lastOpts.length > 0 && <div className="flex flex-wrap gap-1.5">{lastOpts.map((o, i) => <button key={o} disabled={busy} onClick={() => void send(String(i + 1))} className="rounded-full border bg-background px-3 py-1 text-xs">{i + 1}. {o}</button>)}</div>}
        <div className="flex gap-2">
          <input value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void send(msg)} placeholder="اكتب رد العميل…" className="min-w-0 flex-1 rounded-xl border bg-background p-2 text-sm" />
          <button disabled={busy} onClick={() => void send(msg)} className="rounded-xl bg-primary px-3 text-sm text-primary-foreground">{busy ? "…" : "إرسال"}</button>
        </div>
        <button disabled={busy} onClick={() => { setChat([]); void send("تسجيل", true); }} className="w-full rounded-xl border py-1.5 text-xs">🔄 ابدأ التجربة من جديد</button>
      </div>}
    </div>
  );
}
