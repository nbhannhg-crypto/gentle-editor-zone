import { SiteGuideButton } from "@/components/SiteGuide";
import { VoiceModelPicker } from "@/components/VoiceModelPicker";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BalanceBadge } from "@/components/BalanceBadge";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { addRule, backupRules, cacheRules, cachedRules, fetchRules, findMatches, guessCategory, normalize, recordUse, type Rule } from "@/lib/rules";
import { smartReply, suggestReplies, weeklyReport, analyzeDeal } from "@/lib/ai.functions";
import { waCtrlSend } from "@/lib/wa-ctrl.functions";
import { waList } from "@/lib/studio.functions";
import { getOrCreateMyStore, isAdmin, type Store } from "@/lib/stores";
import { VoiceStudio, useSpeaker, EMOTIONS, loadVoice } from "@/components/VoiceStudio";
import { LiveCallPlus, loadTuning, findTriggerClip, findLinkedClip, triggerVocab } from "@/components/LiveCallPlus";
import { LiveHybrid } from "@/components/LiveHybrid";
import { StaffSwitcher, useStaff, CallIdentity } from "@/components/CallIdentity";
import { searchCallSources } from "@/lib/call-brains";
import { LiveCockpit, loadCockpit, DEFAULT_COCKPIT, COCKPIT_KEY, EXTRA_HINT, applyFixes, hitBanned, isBlocked, type Cockpit } from "@/components/LiveCockpit";
import { applyCable } from "@/lib/cable-audio";
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
import { DesignStudio } from "@/components/DesignStudio";
import { Complaints } from "@/components/Complaints";
import { WaInbox } from "@/components/WaInbox";
import { VoiceAssistant } from "@/components/VoiceAssistant";
import { startVadRecorder, blobToBase64, type VadHandle } from "@/lib/vad-recorder";
import { transcribeLive } from "@/lib/listen.functions";
import { CallTranscript } from "@/components/CallTranscript";
import { staffAnswer } from "@/lib/staff";

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
type Tab = "home" | "train" | "call" | "kcall" | "voice" | "channels" | "customers" | "products" | "wallet" | "dash" | "bots" | "profile" | "deals" | "campaigns" | "appointments" | "brains" | "magic" | "mother" | "library" | "inbox" | "complaints" | "design";

const NAV: [Tab, string][] = [["home", "🏠 الرئيسية"], ["mother", "👑 العقل المدبر"], ["brains", "🏭 مصنع العقول"], ["magic", "✨ بنك الإلهام"], ["bots", "🤖 كتيبة البوتات"], ["profile", "🏪 هوية المتجر"], ["train", "🎯 علّم الموظفة"], ["call", "📞 المكالمة المباشرة"], ["kcall", "📱 مكالمة المملكة"], ["voice", "🎙️ النبرة والصوتيات"], ["channels", "📡 رادار القنوات"], ["inbox", "💬 صندوق المحادثات"], ["library", "📚 خزينة الوسائط"], ["design", "🎨 استوديو التصاميم"], ["complaints", "📮 العناية بالعملاء"], ["customers", "👥 كبار العملاء"], ["campaigns", "📣 صانع الحملات"], ["deals", "👁️ رادار الصفقات"], ["appointments", "📅 المواعيد"], ["products", "🛍️ كتالوج المنتجات"], ["wallet", "💰 المحفظة"], ["dash", "📊 مؤشرات الأداء"]];

const HOME: [string, [string, string, string, string][]][] = [
  ["🎙️ المكالمات والأصوات", [["kcall", "📱", "مكالمة المملكة", "سوالف حية وسلك الجوال"], ["call", "📞", "المكالمة المباشرة", "لوحة تحكم المكالمات"], ["studio", "🎤", "استوديو الأصوات", "استنساخ وتوليد النبرة"], ["voice", "🎙️", "النبرة والصوتيات", "موازين الصوت والمشاعر"]]],
  ["💬 الواتساب والمحادثات", [["channels", "📲", "لوحة الواتسابات", "ربط الأرقام والتحكم بكل رقم"], ["inbox", "💬", "صندوق المحادثات", "رسائل الزبائن الحية"], ["deals", "👁️", "رادار الصفقات", "متابعة المهتمين"], ["complaints", "📮", "العناية بالعملاء", "الشكاوى والردود"]]],
  ["🧠 العقول والتعليم", [["train", "🎯", "علّم الموظفة", "سؤال وجواب تحفظه للأبد"], ["brains", "🏭", "مصنع العقول", "أنشئ عقل بكلامك"], ["mother", "👑", "العقل المدبر", "إشراف وتحكم كامل"], ["magic", "✨", "بنك الإلهام", "ردود وسوالف جاهزة"], ["bots", "🤖", "كتيبة البوتات", "رفيقات السوالف"], ["library", "📚", "خزينة الوسائط", "صور وفويسات ومقاطع"]]],
  ["🎨 التصميم والمتجر", [["design", "🎨", "استوديو التصاميم", "صور وتصاميم بناتية"], ["campaigns", "📣", "صانع الحملات", "رسائل جماعية"], ["products", "🛍️", "كتالوج المنتجات", "المنتجات والأسعار"], ["customers", "👥", "كبار العملاء", "قائمة الزبائن"], ["appointments", "📅", "المواعيد", "الحجوزات"], ["wallet", "💰", "المحفظة", "الرصيد والشحن"], ["profile", "🏪", "هوية المتجر", "الاسم والنبذة"], ["dash", "📊", "مؤشرات الأداء", "الأرقام والتقارير"]]],
];

