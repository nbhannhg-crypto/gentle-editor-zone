import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CTRL_PREFIX, GENERAL_OR, defaultCtrl, digits, parseCtrl, type WaCtrl, type WaLog } from "@/lib/wa-controls";
import { guessCategory } from "@/lib/rules";
import { waCtrlSend, waOutreach, waVoicePreview } from "@/lib/wa-ctrl.functions";
import { CallIdentity, StaffSwitcher } from "@/components/CallIdentity";
import { loadMySections } from "@/lib/sections-cloud";

type Brain = { id: string; name: string };
type Pop = "persona" | "facts" | "banned" | "fixes" | "numbers" | "model" | "staff" | null;
const MODELS = [["", "تلقائي (الأفضل)"], ["gemini", "Gemini"], ["gpt-4o-mini", "GPT-4o mini"], ["gpt-4o", "GPT-4o"], ["claude-3.5-sonnet", "Claude Sonnet"]] as const;
const showNum = (n: string) => (n.endsWith("@lid") ? `رمز ${n.replace("@lid", "").slice(-6)}` : `+${digits(n)}`);

/** Unified WhatsApp control panel: quick pills, popups, approval cards, inbox and outreach. */
export function WaControls({ instance, myNumber = "" }: { instance: string; myNumber?: string }) {
  const key = CTRL_PREFIX + instance;
  const send = useServerFn(waCtrlSend);
  const outreach = useServerFn(waOutreach);
  const [rowId, setRowId] = useState<string | null>(null);
  const [c, setC] = useState<WaCtrl | null>(null);
  const [state, setState] = useState("");
  const [brains, setBrains] = useState<Brain[]>([]);
  const [mySecs, setMySecs] = useState<string[]>([]);
  const [pop, setPop] = useState<Pop>(null);
  const [teach, setTeach] = useState<{ n: string; t: string; a?: string } | null>(null);
  const [ans, setAns] = useState("");
  const [chat, setChat] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState({ to: "", goal: "", style: "welcome" as "welcome" | "story" | "sales", text: "" });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const preview = useServerFn(waVoicePreview);
  const heard = useRef<{ text: string; audio: string } | null>(null);
  const [storeId, setStoreId] = useState<string | undefined>(undefined);
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      void supabase.from("stores").select("id").eq("owner_id", data.user.id).limit(1).maybeSingle().then(({ data: st }) => setStoreId(st?.id ?? undefined));
    });
  }, []);
  const dismissMiss = (m: { n: string; t: string }) => update({ misses: c ? c.misses.filter((x) => !(x.t === m.t && x.n === m.n)) : [] }, true);

  const load = async () => {
    const { data } = await supabase.from("training_rules").select("id, response_text").eq("trigger_text", key).limit(1).maybeSingle();
    setRowId((data as any)?.id ?? null);
    setC(parseCtrl((data as any)?.response_text));
  };
  useEffect(() => {
    void load();
    (supabase.rpc as any)("kingdom_brains").then((r: any) => setBrains(((r.data ?? []) as any[]).map((b) => ({ id: b.id, name: b.name })))).catch(() => {});
    // Merchant's own library sections (saved locally + tags found in the reply library)
    (async () => {
      const set = new Set<string>();
      try { (await loadMySections()).forEach((s) => s && set.add(String(s))); } catch { /* ignore */ }
      try {
        const { data } = await (supabase.from as any)("reply_library").select("tag").limit(1000);
        ((data ?? []) as any[]).forEach((r) => r.tag && set.add(String(r.tag)));
      } catch { /* ignore */ }
      // Cloud-saved section lists (any new empty section shows a button immediately)
      try {
        const { data } = await supabase.from("training_rules").select("response_text").like("trigger_text", "mb_sections:%");
        ((data ?? []) as any[]).forEach((r) => { try { (JSON.parse(r.response_text || "[]") as any[]).forEach((s) => s && set.add(String(s))); } catch { /* ignore */ } });
      } catch { /* ignore */ }
      // Sections linked to brains
      try {
        const { data } = await supabase.from("brains").select("library_tag");
        ((data ?? []) as any[]).forEach((b) => { if (b.library_tag && b.library_tag !== "__rules__") set.add(String(b.library_tag)); });
      } catch { /* ignore */ }
      // Section names found in store rules (overflow replies) and the full reply library, without one big section hiding the rest
      const GEN = new Set(["settings", "عام", "السعر", "التوصيل", "الجودة", "الضمان", "التأجيل"]);
      const scanTags = async (table: string, col: string) => {
        let from = 0;
        for (let guard = 0; guard < 200; guard++) {
          const { data } = await (supabase.from as any)(table).select(col).order(col).range(from, from + 999);
          const rows = (data ?? []) as any[];
          if (!rows.length) break;
          const last = rows[rows.length - 1][col];
          rows.forEach((r) => { const v = r[col]; if (v && !GEN.has(String(v))) set.add(String(v)); });
          if (rows.length < 1000 || last == null) break;
          // Jump past every row of the last value so a giant section is skipped in one step
          const { count } = await (supabase.from as any)(table).select("id", { count: "exact", head: true }).lte(col, last);
          from = Math.max(from + 1000, count ?? from + 1000);
        }
      };
      try { await scanTags("training_rules", "category"); } catch { /* ignore */ }
      try { await scanTags("reply_library", "tag"); } catch { /* ignore */ }
      setMySecs([...set]);
    })();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance]);

  const persist = async (next: WaCtrl) => {
    const body = JSON.stringify(next);
    try { localStorage.setItem(key, body); } catch { /* ignore */ }
    if (rowId) {
      const { error } = await supabase.from("training_rules").update({ response_text: body }).eq("id", rowId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from("training_rules").insert({ trigger_text: key, response_text: body, category: "settings", store_id: null } as any).select("id").single();
      if (error) throw error;
      setRowId((data as any).id);
    }
  };
  // Snapshot of the selected brains/sections replies so the WhatsApp engine can answer from them
  const syncLib = async (sel: string[]) => {
    const snap: Record<string, [string, string][]> = {};
    for (const b of sel) {
      if (b === "rules:off" || b === "__rules__") continue;
      try {
        let rows: any[] = [];
        if (b.startsWith("lib:")) {
          // No cap: read every reply in the section (80k+ supported)
          for (let from = 0; ; from += 1000) {
            const { data } = await (supabase.from as any)("reply_library").select("trigger_text, reply_text").eq("tag", b.slice(4)).range(from, from + 999);
            rows.push(...(data ?? []));
            if (!data || data.length < 1000) break;
          }
          // Plus replies of this section saved in store rules (category = section name)
          for (let from = 0; ; from += 1000) {
            const { data } = await (supabase.from as any)("training_rules").select("trigger_text, reply_text:response_text").eq("category", b.slice(4)).range(from, from + 999);
            rows.push(...(data ?? []));
            if (!data || data.length < 1000) break;
          }
        } else {
          const { data } = await (supabase.rpc as any)("kingdom_replies", { _brain: b });
          rows = data ?? [];
        }
        snap[b] = rows.filter((r) => r?.trigger_text && r?.reply_text).map((r) => [String(r.trigger_text), String(r.reply_text)]);
      } catch { /* ignore */ }
    }
    const lk = CTRL_PREFIX + "lib:" + instance;
    // Big sections are split into chunk rows ("<key>#1", "#2"…) so no single row gets too large
    const CH = 3000;
    const first: Record<string, [string, string][]> = {};
    const chunks: Record<string, [string, string][]>[] = [];
    for (const [k, v] of Object.entries(snap)) {
      first[k] = v.slice(0, CH);
      for (let i = CH, n = 0; i < v.length; i += CH, n++) { (chunks[n] ??= {})[k] = v.slice(i, i + CH); }
    }
    const body = JSON.stringify(first);
    const { data: ex } = await supabase.from("training_rules").select("id").eq("trigger_text", lk).maybeSingle();
    if (ex) await supabase.from("training_rules").update({ response_text: body }).eq("id", (ex as any).id);
    else await supabase.from("training_rules").insert({ trigger_text: lk, response_text: body, category: "settings", store_id: null } as any);
    await supabase.from("training_rules").delete().like("trigger_text", lk + "#%");
    for (let i = 0; i < chunks.length; i += 20) {
      await supabase.from("training_rules").insert(chunks.slice(i, i + 20).map((ch, j) => ({ trigger_text: `${lk}#${i + j + 1}`, response_text: JSON.stringify(ch), category: "settings", store_id: null })) as any);
    }
    let total = Object.values(snap).reduce((n, v) => n + v.length, 0);
    // Store rules count too when their button is on (read live)
    if (!sel.includes("rules:off")) {
      // Store rules button counts only the general taught rules (section overflow keeps its own button)
      const { count } = await supabase.from("training_rules").select("id", { count: "exact", head: true }).not("trigger_text", "like", "__wa_%").or(GENERAL_OR);
      total += count ?? 0;
    }
    return total;
  };
  const update = (patch: Partial<WaCtrl>, now = false) => {
    const next = { ...(c ?? defaultCtrl()), ...patch };
    setC(next); setState("⏳ جاري الحفظ…");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await persist(next);
        if (patch.brains) { const n = await syncLib(next.brains); setState(`✅ انحفظ — ${n} رد جاهز من الأزرار المحددة`); }
        else setState("✅ انحفظ");
      }
      catch (e) { setState(""); toast.error("ما انحفظ: " + (e as Error).message); }
    }, now ? 0 : 700);
  };

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const synced = useRef(false);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (c && !synced.current) { synced.current = true; if (c.brains.length) void syncLib(c.brains).catch(() => {}); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c]);
  if (!c) return null;
  const pill = (on: boolean) => `shrink-0 rounded-full border px-3 py-1.5 text-xs ${on ? "bg-primary text-primary-foreground" : "bg-background"}`;
  const togglePause = (n: string) => {
    const d = digits(n) || n;
    if (d) update({ paused: c.paused.includes(d) ? c.paused.filter((x) => x !== d) : [...c.paused, d] }, true);
  };
  const isPaused = (n: string) => c.paused.includes(digits(n) || n);
  const saveTeach = async () => {
    if (!teach || !ans.trim()) return;
    const { error } = await supabase.from("training_rules").insert({ trigger_text: teach.t.trim(), response_text: ans.trim(), category: guessCategory(teach.t), store_id: null });
    if (error) { toast.error(error.message); return; }
    toast.success("✅ انحفظ — المرة الجاية ترد فيه تلقائياً");
    update({ misses: c.misses.filter((m) => !(m.t === teach.t && m.n === teach.n)) }, true);
    setTeach(null); setAns("");
  };
  const listen = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      const audio = heard.current?.text === draft ? heard.current.audio : (await preview({ data: { text: draft } })).audio;
      heard.current = { text: draft, audio };
      await new Audio(audio).play();
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };
  const doSend = async (to: string, text: string, voice = false, fromPending?: { n: string; t: string }) => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      // Voice: send the exact clip you listened to (no re-generation)
      const audio = voice && heard.current?.text === text ? heard.current.audio : undefined;
      await send({ data: { instance, to, text, voice, audio } });
      toast.success(voice ? "🎙️ انرسل كفويس" : "🚀 انرسل");
      const log: WaLog[] = [...c.log, { n: to, t: "", r: text, at: Date.now(), me: true }].slice(-300);
      update({ log, pending: fromPending ? c.pending.filter((p) => !(p.n === fromPending.n && p.t === fromPending.t)) : c.pending }, true);
      setDraft("");
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };
  const runOutreach = async (doIt: boolean) => {
    if (!out.to.trim()) { toast.error("اكتب رقم العميل"); return; }
    setBusy(true);
    try {
      if (doIt && out.text) { await doSend(digits(out.to), out.text); setOut({ ...out, text: "" }); }
      else { const r = await outreach({ data: { instance, to: digits(out.to), goal: out.goal, style: out.style, prompt: c.prompt, send: false } }); setOut({ ...out, text: r.text }); }
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };

  // Inbox grouped per customer, duplicates collapsed
  const groups = new Map<string, WaLog[]>();
  for (const m of c.log) {
    const g = groups.get(m.n) ?? [];
    const last = g[g.length - 1];
    if (last && !m.me && last.t === m.t && last.r === m.r) continue;
    g.push(m); groups.set(m.n, g);
  }
  const people = [...groups.entries()].sort((a, b) => b[1][b[1].length - 1]!.at - a[1][a[1].length - 1]!.at);
  const history = chat ? groups.get(chat) ?? [] : [];

  const popBtn = (k: Exclude<Pop, null>, l: string) => <button key={k} className="rounded-xl border bg-background px-3 py-2 text-right text-xs" onClick={() => setPop(k)}>{l}</button>;
  const field = (k: "prompt" | "facts" | "banned" | "fixes", ph: string) => <Textarea rows={6} value={c[k]} onChange={(e) => update({ [k]: e.target.value })} placeholder={ph} />;

  return (
    <div className="w-full space-y-3 rounded-xl border-2 border-primary/40 bg-background p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">🎛️ لوحة تحكم الموظفة</span>
        {state && <span className="text-xs text-muted-foreground">{state}</span>}
      </div>

      {/* 1) Quick pills */}
      <div className="space-y-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <span className="shrink-0 self-center text-xs">🎯 دقة المطابقة:</span>
          {[50, 60, 80, 100].map((p) => (
            <button key={p} className={pill((c.match ?? 60) === p)} onClick={() => update({ match: p }, true)}>{p === 100 ? "🔒 100% بالحرف" : `${p}%`}</button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button className={pill(c.enabled)} onClick={() => update({ enabled: !c.enabled }, true)}>{c.enabled ? "🟢 شغال" : "🔴 متوقف"}</button>
          <button className={pill(c.mode === "auto")} onClick={() => update({ mode: "auto" }, true)}>⚡ رد آلي مباشر</button>
          <button className={pill(c.mode === "approval")} onClick={() => update({ mode: "approval" }, true)}>🛡️ استشارتي أولاً</button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {([["rules", "📘 ردودي بس"], ["smart", "🧠 ردودي + الذكاء"], ["ai", "✨ الذكاء بالكامل"]] as const).map(([k, l]) => (
            <button key={k} className={pill(c.source === k)} onClick={() => update({ source: k }, true)}>{l}</button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button className={pill(!c.voice)} onClick={() => update({ voice: false }, true)}>💬 نص</button>
          <button className={pill(c.voice)} onClick={() => update({ voice: true }, true)}>🎧 فويس</button>
          <span className="mx-1 self-center text-muted-foreground">|</span>
          {[0, 3, 10, 25].map((s) => <button key={s} className={pill(c.delay === s)} onClick={() => update({ delay: s }, true)}>{s ? `⏱️ ${s} ث` : "⚡ فوري"}</button>)}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <span className={pill(true)}>📚 مكتبتي</span>
          {brains.map((b) => (
            <button key={b.id} className={pill(c.brains.includes(b.id))}
              onClick={() => update({ brains: c.brains.includes(b.id) ? c.brains.filter((x) => x !== b.id) : [...c.brains, b.id] }, true)}>👑 {b.name}</button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <span className={pill(true)}>📂 أقسامي وعقولي</span>
          <button className={pill(!c.brains.includes("rules:off"))}
            onClick={() => update({ brains: c.brains.includes("rules:off") ? c.brains.filter((x) => x !== "rules:off") : [...c.brains, "rules:off"] }, true)}>📘 قواعد المتجر</button>
          {mySecs.length === 0 && <span className="self-center text-[11px] text-muted-foreground">أنشئ قسماً في «مملكة العقول» يظهر هنا</span>}
          {mySecs.map((t) => {
            const id = "lib:" + t;
            const on = c.brains.includes(id);
            return <button key={id} className={pill(on)}
              onClick={() => update({ brains: on ? c.brains.filter((x) => x !== id) : [...c.brains, id] }, true)}>🏷️ {t}</button>;
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">الواتساب يسمح بأقصى 25 ثانية تأخير.</p>
      </div>

      {/* 2) Popup buttons */}
      <div className="grid grid-cols-2 gap-1.5">
        {popBtn("persona", "🎭 شخصية الموظفة")}
        {popBtn("facts", "🧠 معلومات المتجر")}
        {popBtn("banned", "🚫 كلمات ممنوعة")}
        {popBtn("fixes", "⚠️ تصحيح الأخطاء")}
        {popBtn("numbers", "📞 المسموحة والمحظورة")}
        {popBtn("model", "🤖 موديل الذكاء")}
        {popBtn("staff", "👯 طاقم الموظفات")}
      </div>

      {/* 3) Approval cards */}
      {c.pending.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-semibold">🛡️ رسائل تنتظر موافقتك ({c.pending.length})</span>
          {[...c.pending].reverse().map((p) => (
            <div key={p.n + p.at} className="space-y-1.5 rounded-lg border border-primary/40 bg-muted/40 p-2 text-sm">
              <div dir="ltr" className="text-right text-xs text-muted-foreground">{showNum(p.n)}</div>
              <div>👤 {p.t}</div>
              <div className="text-primary">👩‍💼 {p.s}</div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" disabled={busy} onClick={() => doSend(p.n, p.s, false, p)}>🚀 أرسل</Button>
                <Button size="sm" variant="outline" onClick={() => { setChat(p.n); setDraft(p.s); }}>✏️ عدّل</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => doSend(p.n, p.s, true, p)}>🎙️ فويس</Button>
                <Button size="sm" variant="ghost" onClick={() => update({ pending: c.pending.filter((x) => x !== p) }, true)}>✕</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 4) Inbox */}
      <div className="space-y-1.5">
        <span className="text-xs font-semibold">💬 المحادثات</span>
        {people.length === 0 && <p className="text-xs text-muted-foreground">بتظهر هنا المحادثات أول ما توصل رسائل جديدة.</p>}
        {people.map(([n, msgs]) => {
          const last = msgs[msgs.length - 1]!;
          return (
            <button key={n} onClick={() => { setChat(n); setDraft(""); }} className="flex w-full items-center justify-between gap-2 rounded-lg bg-muted/50 p-2 text-right text-sm">
              <div className="min-w-0">
                <div dir="ltr" className="text-right text-xs text-muted-foreground">{showNum(n)} {isPaused(n) && "⏸️"}</div>
                <div className="truncate">{last.me ? `👩‍💼 ${last.r}` : `👤 ${last.t}`}</div>
              </div>
              <span className="shrink-0 rounded-full bg-background px-2 text-xs">{msgs.length}</span>
            </button>
          );
        })}
      </div>

      {/* 5) Misses */}
      {c.misses.length > 0 && (
        <div className="space-y-1.5 rounded-xl border p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">💡 رسائل بدون رد — علّم الموظفة ({c.misses.length})</span>
            <button className="text-[11px] text-muted-foreground underline" onClick={() => { if (confirm("تمسح كل الرسائل من القائمة؟")) update({ misses: [] }, true); }}>🧹 مسح الكل</button>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto overscroll-contain rounded-lg bg-muted p-2">
            {[...c.misses].reverse().map((m, i) => (
              <div key={m.n + m.t + i} className="space-y-1">
                <div className="w-fit max-w-[85%] rounded-2xl rounded-tr-sm bg-background p-2 text-sm shadow-sm">
                  <div dir="ltr" className="text-right text-[10px] text-muted-foreground">{showNum(m.n)}</div>
                  {m.t}
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" className="h-7 px-2 text-xs" onClick={() => { setTeach(m); setAns(""); }}>💡 علّمها</Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => dismissMiss(m)}>🗑️ حذف</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6) Outreach */}
      <div className="space-y-2 rounded-lg border p-2">
        <span className="text-xs font-semibold">🚀 بدء محادثة جديدة مع عميل</span>
        <Input dir="ltr" value={out.to} onChange={(e) => setOut({ ...out, to: e.target.value })} placeholder="9665xxxxxxxx" />
        <Input value={out.goal} onChange={(e) => setOut({ ...out, goal: e.target.value })} placeholder="الهدف: مثلاً عرض العسل الجديد" />
        <div className="flex gap-1.5 overflow-x-auto">
          {([["welcome", "🌸 ترحيب واهتمام"], ["story", "📖 قصة مشوقة"], ["sales", "💼 إقناع ومبيعات"]] as const).map(([k, l]) => (
            <button key={k} className={pill(out.style === k)} onClick={() => setOut({ ...out, style: k })}>{l}</button>
          ))}
        </div>
        {out.text && <Textarea rows={3} value={out.text} onChange={(e) => setOut({ ...out, text: e.target.value })} />}
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => runOutreach(false)}>✍️ صياغة</Button>
          <Button size="sm" disabled={busy || !out.text} onClick={() => runOutreach(true)}>🚀 أرسل للواتساب</Button>
        </div>
      </div>

      {/* Popups */}
      <Dialog open={!!pop} onOpenChange={(o) => { if (!o) setPop(null); }}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          {pop === "persona" && <><DialogHeader><DialogTitle>🎭 شخصية الموظفة والأسلوب</DialogTitle></DialogHeader>{field("prompt", "مثال: موظفة لبقة، لهجة سعودية، ردود قصيرة")}</>}
          {pop === "facts" && <><DialogHeader><DialogTitle>🧠 معلومات المتجر</DialogTitle></DialogHeader>{field("facts", "المدينة، أوقات العمل، الشحن، الاسترجاع…")}</>}
          {pop === "banned" && <><DialogHeader><DialogTitle>🚫 الكلمات الممنوعة وتصحيح اللهجة</DialogTitle></DialogHeader>{field("banned", "كلمة في كل سطر. للتصحيح: الخطأ = الصح\nبوت\nروبوت\nشلونك = كيفك")}</>}
          {pop === "fixes" && <><DialogHeader><DialogTitle>⚠️ تصحيح الأخطاء السابقة</DialogTitle></DialogHeader>{field("fixes", "مثال: لا تقولي إن الشحن مجاني")}</>}
          {pop === "numbers" && <>
            <DialogHeader><DialogTitle>📞 الأرقام المسموحة والمحظورة</DialogTitle></DialogHeader>
            <span className="text-xs text-muted-foreground">المسموحة (فاضي = يرد على الكل)</span>
            <Textarea dir="ltr" rows={3} value={c.allowed} onChange={(e) => update({ allowed: e.target.value })} placeholder="966500000000" />
            <span className="text-xs text-muted-foreground">القائمة السوداء (ما يرد عليهم أبداً)</span>
            <Textarea dir="ltr" rows={3} value={c.blocked} onChange={(e) => update({ blocked: e.target.value })} placeholder="966511111111" />
            {c.paused.length > 0 && <div className="flex flex-wrap gap-1.5">{c.paused.map((n) => <button key={n} className={pill(true)} onClick={() => togglePause(n)} dir="ltr">⏸️ {n} ✕</button>)}</div>}
          </>}
          {pop === "model" && <>
            <DialogHeader><DialogTitle>🤖 موديل الذكاء</DialogTitle></DialogHeader>
            <div className="flex flex-wrap gap-1.5">{MODELS.map(([k, l]) => <button key={k} className={pill(c.model === k)} onClick={() => update({ model: k }, true)}>{l}</button>)}</div>
          </>}
          {pop === "staff" && <><DialogHeader><DialogTitle>👯 طاقم الموظفات</DialogTitle></DialogHeader>
            <p className="text-xs text-muted-foreground">موظفة هذا الرقم فقط 🟢 — كل رقم واتساب له موظفته وزر إطفائه المستقل.</p>
            <StaffSwitcher storeId={storeId} channel={`wa:${instance}`} />
            <CallIdentity storeId={storeId} /></>}
          {state && <p className="text-xs text-muted-foreground">{state}</p>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!chat} onOpenChange={(o) => { if (!o) setChat(null); }}>
        <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto">
          <DialogHeader><DialogTitle dir="ltr">💬 {chat && showNum(chat)}</DialogTitle></DialogHeader>
          <div className="max-h-[45vh] space-y-1.5 overflow-y-auto rounded-lg bg-muted p-2">
            {history.map((m, i) => (
              <div key={i} className="space-y-1">
                {m.t && <p className="w-fit max-w-[85%] rounded-xl bg-background p-2 text-sm">{m.t}</p>}
                {m.r && <p className="mr-auto w-fit max-w-[85%] rounded-xl bg-primary p-2 text-sm text-primary-foreground">{m.r}</p>}
                {m.t && !m.r && !m.me && <button className="text-xs underline" onClick={() => { setTeach({ n: m.n, t: m.t }); setAns(""); }}>💡 علّم الموظفة الرد</button>}
              </div>
            ))}
          </div>
          <Textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="اكتب ردك أو عدّل المقترح" />
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" disabled={busy || !draft.trim()} onClick={() => chat && doSend(chat, draft, false, c.pending.find((p) => p.n === chat))}>🚀 إرسال</Button>
            <Button size="sm" variant="outline" disabled={busy || !draft.trim()} onClick={() => chat && doSend(chat, draft, true)}>🎙️ كفويس</Button>
            <Button size="sm" variant="ghost" className="px-2" disabled={busy || !draft.trim()} onClick={listen} title="استمع قبل الإرسال">🎧 استمع</Button>
            <Button size="sm" variant="outline" onClick={() => chat && togglePause(chat)}>{chat && isPaused(chat) ? "▶️ رجّع الرد الآلي" : "⏸️ إيقاف مؤقت عنه"}</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">📸 للصور والفيديو: الصق رابط الملف من المكتبة في الرد.</p>
        </DialogContent>
      </Dialog>

      <Dialog open={!!teach} onOpenChange={(o) => { if (!o) setTeach(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>💡 علّم الموظفة الرد</DialogTitle></DialogHeader>
          <p className="rounded-md bg-muted p-2 text-sm">العميل قال: «{teach?.t}»</p>
          <Textarea rows={3} value={ans} onChange={(e) => setAns(e.target.value)} placeholder="اكتب الرد اللي تبيها ترد فيه" />
          <Button onClick={saveTeach} disabled={!ans.trim()}>حفظ كقاعدة ✅</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Small "teach" button for inbox entries without a reply. */
export function TeachButton({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [ans, setAns] = useState("");
  const save = async () => {
    const { error } = await supabase.from("training_rules").insert({ trigger_text: text.trim(), response_text: ans.trim(), category: guessCategory(text), store_id: null });
    if (error) { toast.error(error.message); return; }
    toast.success("✅ انحفظ — المرة الجاية ترد فيه تلقائياً"); setOpen(false); setAns("");
  };
  return (
    <>
      <Button size="sm" variant="outline" className="mt-1" onClick={() => setOpen(true)}>علّم الموظفة الرد 💡</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>💡 علّم الموظفة الرد</DialogTitle></DialogHeader>
          <p className="rounded-md bg-muted p-2 text-sm">الزبون قال: «{text}»</p>
          <Textarea rows={3} value={ans} onChange={(e) => setAns(e.target.value)} placeholder="اكتب الرد" />
          <Button onClick={save} disabled={!ans.trim()}>حفظ واعتماد فوراً ✅</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
