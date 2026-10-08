import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BalanceBadge } from "@/components/BalanceBadge";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { addRule, cacheRules, cachedRules, fetchRules, findMatches, guessCategory, recordUse, type Rule } from "@/lib/rules";
import { smartReply, suggestReplies, weeklyReport } from "@/lib/ai.functions";
import { getOrCreateMyStore, isAdmin, type Store } from "@/lib/stores";
import { VoiceStudio, useSpeaker, EMOTIONS, loadVoice } from "@/components/VoiceStudio";
import { Channels } from "@/components/Channels";
import { Customers } from "@/components/Customers";
import { Products } from "@/components/Products";
import { Wallet } from "@/components/Wallet";
import { QueenBrain } from "@/components/QueenBrain";
import { KingdomCall } from "@/components/KingdomCall";
import { BotsTeam } from "@/components/BotsTeam";
import { SellerProfile } from "@/components/SellerProfile";
import { DealEye } from "@/components/DealEye";
import { MagicBrains } from "@/components/MagicBrains";
import { Campaigns } from "@/components/Campaigns";
import { Appointments } from "@/components/Appointments";
import { BrainFactory } from "@/components/BrainFactory";
import { MotherBrain } from "@/components/MotherBrain";
import { KingdomBrains } from "@/components/KingdomBrains";
import { MediaLibrary } from "@/components/MediaLibrary";
import { Complaints } from "@/components/Complaints";
import { WaInbox } from "@/components/WaInbox";
import { VoiceAssistant } from "@/components/VoiceAssistant";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "مملكة المبيعات — لوحة التاجر" },
      { name: "description", content: "درّب موظفة مبيعات ذكية بقواعدك، واختبرها، وخلها ترد على زبائنك بصوت سعودي." },
      { property: "og:title", content: "مملكة المبيعات — لوحة التاجر" },
      { property: "og:description", content: "علّم موظفتك الذكية كيف ترد على الزبائن مثل موظفة حقيقية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: App,
});

export type Mode = "learn" | "smart";
type Tab = "train" | "call" | "kcall" | "voice" | "channels" | "customers" | "products" | "wallet" | "dash" | "bots" | "profile" | "deals" | "campaigns" | "appointments" | "brains" | "magic" | "mother" | "library" | "inbox" | "complaints";