function Home({ go }: { go: (k: string) => void }) {
  return (
    <div className="space-y-5">
      <SiteGuideButton />
      {HOME.map(([g, items]) => (
        <section key={g}>
          <h2 className="mb-2 font-display text-lg text-primary">{g}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {items.map(([k, ic, n, d]) => (
              <button key={k} onClick={() => go(k)}
                className="flex min-h-[120px] flex-col items-center justify-center gap-1 rounded-2xl border bg-card p-3 text-center shadow-soft transition hover:border-primary active:scale-95">
                <span className="text-4xl">{ic}</span>
                <b className="text-sm">{n}</b>
                <span className="text-[11px] leading-tight text-muted-foreground">{d}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [menu, setMenu] = useState(false);
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
            <button onClick={() => setMenu(!menu)} className="shrink-0 rounded-t-xl bg-gold px-3 py-1.5 text-xs font-semibold text-accent-foreground sm:text-sm">🎛️ كل الأقسام</button>
            {NAV.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`shrink-0 rounded-t-xl px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm font-medium transition ${tab === k ? "bg-background text-foreground" : k === "mother" ? "animate-pulse bg-gold text-accent-foreground" : "text-primary-foreground/80 hover:bg-primary-foreground/10"}`}>{l}</button>
            ))}
          </nav>
          {menu && (
            <div className="mt-2 grid grid-cols-3 gap-1.5 rounded-2xl bg-background p-2 text-foreground shadow-soft sm:grid-cols-6">
              {NAV.map(([k, l]) => (
                <button key={k} onClick={() => { setTab(k); setMenu(false); }}
                  className={`rounded-xl border p-2 text-[11px] leading-tight transition active:scale-95 ${tab === k ? "border-primary bg-secondary" : "bg-card"}`}>{l}</button>
              ))}
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
        <p className="mb-4 rounded-xl bg-secondary px-3 py-2 text-xs sm:px-4 sm:text-sm text-secondary-foreground">
          {mode === "learn" ? "📘 الموظفة ترد فقط من اللي علمتها إياه (100% من قواعدك)." : "✨ الموظفة ترد من تعليمك، وتستخدم ذكاءها للأسئلة الجديدة."}
        </p>
        {tab !== "home" && <button onClick={() => setTab("home")} className="mb-3 rounded-full border bg-card px-4 py-1.5 text-sm font-semibold shadow-soft">🏠 الرئيسية</button>}
        {tab === "home" && <Home go={(k) => { if (k === "studio") navigate({ to: "/studio" }); else { setTab(k as Tab); if (k === "train") reload(store?.id); } }} />}
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
        {tab === "design" && <DesignStudio storeId={store?.id} />}
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
const DEFAULT_BOARD = [
  "👋 هلا والله وحياك", "🌸 نورتنا يا غالي", "☕ سمّ آمرني",
  "💰 هذا سعره شامل التوصيل والضمان", "✨ الجودة أصلية ومضمونة 100%", "🎁 عندي لك خصم خاص الحين",
  "🚚 التوصيل خلال 24-48 ساعة لباب بيتك", "📦 الدفع عند الاستلام متاح",
  "🎉 تم اعتماد طلبك ويوصلك كود التتبع", "🤝 تشرفنا بخدمتك والله يبارك لك",
  "🌸 هلا بروح قلبي", "💕 تدلل يا بعد راسي", "✨ لبى هالطلة", "☕ وحشتني سوالفك",
];

/* ---------------- Reply engine ---------------- */
export function useReplyEngine(rules: Rule[], mode: Mode, product: string) {
  const smart = useServerFn(smartReply);
  return async (text: string) => {
    const matches = findMatches(text, rules);
    const best = matches[0];
    if (best && (best.score >= 0.35 || mode === "learn")) {
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
  return out;
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
  const [listQ, setListQ] = useState("");
  const shown = (() => {
    const q = normalize(listQ);
    if (!q) return rules;
    return rules.filter((r) => normalize(r.trigger_text).includes(q) || normalize(r.response_text).includes(q));
  })();

  const save = async () => {
    if (!trigger.trim() || !response.trim()) { toast.error("اكتب كلام الزبون وردك"); return; }
    setSaving(true);
    backupRules(rules);
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
    backupRules(rules);
    const { error } = await supabase.from("training_rules").insert(items.map((i) => ({ ...i, store_id: storeId ?? null })));
    if (error) { toast.error("فشل الاستيراد"); return; }
    toast.success(`تم استيراد ${items.length} قاعدة`);
    reload();
  };

  const exportRules = () => {
    if (!rules.length) { toast.error("ما فيه قواعد للتصدير"); return; }
    const ws = XLSX.utils.aoa_to_sheet([["سؤال الزبون", "ردك", "التصنيف", "مرات الاستخدام"], ...rules.map((r) => [r.trigger_text, r.response_text, r.category, r.use_count])]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "القواعد");
    XLSX.writeFile(wb, `rules-${rules.length}.xlsx`);
    toast.success(`تم تصدير ${rules.length} قاعدة`);
  };

  const removeDuplicates = async () => {
    const seen = new Set<string>();
    const dupIds: string[] = [];
    for (const r of rules) {
      const k = normalize(r.trigger_text) + "||" + normalize(r.response_text);
      if (seen.has(k)) dupIds.push(r.id); else seen.add(k);
    }
    if (!dupIds.length) { toast.success("ما فيه قواعد مكررة"); return; }
    if (!confirm(`تم العثور على ${dupIds.length} قاعدة مكررة. تحذفها؟ (نسخة احتياطية تنحفظ قبل الحذف)`)) return;
    backupRules(rules);
    for (let i = 0; i < dupIds.length; i += 100) {
      const { error } = await supabase.from("training_rules").delete().in("id", dupIds.slice(i, i + 100));
      if (error) { toast.error("توقف الحذف: " + error.message); reload(); return; }
    }
    toast.success(`تم حذف ${dupIds.length} قاعدة مكررة`);
    reload();
  };

  const [bulk, setBulk] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const parsed = parseBulk(bulk);
  const importBulk = async () => {
    if (!parsed.length) { toast.error("ما لقيت ولا سطر فيه سؤال ورد"); return; }
    setBulkBusy(true);
    backupRules(rules);
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
        <Card title="📋 لصق جماعي — بدون حد">
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

        <TestBox rules={rules} mode={mode} product={product} reload={reload} />
      </div>

      <Card title={`📚 القواعد المحفوظة (${rules.length})`}>
        <div className="mb-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={exportRules}>تصدير Excel</Button>
          <Button size="sm" variant="outline" onClick={removeDuplicates}>حذف المكرر</Button>
        </div>
        <Input value={listQ} onChange={(e) => setListQ(e.target.value)} placeholder="🔍 ابحث في القواعد المحفوظة بكلمة…" className="mb-3" />
        {listQ.trim() && <p className="mb-2 text-xs text-muted-foreground">النتائج: {shown.length}</p>}
        {!rules.length && <p className="text-sm text-muted-foreground">ما علمتها شي للحين. ابدأ بأول قاعدة!</p>}
        <ul className="max-h-[70vh] space-y-3 overflow-auto pl-1">
          {shown.slice(0, 500).map((r) => (
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

function TestBox({ rules, mode, product, reload }: { rules: Rule[]; mode: Mode; product: string; reload?: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [out, setOut] = useState<{ answer: string; source: string; trigger?: string | undefined; rule?: Rule | undefined; score?: number | undefined } | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Rule | null>(null);
  const [et, setEt] = useState(""); const [er, setEr] = useState("");
  const engine = useReplyEngine(rules, mode, product);
  const run = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const r = await engine(text);
      setOut({ answer: r.answer, source: r.source, trigger: r.rule?.trigger_text, rule: r.rule, score: r.matches[0]?.score });
    } catch (e) { toast.error((e as Error).message); }
    setLoading(false);
  };
  const hits = useMemo(() => {
    const n = normalize(q);
    if (n.length < 2) return [];
    return rules.filter((r) => normalize(r.trigger_text).includes(n) || normalize(r.response_text).includes(n)).slice(0, 20);
  }, [q, rules]);
  const openEdit = (r: Rule) => { setEdit(r); setEt(r.trigger_text); setEr(r.response_text); };
  const saveEdit = async () => {
    if (!edit || !et.trim() || !er.trim()) return;
    backupRules(rules);
    const { error } = await supabase.from("training_rules").update({ trigger_text: et.trim(), response_text: er.trim(), category: guessCategory(et) }).eq("id", edit.id);
    if (error) { toast.error("ما قدرنا نحفظ"); return; }
    toast.success("تم تعديل القاعدة ✅");
    if (out?.rule?.id === edit.id) setOut({ ...out, answer: er.trim(), trigger: et.trim(), rule: { ...edit, trigger_text: et.trim(), response_text: er.trim() } });
    setEdit(null); await reload?.();
  };
  const delRule = async (r: Rule) => {
    if (!confirm(`تحذف القاعدة "${r.trigger_text}"؟ (تنحفظ نسخة احتياطية)`)) return;
    backupRules(rules);
    const { error } = await supabase.from("training_rules").delete().eq("id", r.id);
    if (error) { toast.error("تعذر الحذف"); return; }
    toast.success("تم حذف القاعدة 🗑️");
    if (out?.rule?.id === r.id) setOut(null);
    await reload?.();
  };
  return (
    <Card title="🧪 اختبر الموظفة">
      <Input className="mb-2" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 بحث سريع في القواعد بكلمة…" />
      {hits.length > 0 && (
        <ul className="mb-3 max-h-56 space-y-1 overflow-y-auto">
          {hits.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-lg border p-2 text-xs">
              <div className="min-w-0 flex-1"><b className="block truncate">{r.trigger_text}</b><span className="block truncate text-muted-foreground">{r.response_text}</span></div>
              <button aria-label="تعديل" onClick={() => openEdit(r)}>✏️</button>
              <button aria-label="حذف" onClick={() => delRule(r)}>🗑️</button>
            </li>
          ))}
        </ul>
      )}
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
          {out.rule && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border bg-background px-2 py-1 text-xs">
              <span>القاعدة: <b>{out.rule.trigger_text}</b></span>
              {out.score !== undefined && <span className="rounded-full bg-muted px-2">تطابق {Math.round(out.score * 100)}%</span>}
              <button className="text-primary" onClick={() => openEdit(out.rule!)}>تعديل ✏️</button>
              <button className="text-destructive" onClick={() => delRule(out.rule!)}>حذف 🗑️</button>
            </div>
          )}
        </div>
      )}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>✏️ تعديل القاعدة</DialogTitle></DialogHeader>
          <label className="text-sm">إذا قال الزبون:</label>
          <Input value={et} maxLength={500} onChange={(e) => setEt(e.target.value)} />
          <label className="text-sm">ردّي عليه:</label>
          <Textarea rows={4} value={er} maxLength={2000} onChange={(e) => setEr(e.target.value)} />
          <Button onClick={saveEdit}>💾 احفظ</Button>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------------- Live call ---------------- */
type SR = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; onresult: ((e: any) => void) | null; onend: (() => void) | null };

/* فلتر هلوسة التفريغ عند السكوت/الوشيش */
const HALLU = ["ان شاء الله يعني", "ان شاء الله", "شكرا لكم", "شكرا", "يعني", "شكرا للمشاهده", "اشتركوا في القناه", "ترجمه"];
function isHallucination(text: string, info?: { durationMs: number; peak: number }): boolean {
  const t = text.replace(/[\u064B-\u0652\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  if (!t) return true;
  const weak = !info || info.durationMs < 1800 || info.peak < 0.06;
  return weak && HALLU.includes(t);
}
const ASK_AGAIN = [
  "ما سمعتك يا قلبي، عيد لي فديتك",
  "الصوت يقطع عندك يا روحي، وش قلت؟",
  "ما فهمت عليك يا بعد قلبي، عيدها لي",
  "يا عمري الصوت مو واضح، عيد كلامك",
];

function LiveCall({ rules, reload, mode, product, storeId }: { rules: Rule[]; reload: () => Promise<void>; mode: Mode; product: string; storeId?: string | undefined }) {
  const staff = useStaff(storeId, "live");
  const staffRef = useRef("");
  staffRef.current = staff.activeText;
  const [live, setLive] = useState(false);
  const [interim, setInterim] = useState("");
  const [customer, setCustomer] = useState("");
  const [typed, setTyped] = useState("");
  const [answer, setAnswer] = useState("");
  const [alts, setAlts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [micLvl, setMicLvl] = useState(0);
  const lvlAt = useRef(0);
  const [aiSugs, setAiSugs] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [log, setLog] = useState<{ who: "c" | "a"; t: string }[]>([]);
  const recRef = useRef<SR | null>(null);
  const liveRef = useRef(false);
  const vadRef = useRef<VadHandle | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const engine = useReplyEngine(rules, mode, product);
  const tts = useSpeaker();
  const [emotion, setEmotion] = useState("");
  const [voiceName, setVoiceName] = useState("");
  useEffect(() => { const v = loadVoice(); setEmotion(v.emotion); setVoiceName(v.provider === "fish" && v.voiceId ? v.voiceTitle : "الصوت المدمج"); }, []);
  const suggest = useServerFn(suggestReplies);
  const analyze = useServerFn(analyzeDeal);
  const sendWa = useServerFn(waCtrlSend);
  const listWa = useServerFn(waList);
  // ---- إضافات اللوحة الحية ----
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [loud, setLoud] = useState(true);
  const [autopilot, setAutopilot] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [avatar, setAvatar] = useState("");
  const [deal, setDeal] = useState<{ verdict: string; score: number; summary: string; tips: string[] } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [accounts, setAccounts] = useState<{ name: string; label?: string; status: string; number?: string }[]>([]);
  const [waFrom, setWaFrom] = useState("");
  const [waTo, setWaTo] = useState("");
  const [waText, setWaText] = useState("");
  const [board, setBoard] = useState<string[]>([]);
  const [newClip, setNewClip] = useState("");
  const [custList, setCustList] = useState<{ name: string; phone: string }[]>([]);
  const [cfg, setCfg] = useState<Cockpit>(DEFAULT_COCKPIT);
  const cfgRef = useRef<Cockpit>(DEFAULT_COCKPIT);
  const [accErr, setAccErr] = useState("");
  const [teachQ, setTeachQ] = useState("");
  const [teachA, setTeachA] = useState("");
  const smart = useServerFn(smartReply);
  const saveCfg = (c: Cockpit) => {
    setCfg(c); cfgRef.current = c; localStorage.setItem(COCKPIT_KEY, JSON.stringify(c));
    setAutopilot(c.fast); localStorage.setItem("live_autopilot", c.fast ? "1" : "0");
  };
  const loadAccounts = () => {
    setAccErr("");
    listWa().then((r) => setAccounts((r as any[]) ?? [])).catch((e) => setAccErr((e as Error).message || "السيرفر ما رد"));
  };
  const mutedRef = useRef(false);
  const autoRef = useRef(false);
  const cdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  const speakingRef = useRef(false);
  const sttSeq = useRef(0);
  useEffect(() => { speakingRef.current = speaking; }, [speaking]);
  useEffect(() => { autoRef.current = autopilot; }, [autopilot]);
  useEffect(() => {
    setAvatar(localStorage.getItem("live_avatar") ?? "");
    setAutopilot(localStorage.getItem("live_autopilot") === "1");
    setWaFrom(localStorage.getItem("live_wa_from") ?? "");
    try { const b = JSON.parse(localStorage.getItem("live_board") ?? "null"); setBoard(Array.isArray(b) ? b : DEFAULT_BOARD); } catch { setBoard(DEFAULT_BOARD); }
    const ck = loadCockpit(); ck.fast = localStorage.getItem("live_autopilot") === "1" || ck.fast; setCfg(ck); cfgRef.current = ck;
    loadAccounts();
    const t = loadTuning(); if (t.emotion) setEmotion(t.emotion);
    let q = supabase.from("customers").select("*").limit(500);
    if (storeId) q = q.eq("store_id", storeId);
    q.then(({ data }) => setCustList(((data ?? []) as any[]).map((c) => ({ name: c.name ?? c.phone ?? "", phone: String(c.phone ?? "") })).filter((c) => c.phone)));
  }, []);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [live]);
  const saveBoard = (b: string[]) => { setBoard(b); localStorage.setItem("live_board", JSON.stringify(b)); };
  const pickAvatar = (f?: File) => {
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); const s = 300; c.width = s; c.height = s;
      const k = Math.max(s / img.width, s / img.height);
      c.getContext("2d")!.drawImage(img, (s - img.width * k) / 2, (s - img.height * k) / 2, img.width * k, img.height * k);
      const url = c.toDataURL("image/jpeg", 0.85);
      setAvatar(url); localStorage.setItem("live_avatar", url); toast.success("✅ صارت صورة الموظفة");
    };
    img.src = URL.createObjectURL(f);
  };
  const cancelCountdown = () => { if (cdRef.current) clearInterval(cdRef.current); cdRef.current = null; setCountdown(0); };
  const autoSay = (text: string) => {
    if (!text) return;
    if (autoRef.current || cfgRef.current.fast || (cfgRef.current.instant ?? true)) { say(text); return; }
    cancelCountdown();
    let n = 3; setCountdown(n);
    cdRef.current = setInterval(() => {
      n -= 1; setCountdown(n);
      if (n <= 0) { cancelCountdown(); say(text); }
    }, 1000);
  };

  const clipMatch = (text: string) => {
    const q = normalize(text).split(" ").filter((w) => w.length > 2);
    if (!q.length) return "";
    let pool: string[] = [...board];
    try { pool = pool.concat(((JSON.parse(localStorage.getItem("live_clips") ?? "[]") as { text: string }[]) ?? []).map((c) => c.text)); } catch { /* ignore */ }
    let best = "", score = 0;
    for (const s of pool) { const n = normalize(s); const sc = q.filter((w) => n.includes(w)).length / q.length; if (sc > score) { score = sc; best = s; } }
    return score >= 0.5 ? best : "";
  };
  const custSeq = useRef(0);
  const handleCustomer = async (text: string) => {
    const myCust = ++custSeq.current;
    cancelCountdown();
    setCustomer(text); setAiSugs([]); setBusy(true);
    setLog((l) => [...l, { who: "c", t: text }]);
    const trig = findTriggerClip(text);
    if (trig) {
      setAnswer(trig.text); setLog((l) => [...l, { who: "a", t: trig.text }]);
      if (liveRef.current) void playAudio(trig.audio);
      setBusy(false); return;
    }
    const c = cfgRef.current;
    // 🥇 يبدأ من هوية الموظفة المناوبة
    const who = staffAnswer(text, staffRef.current);
    if (who) {
      setAnswer(who);
      if (liveRef.current && myCust === custSeq.current) autoSay(who);
      setBusy(false); return;
    }
    try {
      let ans = "";
      let rule: Rule | undefined;
      const th = c.match ?? 0.6;
      if (c.brains.mine) {
        const r = c.rulesOff ? { answer: "", rule: undefined as Rule | undefined, matches: [] as { rule: Rule; score: number }[] } : await engine(text);
        ans = r.answer; rule = r.rule;
        const top = r.matches[0];
        if (rule && top && (th >= 1 ? normalize(top.rule.trigger_text) !== normalize(text) : top.score < th)) { ans = ""; rule = undefined; }
        const others = r.matches.filter((m) => m.rule.response_text !== r.answer).map((m) => m.rule.response_text);
        const pool = [...others, ...rules.filter((x) => x.category === (r.rule?.category ?? "")).map((x) => x.response_text)];
        setAlts([...new Set(pool)].filter((x) => x !== r.answer).slice(0, 3));
        if (!ans && ((c.secs?.length ?? 0) || (c.kbrains?.length ?? 0))) ans = await searchCallSources(text, c.secs ?? [], c.kbrains ?? [], th);
      } else setAlts([]);
      if (!ans && c.brains.clips) ans = clipMatch(text);
      if (!ans && (c.brains.ai || c.brains.queen)) {
        const ctx = [product, c.persona && `شخصية الموظفة: ${c.persona}`, c.brains.queen && "تكلمي بخبرة عقل الملكة: ذكية وحاسمة في البيع.", ...c.extra.map((k) => EXTRA_HINT[k])].filter(Boolean).join("\n");
        const { reply } = await smart({ data: { customer: text, product: ctx.slice(0, 2000), rules: c.brains.mine ? rulesPayload(rules) : [], mood: "call", identity: staffRef.current } });
        ans = reply;
      }
      setAnswer(ans);
      recordUse(text, rule).then(reload);
      // كلام أحدث وصل وهذا الرد قديم → لا ننطقه (يمنع تصادم ردين)
      if (myCust !== custSeq.current) { setBusy(false); return; }
      if (liveRef.current && ans) autoSay(ans);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };

  const lastHeardRef = useRef<{ t: string; at: number }>({ t: "", at: 0 });
  const askAgainAt = useRef(0);
  const lastSaidRef = useRef("");
  const holdRef = useRef(false);
  const saySeq = useRef(0);
  const saidAtRef = useRef(0);
  const spawnRef = useRef<() => void>(() => {});
  // الفهم السريع: قفل المايك كلياً وقت نطقها، ويرجع بعد نص ثانية من انتهائها
  const micHold = () => {
    if (cfgRef.current.stt !== "chrome" || !liveRef.current) return;
    holdRef.current = true;
    try { (recRef.current as any)?.abort?.(); } catch { /* ignore */ }
  };
  const micRelease = () => {
    saidAtRef.current = Date.now();
    if (!holdRef.current) return;
    setTimeout(() => { holdRef.current = false; if (liveRef.current) spawnRef.current(); }, 500);
  };
  const isEcho = (heard: string) => {
    const h = normalize(heard).split(" ").filter((w) => w.length > 1);
    const s = normalize(lastSaidRef.current);
    if (!h.length || !s) return false;
    return h.filter((w) => s.includes(w)).length / h.length >= 0.6;
  };
  const start = () => {
    const W = window as any;
    const C = W.SpeechRecognition || W.webkitSpeechRecognition;

    let pending = ""; let silence: ReturnType<typeof setTimeout> | null = null;
    const deliver = (raw: string) => {
      const f = raw.trim(); if (!f) return;
      const n = normalize(f);
      // نفس الجملة بالضبط خلال 1.5 ثانية (مسودة ثم نهائية) → مرة وحدة بس
      if (n === lastHeardRef.current.t && Date.now() - lastHeardRef.current.at < 1500) return;
      lastHeardRef.current = { t: n, at: Date.now() };
      handleCustomer(f);
    };
    const flush = () => { if (silence) clearTimeout(silence); silence = null; const t = pending; pending = ""; setInterim(""); deliver(t); };
    const spawn = () => {
      if (!liveRef.current) return;
      if (!C) { toast.error("اسمح بالمايك أو اكتب كلام الزبون"); return; }
      const rec: SR = new C();
      rec.lang = "ar-SA"; rec.continuous = true; rec.interimResults = true;
      rec.onresult = (e) => {
        if (mutedRef.current) return;
        // الفهم السريع: وهي تتكلم ما نسمع (يمنع تكرار صوتها وتقطيعه)
        if (cfgRef.current.stt === "chrome") {
          if (holdRef.current || speakingRef.current || (!!audioRef.current && !audioRef.current.paused)) return;
          const h0 = (Array.from(e.results as any).slice(e.resultIndex).map((r: any) => r[0].transcript).join(" ")).trim();
          if (h0 && Date.now() - saidAtRef.current < 6000 && isEcho(h0)) return;
        }
        let fin = "", tmp = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) fin += t; else tmp += t;
        }
        const heard = (fin || tmp).trim();
        if (!heard) return;
        const playing = !!audioRef.current && !audioRef.current.paused;
        // وهي تتكلم ما نسمع ولا نقطع صوتها (ألغينا كاشف المقاطعة العشوائي)
        if (playing || speakingRef.current) return;
        if (fin.trim()) { pending = ""; if (silence) clearTimeout(silence); silence = null; setInterim(""); deliver(fin); return; }
        // مطابقة لحظية أثناء النطق: كلمة تشغيل لمقطع مسجل → نطلقه فوراً
        if (findTriggerClip(tmp)) { pending = ""; if (silence) clearTimeout(silence); silence = null; setInterim(""); deliver(tmp); return; }
        pending = tmp; setInterim(tmp);
        if (silence) clearTimeout(silence);
        silence = setTimeout(flush, cfgRef.current.reply ?? ((cfgRef.current.instant ?? true) ? 400 : 900));
      };
      (rec as any).onerror = () => { /* لا نوقف المكالمة — onend يعيد التشغيل تلقائياً */ };
      rec.onend = () => { if (holdRef.current) { pending = ""; return; } if (pending.trim()) flush(); if (liveRef.current) setTimeout(spawn, 200); };
      recRef.current = rec;
      spawnRef.current = spawn;
      try { rec.start(); } catch { setTimeout(spawn, 500); }
    };
    liveRef.current = true;
    setLive(true); setSeconds(0); setDeal(null);
    // ⚡ خيار الفهم السريع (مثل مكالمة المملكة): استماع كروم المباشر فقط
    if (cfgRef.current.stt === "chrome" && C) { spawn(); return; }
    // المحرك الأقوى: تسجيل المايك + تفريغ Gemini (يشتغل في كل المتصفحات)
    startVadRecorder({
      silenceMs: cfgRef.current.reply ?? ((cfgRef.current.instant ?? true) ? 400 : 900),
      minRms: () => cfgRef.current.sens ?? 0.012,
      // كتم الاستماع وهي تتكلم: ما يلتقط صوت الموظفة من السماعة
      isPaused: () => mutedRef.current || (!!audioRef.current && !audioRef.current.paused) || speakingRef.current,
      onSpeechStart: () => { sttSeq.current++; setInterim("🎙️ أسمعك…"); },
      onLevel: (rms) => { const n = Date.now(); if (n - lvlAt.current > 120) { lvlAt.current = n; setMicLvl(Math.min(1, rms * 12)); } },
      onPhrase: async (blob, mime, info) => {
        if (!liveRef.current) return;
        setInterim("⏳ أفهم كلامك…");
        const my = ++sttSeq.current;
        try {
          const b64 = await blobToBase64(blob);
          const vocab = [...triggerVocab(100), ...rules.slice(0, 50).map((x) => x.trigger_text.slice(0, 80))].filter(Boolean).slice(0, 150);
          const r = await transcribeLive({ data: { audio: b64, mime, vocab } });
          // طلب قديم والزبون بدأ كلام جديد → نتجاهله (بدون رسالة مفاتيح)
          if (my !== sttSeq.current) { if (r.text.trim()) deliver(r.text); return; }
          setInterim("");
          const heard = r.text.trim();
          // كلام حقيقي (طويل وواضح الطاقة) بس ما انفهم → تطلب منه يعيد بدلع بدل ما تألف
          const realSpeech = !!info && info.durationMs > 700 && info.peak > 0.04;
          if (!heard || isHallucination(heard, info)) {
            if (realSpeech && Date.now() - askAgainAt.current > 6000) {
              askAgainAt.current = Date.now();
              const say = ASK_AGAIN[Math.floor(Math.random() * ASK_AGAIN.length)] ?? "ما سمعتك يا قلبي، عيد لي فديتك";
              setAnswer(say); autoSay(say);
            } else if (!heard && r.busy && Date.now() - askAgainAt.current > 6000) {
              // بدل رسالة "المفاتيح مشغولة" تطلب منه يعيد بدلع
              askAgainAt.current = Date.now();
              const say = ASK_AGAIN[Math.floor(Math.random() * ASK_AGAIN.length)] ?? "ما سمعتك يا قلبي، عيد لي فديتك";
              setAnswer(say); autoSay(say);
            }
            return;
          }
          const playing = !!audioRef.current && !audioRef.current.paused;
          // وهي تتكلم ما نقطع صوتها (منع التقطيع)
          if (playing || speakingRef.current) return;
          deliver(heard);
        } catch { setInterim(""); }
      },
    }).then((h) => {
      if (!liveRef.current) { h.stop(); return; }
      vadRef.current = h;
      // محرك مزدوج: على الكمبيوتر نشغّل الاستماع المباشر مع التسجيل، أول واحد يلقط يسلّم
      if (C && !/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) spawn();
    }).catch(() => { spawn(); });
  };
  const stop = () => { setMicLvl(0); liveRef.current = false; vadRef.current?.stop(); vadRef.current = null; recRef.current?.stop(); setLive(false); setInterim(""); audioRef.current?.pause(); setSpeaking(false); cancelCountdown(); };
  useEffect(() => () => { liveRef.current = false; vadRef.current?.stop(); recRef.current?.stop(); cancelCountdown(); }, []);

  const runDealEye = async () => {
    if (log.length < 2) { toast.error("المحادثة قصيرة — خل الزبون يتكلم شوي"); return; }
    setAnalyzing(true);
    try { setDeal(await analyze({ data: { conversation: log.slice(-40) } }) as any); } catch (e) { toast.error((e as Error).message); }
    setAnalyzing(false);
  };
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => { if (log.length >= 2 && !analyzing) analyze({ data: { conversation: log.slice(-40) } }).then((d) => setDeal(d as any)).catch(() => {}); }, 10000);
    return () => clearInterval(id);
  }, [live, log, analyzing]);

  const dispatchWa = async (voice: boolean) => {
    const inst = waFrom || accounts.find((a) => a.status === "open")?.name;
    if (!inst) { toast.error(accErr ? `أرقامك ما وصلت من السيرفر: ${accErr}` : "ما فيه رقم واتساب متصل — اربط واحد من القنوات"); return; }
    if (!waTo.replace(/\D/g, "")) { toast.error("اكتب رقم الزبون"); return; }
    if (isBlocked(waTo, cfgRef.current)) { toast.error("📞 هذا الرقم مستثنى"); return; }
    const text = waText.trim() || answer;
    if (!text) { toast.error("اكتب الرسالة"); return; }
    try { await sendWa({ data: { instance: inst, to: waTo, text, voice } }); toast.success(voice ? "🎙️ انرسل فويس" : "✅ انرسلت الرسالة"); setWaText(""); }
    catch (e) { toast.error((e as Error).message); }
  };

  const applyTuning = (a: HTMLAudioElement) => {
    const t = loadTuning();
    a.volume = loud ? 1 : 0.3;
    (a as any).preservesPitch = t.pitch === 1;
    a.playbackRate = Math.min(2, Math.max(0.5, t.speed * t.pitch));
    applyCable(a);
  };
  const say = async (text: string) => {
    if (!text.trim()) return;
    const c = cfgRef.current;
    const bad = hitBanned(text, c);
    if (bad) { toast.error(`🚫 الرد فيه كلمة ممنوعة «${bad}» — ما نطقته`); return; }
    setLog((l) => [...l, { who: "a", t: text }]);
    lastSaidRef.current = text;
    if (c.route === "text") { setAnswer(text); return; }
    const spoken = applyFixes(text, c);
    if (c.route === "ptt") {
      setSpeaking(true);
      try { await sendPlus({ text: spoken, voice: true }); } finally { setSpeaking(false); }
      return;
    }
    const ready = findLinkedClip(text) ?? findLinkedClip(spoken);
    if (ready) { void playAudio(ready); return; }
    const mySay = ++saySeq.current;
    setSpeaking(true); micHold();
    try {
      const audio = await tts(spoken, { emotion });
      // رد أحدث وصل → نتجاهل هذا القديم (يمنع تصادم ردين فوق بعض)
      if (mySay !== saySeq.current) return;
      audioRef.current?.pause();
      const a = new Audio(audio); audioRef.current = a;
      applyTuning(a);
      a.onended = () => { setSpeaking(false); micRelease(); };
      a.onerror = () => { setSpeaking(false); micRelease(); };
      await a.play();
    } catch (e) { toast.error((e as Error).message); setSpeaking(false); micRelease(); }
  };
  const playAudio = async (src: string) => {
    audioRef.current?.pause();
    micHold();
    const a = new Audio(src); audioRef.current = a;
    a.volume = loud ? 1 : 0.3; setSpeaking(true);
    a.onended = () => { setSpeaking(false); micRelease(); };
    try { await a.play(); } catch { setSpeaking(false); micRelease(); }
  };
  const sendPlus = async ({ text, voice, audio }: { text: string; voice: boolean; audio?: string }) => {
    const inst = waFrom || accounts.find((a) => a.status === "open")?.name;
    if (!inst) { toast.error(accErr ? `أرقامك ما وصلت من السيرفر: ${accErr}` : "ما فيه رقم واتساب متصل — اربط واحد من القنوات"); return false; }
    if (!waTo.replace(/\D/g, "")) { toast.error("اكتب رقم الزبون"); return false; }
    if (isBlocked(waTo, cfgRef.current)) { toast.error("📞 هذا الرقم مستثنى"); return false; }
    try { await sendWa({ data: { instance: inst, to: waTo, text, voice, audio } }); toast.success(voice ? "🎙️ انرسل فويس" : "✅ انرسلت"); return true; }
    catch (e) { toast.error((e as Error).message); return false; }
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
  const teach = async () => {
    const q = (teachQ || customer).trim(); const a = teachA.trim();
    if (!q || !a) { toast.error("اكتب السؤال والرد"); return; }
    const { error } = await addRule(q, a, storeId);
    if (error) { toast.error(error.message); return; }
    toast.success("🧠 تعلّمتها — صارت قاعدة دائمة"); setTeachQ(""); setTeachA(""); reload();
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
      <section className="rounded-2xl border bg-card p-3 lg:col-span-3"><StaffSwitcher storeId={storeId} channel="live" />
        <details className="mt-2 rounded-xl border p-2"><summary className="cursor-pointer text-sm font-semibold">👯 إدارة طاقم الموظفات (توليد وتعديل)</summary><div className="mt-2"><CallIdentity storeId={storeId} /></div></details></section>
      <LiveCockpit cfg={cfg} setCfg={saveCfg} live={live} onToggle={() => (live ? stop() : start())} rulesCount={rules.length}
        accounts={accounts} accErr={accErr} reloadAcc={loadAccounts}
        waFrom={waFrom} setWaFrom={(v) => { setWaFrom(v); localStorage.setItem("live_wa_from", v); }} waTo={waTo} setWaTo={setWaTo} customers={custList} />
      <section className="rounded-2xl bg-royal p-5 text-primary-foreground shadow-soft lg:col-span-3">
        <div className="flex flex-col items-center">
          <div className={`relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-gold text-5xl transition-transform ${speaking ? "scale-105 animate-pulse ring-8 ring-gold/60" : live ? "ring-4 ring-gold/30" : ""}`}>
            {avatar ? <img src={avatar} alt="صورة الموظفة" className="h-full w-full object-cover" /> : "👩‍💼"}
            {live && <span className="absolute bottom-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px]">✓</span>}
          </div>
          <label className="mt-2 cursor-pointer text-xs underline opacity-80">
            📷 {avatar ? "غيّر صورة الموظفة" : "حط صورة للموظفة"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => pickAvatar(e.target.files?.[0])} />
          </label>
          <p className="mt-2 text-sm opacity-80">
            {live ? (speaking ? "🔊 تتكلم…" : busy ? "🧠 تفكر في الرد…" : muted ? "🔇 المايك مكتوم" : "👂 تسمع الزبون…") : "جاهزة للاتصال"}
          </p>
          <p className="font-mono text-lg" dir="ltr">{fmt(seconds)}</p>
          <div className="mt-2 flex h-8 items-end gap-1" aria-hidden>
            {[0.4, 0.9, 0.6, 1, 0.5, 0.8, 0.35, 0.7].map((h, i) => (
              <span key={i} className={`w-1.5 rounded-full bg-gold ${live && !muted ? "animate-pulse" : ""}`} style={{ height: `${(speaking ? h : h * 0.6) * 100}%`, animationDelay: `${i * 0.12}s`, opacity: live ? 1 : 0.25 }} />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setMuted((m) => !m)} disabled={!live}>{muted ? "🔇 شغّل المايك" : "🎙️ اكتم المايك"}</Button>
            <Button size="sm" variant="secondary" onClick={() => { setLoud((v) => !v); if (audioRef.current) audioRef.current.volume = loud ? 0.3 : 1; }}>{loud ? "🔊 مكبر" : "🔉 خافض"}</Button>
            <Button size="sm" className={autopilot ? "bg-gold text-accent-foreground hover:opacity-90" : ""} variant={autopilot ? "default" : "secondary"}
              onClick={() => saveCfg({ ...cfg, fast: !autopilot })}>
              {autopilot ? "🤖 طيار آلي 100%" : "🧑‍💼 إشراف يدوي"}
            </Button>
          </div>
          {countdown > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-primary-foreground/10 px-3 py-2 text-sm">
              ⏳ بتنطق الرد بعد {countdown}…
              <Button size="sm" className="bg-gold text-accent-foreground" onClick={() => { cancelCountdown(); say(answer); }}>✅ موافق الحين</Button>
              <Button size="sm" variant="secondary" onClick={cancelCountdown}>✋ أوقف</Button>
            </div>
          )}
        </div>
      </section>
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
            <VoiceModelPicker />
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
          {live && <div className="flex items-center gap-2 text-xs text-muted-foreground"><span>🎙️</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${Math.round(micLvl * 100)}%` }} /></div></div>}
          {interim && <p className="text-sm text-muted-foreground">… {interim}</p>}
        </Card>

        <CallTranscript log={log} setLog={setLog} storeId={storeId} kind="live" live={live} onSay={(t) => void say(t)} reload={reload} />

        <section className="rounded-2xl bg-royal p-6 text-primary-foreground shadow-soft">
          <p className="text-sm opacity-80">👩‍💼 الموظفة بتقول:</p>
          <p className="font-display mt-2 min-h-12 text-2xl leading-relaxed">
            {busy ? "تفكر…" : answer || (customer ? "ما عندها رد من تعليمك — اختر اقتراح أو اكتب ردك" : "—")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button className="bg-gold text-accent-foreground hover:opacity-90" disabled={!answer || speaking} onClick={() => { cancelCountdown(); say(answer); }}>✅ موافق وانطق</Button>
            <Button variant="secondary" disabled={!alts.length} onClick={() => { const [n, ...rest] = alts; if (n) { setAlts([...rest, answer].filter(Boolean)); setAnswer(n); } }}>اقترح بديل 💡</Button>
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

        <Card title="💡 علّم الموظفة فوراً">
          <Input value={teachQ || customer} onChange={(e) => setTeachQ(e.target.value)} placeholder="سؤال الزبون (يتعبى تلقائياً من آخر كلامه)" />
          <Textarea className="mt-2" rows={2} value={teachA} onChange={(e) => setTeachA(e.target.value)} placeholder="الرد الصحيح اللي تبيها تقوله دايماً…" />
          <Button className="mt-2" onClick={teach}>🧠 علّمها</Button>
          <p className="mt-1 text-xs text-muted-foreground">ينحفظ كقاعدة دائمة مع قواعدك ({rules.length.toLocaleString("ar")} قاعدة).</p>
        </Card>


        <Card title="👁️ عين الصفقة اللحظية">
          {deal ? (
            <div className="space-y-2">
              <p className="text-lg font-medium">{({ sold: "🏆 تم البيع", hot: "🔥 مهتم جداً", cold: "🤔 متردد", lost: "🥀 غير مهتم" } as Record<string, string>)[deal.verdict] ?? deal.verdict} — {deal.score}%</p>
              <Progress value={deal.score} />
              <p className="text-sm text-muted-foreground">{deal.summary}</p>
              {deal.tips?.map((t, i) => <p key={i} className="rounded-lg bg-secondary px-3 py-2 text-sm">💡 {t}</p>)}
            </div>
          ) : <p className="text-sm text-muted-foreground">تتحدث تلقائياً كل 10 ثوانٍ أثناء المكالمة.</p>}
          <Button className="mt-3" variant="outline" onClick={runDealEye} disabled={analyzing}>{analyzing ? "تحلل…" : "حلّل الحين"}</Button>
        </Card>

        <Card title="📲 أرسل للزبون واتساب أثناء المكالمة">
          <label className="mb-1 block text-xs text-muted-foreground">أرسل من رقم:</label>
          <select value={waFrom} onChange={(e) => { setWaFrom(e.target.value); localStorage.setItem("live_wa_from", e.target.value); }} className="mb-2 w-full rounded-md border bg-background px-2 py-2 text-sm" aria-label="رقم الإرسال">
            <option value="">تلقائي (أول رقم متصل)</option>
            {accounts.map((a) => <option key={a.name} value={a.name}>{a.status === "open" ? "🟢" : "🔴"} {a.label || a.name}{a.number ? ` — ${a.number}` : ""}</option>)}
          </select>
          <Input value={waTo} onChange={(e) => setWaTo(e.target.value)} placeholder="رقم الزبون مثل 9665xxxxxxxx" dir="ltr" className="mb-2" />
          <Textarea value={waText} onChange={(e) => setWaText(e.target.value)} rows={2} placeholder="الرسالة (فاضي = يرسل رد الموظفة الحالي)…" />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button onClick={() => dispatchWa(false)}>💬 أرسل نص</Button>
            <Button variant="secondary" onClick={() => dispatchWa(true)}>🎙️ أرسل كفويس</Button>
          </div>
        </Card>

        <LiveCallPlus waTo={waTo} setWaTo={setWaTo} live={live} speaking={speaking} customer={customer} answer={answer} log={log}
          say={say} playAudio={playAudio} bargeIn={() => { audioRef.current?.pause(); setSpeaking(false); cancelCountdown(); }}
          send={sendPlus} setEmotion={setEmotion} customers={custList} />

        <LiveHybrid live={live} speaking={speaking} customer={customer} log={log} say={say} send={sendPlus} persona={cfg.persona}
          onMode={(m) => { if (m === "auto") saveCfg({ ...cfg, fast: true }); if (m === "copilot") saveCfg({ ...cfg, fast: false }); if (m === "ptt") saveCfg({ ...cfg, route: "ptt" }); if (m === "line") saveCfg({ ...cfg, route: "speaker" }); }}
          stopAll={() => { audioRef.current?.pause(); setSpeaking(false); cancelCountdown(); }} />
      </div>

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