function App() {
  const [tab, setTab] = useState<Tab>("brains");
  const [mode, setMode] = useState<Mode>("learn");
  const [rules, setRules] = useState<Rule[]>([]);
  const [product, setProduct] = useState("");
  const [store, setStore] = useState<Store | null>(null);
  const [admin, setAdmin] = useState(false);
  const navigate = useNavigate();

  const reload = async (storeId?: string) => setRules(await fetchRules(storeId));
  useEffect(() => {
    setRules(cachedRules());
    setProduct(localStorage.getItem("kingdom_product") || "");
    getOrCreateMyStore().then((s) => { setStore(s); if (s) reload(s.id); });
    isAdmin().then(setAdmin);
  }, []);
  useEffect(() => { localStorage.setItem("kingdom_product", product); }, [product]);

  return (
    <div className="min-h-screen">
      <header className="bg-royal text-primary-foreground">
        <div className="mx-auto max-w-6xl px-3 py-3 sm:px-4 sm:py-5">
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            <div>
              <h1 className="font-display text-xl md:text-3xl">👑 مملكة المبيعات</h1>
              <p className="hidden text-sm opacity-80 sm:block">علّم موظفتك مرة… وتطبّق للأبد</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex rounded-full bg-primary-foreground/15 p-1 text-xs sm:text-sm">
                {([["learn", "📘 وضع التعلم"], ["smart", "✨ وضع ذكي"]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setMode(k)}
                    className={`rounded-full px-3 py-1 sm:px-4 sm:py-1.5 transition ${mode === k ? "bg-gold text-accent-foreground font-semibold" : ""}`}>{l}</button>
                ))}
              </div>
              <BalanceBadge storeId={store?.id} onClick={() => setTab("wallet")} />
              <button onClick={() => navigate({ to: "/studio" })} className="rounded-full bg-gold px-3 py-1.5 text-sm font-semibold text-accent-foreground">🎤 استوديو الأصوات</button>
              {admin && (
                <button onClick={() => navigate({ to: "/admin" })} className="rounded-full bg-gold px-3 py-1.5 text-sm font-semibold text-accent-foreground">🛠️ لوحة المالك</button>
              )}
              <button
                onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}
                className="rounded-full bg-primary-foreground/15 px-3 py-1.5 text-sm"
              >خروج</button>
            </div>
          </div>
          <nav className="-mx-3 mt-3 flex gap-1 overflow-x-auto px-3 sm:mx-0 sm:mt-5 sm:gap-2 sm:px-0 [scrollbar-width:none]">
            {([["mother", "🧠 مملكة العقول"], ["brains", "🏭 مصنع العقول"], ["magic", "✨ عقول الإلهام"], ["bots", "🤖 فريق البوتات"], ["profile", "🏪 ملفي"], ["train", "علّم الموظفة"], ["call", "المكالمة المباشرة"], ["kcall", "📱 مكالمة المملكة"], ["voice", "🎙️ الصوت"], ["channels", "📡 القنوات"], ["inbox", "💬 المحادثات"], ["library", "📚 المكتبة"], ["complaints", "📮 الشكاوى"], ["customers", "👥 الزبائن"], ["campaigns", "📣 الحملات"], ["deals", "👁️ عين الصفقة"], ["appointments", "📅 المواعيد"], ["products", "🛍️ المنتجات"], ["wallet", "💰 المحفظة"], ["dash", "لوحة الأداء"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`shrink-0 rounded-t-xl px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm font-medium transition ${tab === k ? "bg-background text-foreground" : k === "mother" ? "animate-pulse bg-gold text-accent-foreground" : "text-primary-foreground/80 hover:bg-primary-foreground/10"}`}>{l}</button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
        <p className="mb-4 rounded-xl bg-secondary px-3 py-2 text-xs sm:px-4 sm:text-sm text-secondary-foreground">
          {mode === "learn" ? "📘 الموظفة ترد فقط من اللي علمتها إياه (100% من قواعدك)." : "✨ الموظفة ترد من تعليمك، وتستخدم ذكاءها للأسئلة الجديدة."}
        </p>
        {tab === "train" && <Training rules={rules} reload={() => reload(store?.id)} setRules={setRules} mode={mode} product={product} setProduct={setProduct} storeId={store?.id} />}
        {tab === "call" && <LiveCall rules={rules} reload={() => reload(store?.id)} mode={mode} product={product} storeId={store?.id} />}
        {tab === "kcall" && <KingdomCall rules={rules} reload={() => reload(store?.id)} mode={mode} product={product} storeId={store?.id} />}
        {tab === "voice" && <VoiceStudio />}
        {tab === "channels" && <Channels storeId={store?.id} />}
        {tab === "customers" && <Customers storeId={store?.id} />}
        {tab === "products" && <Products storeId={store?.id} />}
        {tab === "wallet" && <Wallet storeId={store?.id} />}
        {tab === "dash" && <Dashboard rules={rules} />}
        {tab === "bots" && <BotsTeam />}
        {tab === "profile" && <SellerProfile storeId={store?.id} />}
        {tab === "deals" && <DealEye storeId={store?.id} />}
        {tab === "campaigns" && <Campaigns storeId={store?.id} />}
        {tab === "appointments" && <Appointments storeId={store?.id} />}
        {tab === "magic" && <MagicBrains />}
        {tab === "mother" && <div className="space-y-6"><KingdomBrains admin={admin} storeId={store?.id} /><MotherBrain storeId={store?.id} /></div>}
        {tab === "library" && <MediaLibrary storeId={store?.id} />}
        {tab === "inbox" && <WaInbox storeId={store?.id} />}
        {tab === "complaints" && <Complaints storeId={store?.id} admin={admin} />}
        <VoiceAssistant onTab={(t) => setTab(t as Tab)} />
        {tab === "brains" && <BrainFactory onTab={(t) => setTab(t as Tab)} />}
      </main>
      <QueenBrain storeId={store?.id} onTab={(t) => { setTab(t as Tab); if (t === "train") reload(store?.id); }} />
    </div>
  );
}

function Card({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border bg-card p-5 shadow-soft ${className}`}>
      {title && <h2 className="font-display mb-4 text-lg text-primary">{title}</h2>}
      {children}
    </section>
  );
}

const rulesPayload = (rules: Rule[]) => rules.slice(0, 200).map((r) => ({ trigger: r.trigger_text, response: r.response_text }));

/* ---------------- Reply engine ---------------- */
export function useReplyEngine(rules: Rule[], mode: Mode, product: string) {
  const smart = useServerFn(smartReply);
  return async (text: string) => {
    const matches = findMatches(text, rules);
    const best = matches[0];
    if (best && (best.score >= 0.55 || mode === "learn")) {
      return { answer: best.rule.response_text, rule: best.rule, matches, source: "rule" as const };
    }
    if (mode === "smart") {
      const { reply } = await smart({ data: { customer: text, product, rules: rulesPayload(rules) } });
      return { answer: reply, rule: undefined, matches, source: "ai" as const };
    }
    return { answer: "", rule: undefined, matches, source: "none" as const };
  };
}

/* ---------------- Training ---------------- */
function parseBulk(text: string): { trigger_text: string; response_text: string }[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 2000);
  const out: { trigger_text: string; response_text: string }[] = [];
  const sep = /\s*(?:\||\t|=>|←|=|:)\s*/;
  let pending: string | null = null;
  for (const l of lines) {
    const m = l.match(sep);
    if (m && m.index && m.index > 0) {
      const q = l.slice(0, m.index).trim(), a = l.slice(m.index + m[0].length).trim();
      if (q && a) { out.push({ trigger_text: q.slice(0, 500), response_text: a.slice(0, 2000) }); pending = null; continue; }
    }
    if (pending) { out.push({ trigger_text: pending.slice(0, 500), response_text: l.slice(0, 2000) }); pending = null; }
    else pending = l;
  }
  return out.slice(0, 1000);
}

function Training({ rules, reload, setRules, mode, product, setProduct, storeId }: {
  rules: Rule[]; reload: () => Promise<void>; setRules: (r: Rule[]) => void; mode: Mode; product: string; setProduct: (s: string) => void; storeId?: string | undefined;
}) {
  const [trigger, setTrigger] = useState("");
  const [response, setResponse] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Training timer
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const saved = Number(localStorage.getItem("kingdom_train_secs") || 0);
    setSeconds(saved);
    const t = setInterval(() => setSeconds((s) => { localStorage.setItem("kingdom_train_secs", String(s + 1)); return s + 1; }), 1000);
    return () => clearInterval(t);
  }, []);
  const goal = 50;
  const progress = Math.min(100, (rules.length / goal) * 100);

  const save = async () => {
    if (!trigger.trim() || !response.trim()) { toast.error("اكتب كلام الزبون وردك"); return; }
    setSaving(true);
    const res = editing
      ? await supabase.from("training_rules").update({ trigger_text: trigger.trim(), response_text: response.trim(), category: guessCategory(trigger) }).eq("id", editing)
      : await addRule(trigger, response, storeId);
    setSaving(false);
    if (res.error) { toast.error("ما قدرنا نحفظ، جرب مرة ثانية"); return; }
    toast.success(editing ? "تم تعديل القاعدة" : "حفظتها! الموظفة تعلمت 🎉");
    setTrigger(""); setResponse(""); setEditing(null);
    reload();
  };

  const del = async (id: string) => {
    setRules(rules.filter((r) => r.id !== id));
    cacheRules(rules.filter((r) => r.id !== id));
    await supabase.from("training_rules").delete().eq("id", id);
    reload();
  };

  const importExcel = async (file: File) => {
    const wb = XLSX.read(await file.arrayBuffer());
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0] ?? ""]!, { header: 1 });
    const items = rows
      .filter((r) => r[0] && r[1] && !/سؤال|question/i.test(String(r[0])))
      .map((r) => ({ trigger_text: String(r[0]).trim().slice(0, 500), response_text: String(r[1]).trim().slice(0, 2000), category: guessCategory(String(r[0])) }));
    if (!items.length) { toast.error("ما لقينا صفوف. لازم عمودين: سؤال الزبون | ردك"); return; }
    const { error } = await supabase.from("training_rules").insert(items.map((i) => ({ ...i, store_id: storeId ?? null })));
    if (error) { toast.error("فشل الاستيراد"); return; }
    toast.success(`تم استيراد ${items.length} قاعدة`);
    reload();
  };

  const [bulk, setBulk] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const parsed = parseBulk(bulk);
  const importBulk = async () => {
    if (!parsed.length) { toast.error("ما لقيت ولا سطر فيه سؤال ورد"); return; }
    setBulkBusy(true);
    let done = 0;
    for (let i = 0; i < parsed.length; i += 200) {
      const chunk = parsed.slice(i, i + 200).map((p) => ({ ...p, category: guessCategory(p.trigger_text), store_id: storeId ?? null }));
      const { error } = await supabase.from("training_rules").insert(chunk);
      if (error) { toast.error(`توقف بعد ${done} قاعدة: ${error.message}`); setBulkBusy(false); reload(); return; }
      done += chunk.length;
    }
    setBulkBusy(false); setBulk("");
    toast.success(`🧠 حفظت ${done} قاعدة دفعة وحدة`);
    reload();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Card title="📋 لصق جماعي — حتى 1000 سطر">
          <p className="mb-2 text-xs text-muted-foreground">كل سطر: كلام الزبون | ردك — أو استخدم = أو : أو Tab. أو اكتب السؤال في سطر والرد في السطر اللي بعده.</p>
          <Textarea value={bulk} onChange={(e) => setBulk(e.target.value)} rows={6} dir="rtl"
            placeholder={"بكم؟ | السعر 100 ريال ومعه هدية 🎁\nغالي = عندنا تقسيط بدون فوائد\nفيه توصيل؟ : نعم لكل مدن المملكة"} />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{parsed.length ? `✅ ${parsed.length} قاعدة جاهزة` : "الصق هنا…"}</span>
            <Button onClick={importBulk} disabled={bulkBusy || !parsed.length}>{bulkBusy ? "يحفظ…" : `💾 احفظ الكل`}</Button>
          </div>
          {parsed.length > 0 && (
            <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs">
              {parsed.slice(0, 5).map((p, i) => <li key={i} className="truncate rounded bg-secondary px-2 py-1"><b>{p.trigger_text}</b> ← {p.response_text}</li>)}
              {parsed.length > 5 && <li className="text-muted-foreground">+ {parsed.length - 5} ثانية</li>}
            </ul>
          )}
        </Card>
        <Card title="✍️ علّم الموظفة قاعدة جديدة">
          <label className="mb-1 block text-sm font-medium">إذا قال الزبون:</label>
          <Input value={trigger} onChange={(e) => setTrigger(e.target.value)} maxLength={500} placeholder="مثال: غالي، بكم؟، ما عندي فلوس، اشوف بعدين" />
          <label className="mb-1 mt-4 block text-sm font-medium">ردّي عليه:</label>
          <Textarea value={response} onChange={(e) => setResponse(e.target.value)} maxLength={2000} rows={3} placeholder="مثال: السعر 100 ريال ومعه هدية مجانية، وعندنا تقسيط بدون فوائد 🌟" />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving} className="flex-1">{editing ? "حدّث القاعدة" : "💾 احفظ القاعدة"}</Button>
            {editing && <Button variant="outline" onClick={() => { setEditing(null); setTrigger(""); setResponse(""); }}>إلغاء</Button>}
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>📊 استيراد من Excel</Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => e.target.files?.[0] && importExcel(e.target.files[0])} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">ملف Excel: عمودين — سؤال الزبون | ردك</p>
        </Card>

        <Card title="⏱️ مدة التدريب">
          <div className="flex items-end justify-between">
            <span className="font-display text-3xl text-primary">{fmt(seconds)}</span>
            <span className="text-sm text-muted-foreground">{rules.length} / {goal} قاعدة</span>
          </div>
          <Progress value={progress} className="mt-3" />
          <p className="mt-2 text-xs text-muted-foreground">{progress < 30 ? "بداية حلوة! كمّل علّمها" : progress < 100 ? "موظفتك صارت تفهم أكثر 💪" : "موظفتك جاهزة تماماً 👑"}</p>
        </Card>

        <Card title="📦 معلومات المنتج (للوضع الذكي والاقتراحات)">
          <Textarea value={product} onChange={(e) => setProduct(e.target.value.slice(0, 2000))} rows={3} placeholder="اسم المنتج، السعر، العروض، التوصيل، الضمان…" />
        </Card>

        <TestBox rules={rules} mode={mode} product={product} />
      </div>

      <Card title={`📚 القواعد المحفوظة (${rules.length})`}>
        {!rules.length && <p className="text-sm text-muted-foreground">ما علمتها شي للحين. ابدأ بأول قاعدة!</p>}
        <ul className="max-h-[70vh] space-y-3 overflow-auto pl-1">
          {rules.map((r) => (
            <li key={r.id} className="rounded-xl border bg-background p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm"><span className="text-muted-foreground">الزبون: </span><b>{r.trigger_text}</b></p>
                  <p className="mt-1 text-sm"><span className="text-muted-foreground">الموظفة: </span>{r.response_text}</p>
                </div>
                <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs">{r.category}</span>
              </div>
              <div className="mt-2 flex gap-2 text-xs">
                <button className="text-primary hover:underline" onClick={() => { setEditing(r.id); setTrigger(r.trigger_text); setResponse(r.response_text); window.scrollTo({ top: 0, behavior: "smooth" }); }}>تعديل</button>
                <button className="text-destructive hover:underline" onClick={() => del(r.id)}>حذف</button>
                <span className="mr-auto text-muted-foreground">استُخدمت {r.use_count} مرة</span>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function fmt(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return `${h ? h + ":" : ""}${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}`;
}

function TestBox({ rules, mode, product }: { rules: Rule[]; mode: Mode; product: string }) {
  const [text, setText] = useState("");
  const [out, setOut] = useState<{ answer: string; source: string; trigger?: string | undefined } | null>(null);
  const [loading, setLoading] = useState(false);
  const engine = useReplyEngine(rules, mode, product);
  const run = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const r = await engine(text);
      setOut({ answer: r.answer, source: r.source, trigger: r.rule?.trigger_text });
    } catch (e) { toast.error((e as Error).message); }
    setLoading(false);
  };
  return (
    <Card title="🧪 اختبر الموظفة">
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="اكتب كلام زبون وهمي… مثلاً: سعركم غالي مرة" />
        <Button onClick={run} disabled={loading}>{loading ? "…" : "جرّب"}</Button>
      </div>
      {out && (
        <div className="mt-4 rounded-xl bg-secondary p-4">
          {out.answer ? <p className="font-medium">👩‍💼 {out.answer}</p> : <p className="text-muted-foreground">ما تعرف ترد على هذا للحين — علّمها قاعدة جديدة!</p>}
          <p className="mt-2 text-xs text-muted-foreground">
            {out.source === "rule" ? `من تعليمك: "${out.trigger}"` : out.source === "ai" ? "رد ذكي (ما فيه قاعدة مطابقة)" : ""}
          </p>
        </div>
      )}
    </Card>
  );
}

/* ---------------- Live call ---------------- */
type SR = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; onresult: ((e: any) => void) | null; onend: (() => void) | null };

function LiveCall({ rules, reload, mode, product, storeId }: { rules: Rule[]; reload: () => Promise<void>; mode: Mode; product: string; storeId?: string | undefined }) {
  const [live, setLive] = useState(false);
  const [interim, setInterim] = useState("");
  const [customer, setCustomer] = useState("");
  const [typed, setTyped] = useState("");
  const [answer, setAnswer] = useState("");
  const [alts, setAlts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [aiSugs, setAiSugs] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [log, setLog] = useState<{ who: "c" | "a"; t: string }[]>([]);
  const recRef = useRef<SR | null>(null);
  const liveRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const engine = useReplyEngine(rules, mode, product);
  const tts = useSpeaker();
  const [emotion, setEmotion] = useState("");
  const [voiceName, setVoiceName] = useState("");
  useEffect(() => { const v = loadVoice(); setEmotion(v.emotion); setVoiceName(v.provider === "fish" && v.voiceId ? v.voiceTitle : "الصوت المدمج"); }, []);
  const suggest = useServerFn(suggestReplies);

  const handleCustomer = async (text: string) => {
    setCustomer(text); setAiSugs([]); setBusy(true);
    setLog((l) => [...l, { who: "c", t: text }]);
    try {
      const r = await engine(text);
      setAnswer(r.answer);
      const others = r.matches.filter((m) => m.rule.response_text !== r.answer).map((m) => m.rule.response_text);
      const pool = [...others, ...rules.filter((x) => x.category === (r.rule?.category ?? "")).map((x) => x.response_text)];
      setAlts([...new Set(pool)].filter((x) => x !== r.answer).slice(0, 3));
      recordUse(text, r.rule).then(reload);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };

  const start = () => {
    const W = window as any;
    const C = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!C) { toast.error("المتصفح ما يدعم سماع الصوت. استخدم Chrome أو اكتب كلام الزبون."); return; }
    const rec: SR = new C();
    rec.lang = "ar-SA"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (e) => {
      let fin = "", tmp = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += t; else tmp += t;
      }
      setInterim(tmp);
      if (fin.trim()) handleCustomer(fin.trim());
    };
    rec.onend = () => { if (liveRef.current) try { rec.start(); } catch { /* ignore */ } };
    recRef.current = rec; liveRef.current = true;
    rec.start(); setLive(true);
  };
  const stop = () => { liveRef.current = false; recRef.current?.stop(); setLive(false); setInterim(""); audioRef.current?.pause(); };
  useEffect(() => () => { liveRef.current = false; recRef.current?.stop(); }, []);

  const say = async (text: string) => {
    if (!text.trim()) return;
    setSpeaking(true);
    setLog((l) => [...l, { who: "a", t: text }]);
    try {
      const audio = await tts(text, { emotion });
      audioRef.current?.pause();
      const a = new Audio(audio); audioRef.current = a;
      a.onended = () => setSpeaking(false);
      await a.play();
    } catch (e) { toast.error((e as Error).message); setSpeaking(false); }
  };

  const sendCustom = async () => {
    const t = custom.trim();
    if (!t) return;
    say(t);
    if (customer) {
      const { error } = await addRule(customer, t, storeId);
      if (!error) { toast.success("قلتها وحفظتها كقاعدة جديدة 🧠"); reload(); }
    }
    setCustom("");
  };

  const askAi = async () => {
    if (!customer) { toast.error("لازم الزبون يقول شي أول"); return; }
    setBusy(true);
    try {
      const { replies } = await suggest({ data: { customer, product, rules: rulesPayload(rules) } });
      setAiSugs(replies);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={`h-3 w-3 rounded-full ${live ? "animate-pulse bg-destructive" : "bg-muted-foreground/40"}`} />
              <span className="font-medium">{live ? "المكالمة شغالة — نسمع الزبون…" : "المكالمة متوقفة"}</span>
              {speaking && <span className="text-sm text-primary">🔊 الموظفة تتكلم…</span>}
            </div>
            <select value={emotion} onChange={(e) => setEmotion(e.target.value)} className="rounded-md border bg-background px-2 py-2 text-sm" aria-label="المشاعر">
              {EMOTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <span className="text-xs text-muted-foreground">🎙️ {voiceName}</span>
            {live ? <Button variant="destructive" onClick={stop}>إنهاء المكالمة</Button> : <Button onClick={start}>📞 ابدأ المكالمة</Button>}
          </div>
          <div className="mt-4 flex gap-2">
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="أو اكتب كلام الزبون هنا…"
              onKeyDown={(e) => { if (e.key === "Enter" && typed.trim()) { handleCustomer(typed.trim()); setTyped(""); } }} />
            <Button variant="secondary" onClick={() => { if (typed.trim()) { handleCustomer(typed.trim()); setTyped(""); } }}>أرسل</Button>
          </div>
        </Card>

        <Card title="🗣️ الزبون يقول">
          <p className="min-h-8 text-lg">{customer || <span className="text-muted-foreground">بانتظار كلام الزبون…</span>}</p>
          {interim && <p className="text-sm text-muted-foreground">… {interim}</p>}
        </Card>

        <section className="rounded-2xl bg-royal p-6 text-primary-foreground shadow-soft">
          <p className="text-sm opacity-80">👩‍💼 الموظفة بتقول:</p>
          <p className="font-display mt-2 min-h-12 text-2xl leading-relaxed">
            {busy ? "تفكر…" : answer || (customer ? "ما عندها رد من تعليمك — اختر اقتراح أو اكتب ردك" : "—")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button className="bg-gold text-accent-foreground hover:opacity-90" disabled={!answer || speaking} onClick={() => say(answer)}>✅ موافق</Button>
            {alts.map((s, i) => (
              <Button key={i} variant="secondary" title={s} onClick={() => say(s)} disabled={speaking}>اقتراح {i + 1}</Button>
            ))}
            <Button variant="outline" className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10" onClick={askAi} disabled={busy}>💡 اقترح لي رد</Button>
          </div>
          {alts.length > 0 && (
            <ol className="mt-3 space-y-1 text-sm opacity-85">{alts.map((s, i) => <li key={i}>اقتراح {i + 1}: {s}</li>)}</ol>
          )}
        </section>

        {aiSugs.length > 0 && (
          <Card title="💡 ردود مقترحة من الذكاء">
            <div className="space-y-2">
              {aiSugs.map((s, i) => (
                <button key={i} onClick={() => { setAnswer(s); say(s); }} className="block w-full rounded-xl border bg-background p-3 text-right transition hover:border-primary">{s}</button>
              ))}
            </div>
          </Card>
        )}

        <Card title="✏️ اكتب رد مختلف">
          <div className="flex gap-2">
            <Input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendCustom()} placeholder="الموظفة بتقوله فوراً وتحفظه كقاعدة" />
            <Button onClick={sendCustom}>قوليها</Button>
          </div>
        </Card>
      </div>

      <Card title="📜 سجل المكالمة">
        <ul className="max-h-[70vh] space-y-2 overflow-auto">
          {log.map((m, i) => (
            <li key={i} className={`rounded-xl p-2 text-sm ${m.who === "c" ? "bg-muted" : "bg-secondary"}`}>
              <b>{m.who === "c" ? "الزبون" : "الموظفة"}:</b> {m.t}
            </li>
          ))}
          {!log.length && <p className="text-sm text-muted-foreground">ما فيه كلام للحين.</p>}
        </ul>
      </Card>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */
function Dashboard({ rules }: { rules: Rule[] }) {
  const [msgs, setMsgs] = useState<{ text: string; matched_rule_id: string | null }[]>([]);
  const [report, setReport] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const genReport = useServerFn(weeklyReport);
  useEffect(() => {
    supabase.from("customer_messages").select("text, matched_rule_id").order("created_at", { ascending: false }).limit(1000)
      .then(({ data }) => setMsgs(data ?? []));
  }, []);
  const top = useMemo(() => [...rules].sort((a, b) => b.use_count - a.use_count).slice(0, 8), [rules]);
  const cats = useMemo(() => {
    const m = new Map<string, number>();
    msgs.forEach((x) => { const c = guessCategory(x.text); m.set(c, (m.get(c) ?? 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [msgs]);
  const unmatched = msgs.filter((m) => !m.matched_rule_id).slice(0, 8);
  const maxUse = Math.max(1, ...top.map((t) => t.use_count));
  const maxCat = Math.max(1, ...cats.map((c) => c[1]));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {[["قواعد علمتها", rules.length], ["كلام زبائن مسموع", msgs.length], ["ما عرفت ترد عليه", msgs.filter((m) => !m.matched_rule_id).length]].map(([l, v]) => (
          <Card key={l as string}><p className="text-sm text-muted-foreground">{l}</p><p className="font-display text-4xl text-primary">{v}</p></Card>
        ))}
      </div>
      <Card title="📊 التقرير الذكي الأسبوعي">
        <p className="mb-3 text-sm text-muted-foreground">الموظفة تحلل كل كلام الزبائن وتعطيك خلاصة: وش يسألون، وش يعترضون عليه، ووش تنقصها من تدريب.</p>
        <Button
          disabled={reportLoading}
          onClick={async () => {
            setReportLoading(true);
            try {
              const { report } = await genReport({ data: {
                rulesCount: rules.length,
                messages: msgs.map((m) => m.text),
                topRules: top.map((r) => `${r.trigger_text} ← ${r.response_text} (${r.use_count})`),
              } });
              setReport(report);
            } catch { toast.error("تعذر توليد التقرير"); }
            setReportLoading(false);
          }}
        >{reportLoading ? "تحلل البيانات…" : "📊 ولّد التقرير"}</Button>
        {report && <div className="mt-4 whitespace-pre-wrap rounded-xl bg-secondary/60 p-4 text-sm leading-7">{report}</div>}
      </Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="🏆 أكثر القواعد استخداماً">
          {top.map((r) => (
            <div key={r.id} className="mb-3">
              <div className="flex justify-between text-sm"><span className="truncate">{r.trigger_text}</span><span>{r.use_count}</span></div>
              <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-gold" style={{ width: `${(r.use_count / maxUse) * 100}%` }} /></div>
            </div>
          ))}
          {!top.length && <p className="text-sm text-muted-foreground">لا توجد بيانات</p>}
        </Card>
        <Card title="⚠️ أكثر اعتراضات الزبائن">
          {cats.map(([c, n]) => (
            <div key={c} className="mb-3">
              <div className="flex justify-between text-sm"><span>{c}</span><span>{n}</span></div>
              <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${(n / maxCat) * 100}%` }} /></div>
            </div>
          ))}
          {!cats.length && <p className="text-sm text-muted-foreground">ابدأ مكالمة عشان تظهر البيانات</p>}
        </Card>
        <Card title="🧩 كلام ما علمتها عليه">
          <ul className="space-y-2 text-sm">{unmatched.map((m, i) => <li key={i} className="rounded-lg bg-muted p-2">{m.text}</li>)}</ul>
          {!unmatched.length && <p className="text-sm text-muted-foreground">ممتاز! كل شي معروف</p>}
        </Card>
      </div>
    </div>
  );
}
