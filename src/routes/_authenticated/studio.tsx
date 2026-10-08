import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { getOrCreateMyStore, type Store } from "@/lib/stores";
import { getBalance } from "@/lib/wallet";
import { STUDIO_VOICES, STUDIO_PACKS, JEEB_NUMBER } from "@/lib/studio-voices";
import { studioGenerate, studioWrite, waList, waSendVoice, placeCall } from "@/lib/studio.functions";
import { WhatsApp, type Wa } from "@/components/WaAccounts";

export const Route = createFileRoute("/_authenticated/studio")({
  head: () => ({
    meta: [
      { title: "استوديو الأصوات — مملكة المبيعات" },
      { name: "description", content: "حوّل نصك لصوت سعودي حقيقي وأرسله فويس واتساب أو مكالمة." },
      { property: "og:title", content: "استوديو الأصوات — مملكة المبيعات" },
      { property: "og:description", content: "أصوات سعودية حقيقية، فويس واتساب، ومكالمات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudioPage,
});

type Audio = { id: string; text: string; voice_name: string; path: string; created_at: string };
type Tab = "voice" | "library" | "whatsapp" | "recharge";

function StudioPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("voice");
  const [store, setStore] = useState<Store | null>(null);
  const [balance, setBalance] = useState(0);
  const [lib, setLib] = useState<Audio[]>([]);
  const [was, setWas] = useState<Wa[]>([]);

  const refreshBal = async (s = store) => { if (s) setBalance(await getBalance(s.id)); };
  const loadLib = async () => {
    const { data } = await supabase.from("studio_audio").select("id,text,voice_name,path,created_at").order("created_at", { ascending: false }).limit(100);
    setLib((data as Audio[]) ?? []);
  };
  const list = useServerFn(waList);
  const loadWa = async () => { try { setWas(await list()); } catch (e) { toast.error((e as Error).message); } };

  useEffect(() => {
    void (async () => {
      const s = await getOrCreateMyStore();
      setStore(s); await refreshBal(s); await loadLib(); await loadWa();
    })();
  }, []);

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-5">
          <div>
            <h1 className="font-display text-2xl">🎤 استوديو الأصوات</h1>
            <p className="text-sm opacity-80">صوت سعودي حقيقي • فويس واتساب أزرق • مكالمات</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-gold px-3 py-1.5 text-sm font-bold text-accent-foreground">💰 {balance} نقطة</span>
            <button onClick={() => navigate({ to: "/app" })} className="rounded-full bg-primary-foreground/15 px-3 py-1.5 text-sm">↩ لوحتي</button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-4xl gap-2 overflow-x-auto px-4">
          {([["voice", "🎙️ توليد صوت"], ["library", "📚 مكتبتي"], ["whatsapp", "🟢 حسابات واتساب"], ["recharge", "💳 شحن الرصيد"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`shrink-0 rounded-t-xl px-4 py-2 text-sm font-medium ${tab === k ? "bg-background text-foreground" : "text-primary-foreground/80"}`}>{l}</button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        {tab === "voice" && <Generate onDone={async () => { await loadLib(); await refreshBal(); }} />}
        {tab === "library" && <Library lib={lib} was={was} reload={loadLib} onSpent={() => refreshBal()} />}
        {tab === "whatsapp" && <WhatsApp was={was} reload={loadWa} />}
        {tab === "recharge" && store && <Recharge storeId={store.id} />}
      </main>
    </div>
  );
}

const QUICK = [
  "هلا والله وغلا، حياك في متجرنا! وش اللي يناسبك اليوم؟",
  "عندنا عرض خاص لك اليوم بس، خصم عشرين بالمية على كل المنتجات.",
  "شكراً لثقتك فينا، طلبك بيوصلك قريب بإذن الله.",
  "نسيت سلتك؟ لا تفوتك، المنتجات قاعدة تخلص!",
];
const MOODS = [["", "طبيعي"], ["happy", "😊 فرحانة"], ["excited", "🤩 متحمسة"], ["friendly", "🤗 ودودة"], ["confident", "💪 واثقة"], ["calm", "😌 هادئة"], ["empathetic", "💗 متفهمة"]] as const;
const STYLES = [["offer", "🔥 عرض"], ["welcome", "👋 ترحيب"], ["followup", "🔁 متابعة"], ["thanks", "🙏 شكر"], ["ad", "📣 إعلان"]] as const;

function Generate({ onDone }: { onDone: () => Promise<void> }) {
  const gen = useServerFn(studioGenerate);
  const write = useServerFn(studioWrite);
  const [voice, setVoice] = useState(STUDIO_VOICES[0]![0]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [audio, setAudio] = useState("");
  const [mood, setMood] = useState<(typeof MOODS)[number][0]>("");
  const [speed, setSpeed] = useState(1);
  const [idea, setIdea] = useState("");
  const [style, setStyle] = useState<(typeof STYLES)[number][0]>("offer");
  const [writing, setWriting] = useState(false);
  const cost = Math.max(1, Math.ceil(text.length / 100));
  const aiWrite = async (): Promise<void> => {
    if (idea.trim().length < 2) { toast.error("اكتب فكرتك باختصار"); return; }
    setWriting(true);
    try { const r = await write({ data: { idea, style } }); setText(r.text); toast.success("✨ النص جاهز — تقدر تعدله"); }
    catch (e) { toast.error((e as Error).message); } finally { setWriting(false); }
  };
  const go = async (): Promise<void> => {
    if (!text.trim()) { toast.error("اكتب النص أول"); return; }
    setBusy(true);
    try {
      const name = STUDIO_VOICES.find((v) => v[0] === voice)?.[1] ?? "";
      const r = await gen({ data: { text, voiceId: voice, voiceName: name, emotion: mood, speed } });
      setAudio(r.audio); toast.success(`تم ✅ خُصم ${r.cost} نقطة وانحفظ في مكتبتك`);
      await onDone();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5">
      <div className="space-y-2 rounded-xl border border-dashed bg-muted/40 p-3">
        <p className="text-sm font-semibold">✨ الكاتبة الذكية — اكتب فكرتك وهي تكتب النص</p>
        <div className="flex flex-wrap gap-1.5">
          {STYLES.map(([k, l]) => (
            <button key={k} onClick={() => setStyle(k)} className={`rounded-full border px-3 py-1 text-xs ${style === k ? "bg-primary text-primary-foreground" : "bg-background"}`}>{l}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={idea} onChange={(e) => setIdea(e.target.value.slice(0, 400))} placeholder="مثال: عطر عود فاخر بسعر 199 ريال" />
          <Button onClick={aiWrite} disabled={writing} variant="secondary">{writing ? "⏳" : "✨ اكتب"}</Button>
        </div>
      </div>
      <label className="block text-sm font-semibold">اختر الصوت ({STUDIO_VOICES.length} صوت)</label>
      <select value={voice} onChange={(e) => setVoice(e.target.value)} className="w-full rounded-lg border bg-background p-2">
        {STUDIO_VOICES.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
      </select>
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((q) => <button key={q} onClick={() => setText(q)} className="rounded-full border bg-background px-3 py-1 text-xs hover:bg-muted">{q.slice(0, 22)}…</button>)}
      </div>
      <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value.slice(0, 2000))} placeholder="اكتب الكلام اللي تبيه يتحول لصوت…" />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">المزاج
          <select value={mood} onChange={(e) => setMood(e.target.value as typeof mood)} className="mt-1 w-full rounded-lg border bg-background p-2">
            {MOODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="text-sm">السرعة: {speed.toFixed(1)}x
          <input type="range" min={0.6} max={1.6} step={0.1} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="mt-3 w-full" />
        </label>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground"><span>{text.length} / 2000 حرف</span><span>التكلفة: {cost} نقطة (نقطة لكل 100 حرف)</span></div>
      <Button onClick={go} disabled={busy} className="w-full">{busy ? "⏳ جاري التوليد…" : "🎙️ حوّل لصوت"}</Button>
      {audio && (
        <div className="space-y-2">
          <audio controls src={audio} className="w-full" autoPlay />
          <a href={audio} download="kingdom-voice.mp3" className="block text-center text-sm text-primary underline">⬇️ حمّل الصوت</a>
        </div>
      )}
    </section>
  );
}

function Library({ lib, was, reload, onSpent }: { lib: Audio[]; was: Wa[]; reload: () => Promise<void>; onSpent: () => void }) {
  const send = useServerFn(waSendVoice);
  const call = useServerFn(placeCall);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [target, setTarget] = useState<Record<string, string>>({});
  const [acc, setAcc] = useState("");
  useEffect(() => {
    void (async () => {
      if (!lib.length) return;
      const { data } = await supabase.storage.from("studio-audio").createSignedUrls(lib.map((a) => a.path), 3600);
      const m: Record<string, string> = {};
      data?.forEach((d, i) => { if (d.signedUrl) m[lib[i]!.id] = d.signedUrl; });
      setUrls(m);
    })();
  }, [lib]);
  useEffect(() => { const c = was.find((w) => w.status === "open"); if (c && !acc) setAcc(c.name); }, [was]);

  const del = async (a: Audio) => {
    await supabase.storage.from("studio-audio").remove([a.path]);
    await supabase.from("studio_audio").delete().eq("id", a.id);
    await reload();
  };
  const doSend = async (a: Audio): Promise<void> => {
    const n = (target[a.id] ?? "").replace(/\s/g, "");
    if (!acc) { toast.error("اربط حساب واتساب أول"); return; }
    if (!n) { toast.error("اكتب رقم المستلم"); return; }
    try { await send({ data: { name: acc, number: n, audioId: a.id } }); toast.success("انرسل كفويس أزرق 🔵"); }
    catch (e) { toast.error((e as Error).message); }
  };
  const doCall = async (a: Audio): Promise<void> => {
    const n = (target[a.id] ?? "").replace(/\s/g, "");
    const to = n.startsWith("+") ? n : `+${n}`;
    try { await call({ data: { to, audioId: a.id } }); toast.success("📞 جاري الاتصال… (10 نقاط)"); onSpent(); }
    catch (e) { toast.error((e as Error).message); }
  };
  if (!lib.length) return <p className="rounded-xl bg-secondary p-6 text-center">مكتبتك فاضية — ولّد أول صوت 🎙️</p>;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl bg-secondary p-3 text-sm">
        <span>الإرسال من حساب:</span>
        <select value={acc} onChange={(e) => setAcc(e.target.value)} className="flex-1 rounded-lg border bg-background p-1.5">
          <option value="">— اختر —</option>
          {was.map((w) => <option key={w.name} value={w.name}>{w.label} {w.status === "open" ? "🟢" : "⚪"}</option>)}
        </select>
      </div>
      {lib.map((a) => (
        <div key={a.id} className="space-y-2 rounded-2xl border bg-card p-4">
          <div className="flex justify-between text-xs text-muted-foreground"><span>{a.voice_name}</span><span>{new Date(a.created_at).toLocaleString("ar-SA")}</span></div>
          <p className="text-sm">{a.text}</p>
          {urls[a.id] && <audio controls src={urls[a.id]} className="w-full" />}
          <div className="flex flex-wrap gap-2">
            <Input dir="ltr" className="flex-1 min-w-40" placeholder="966500000000" value={target[a.id] ?? ""} onChange={(e) => setTarget({ ...target, [a.id]: e.target.value })} />
            <Button size="sm" onClick={() => doSend(a)}>🔵 فويس واتساب</Button>
            <Button size="sm" variant="secondary" onClick={() => doCall(a)}>📞 اتصال</Button>
            {urls[a.id] && <a href={urls[a.id]} download className="rounded-md border px-3 py-1.5 text-sm">⬇️ تحميل</a>}
            <Button size="sm" variant="ghost" onClick={() => del(a)}>🗑️</Button>
          </div>
        </div>
      ))}
    </section>
  );
}

function WhatsApp({ was, reload }: { was: Wa[]; reload: () => Promise<void> }) {
  const create = useServerFn(waCreate);
  const qrFn = useServerFn(waQr);
  const delFn = useServerFn(waDelete);
  const autoList = useServerFn(waAutoList);
  const autoSet = useServerFn(waAutoSet);
  const [label, setLabel] = useState("");
  const [qr, setQr] = useState<{ name: string; img: string } | null>(null);
  const [auto, setAutoState] = useState<{ cfg: { instance: string; enabled: boolean; voice: boolean; source: string }[]; inbox: any[] }>({ cfg: [], inbox: [] });
  const loadAuto = async () => { try { setAutoState(await autoList()); } catch (e) { toast.error((e as Error).message); } };
  useEffect(() => { void loadAuto(); }, []);
  const setAuto = async (name: string, enabled: boolean, voice: boolean, source = auto.cfg.find((x) => x.instance === name)?.source ?? "smart"): Promise<void> => {
    try { await autoSet({ data: { name, enabled, voice, source: source as "smart", origin: window.location.origin } }); toast.success(enabled ? "✅ الموظفة صارت ترد على هالرقم" : "تم الإيقاف"); await loadAuto(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const add = async (): Promise<void> => {
    if (!label.trim()) { toast.error("اكتب اسم للحساب"); return; }
    try { const r = await create({ data: { label: label.trim().replace(/\s+/g, "_") } }); setQr({ name: r.name, img: r.qr }); setLabel(""); await reload(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const showQr = async (name: string) => {
    try { const r = await qrFn({ data: { name } }); if (!r.qr) toast.success("الحساب مربوط ✅"); else setQr({ name, img: r.qr }); }
    catch (e) { toast.error((e as Error).message); }
  };
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border bg-card p-5">
        <h2 className="mb-2 font-semibold">➕ أضف حساب واتساب (تقدر تضيف أكثر من حساب)</h2>
        <div className="flex gap-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مثال: فرع_الرياض" />
          <Button onClick={add}>أضف واطلع QR</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">افتح واتساب بجوالك ← الأجهزة المرتبطة ← ربط جهاز ← صوّر الكود.</p>
      </div>
      {qr && (
        <div className="rounded-2xl border-2 border-primary bg-card p-5 text-center">
          <p className="mb-2 font-semibold">صوّر الكود من واتساب</p>
          {qr.img ? <img src={qr.img} alt="رمز ربط واتساب" className="mx-auto w-64 rounded-xl bg-white p-2" /> : <p>جاري تجهيز الكود…</p>}
          <div className="mt-3 flex justify-center gap-2">
            <Button size="sm" onClick={() => showQr(qr.name)}>🔄 تحديث الكود</Button>
            <Button size="sm" variant="secondary" onClick={async () => { setQr(null); await reload(); }}>تم الربط ✅</Button>
          </div>
        </div>
      )}
      {was.map((w) => {
        const c = auto.cfg.find((x) => x.instance === w.name);
        return (
        <div key={w.name} className="space-y-2 rounded-xl border bg-card p-3">
          <div className="flex items-center justify-between">
            <div>
              <b>{w.label}</b> <span className="text-xs">{w.status === "open" ? "🟢 مربوط" : "⚪ غير مربوط"}</span>
              {w.number && <div dir="ltr" className="text-xs text-muted-foreground">+{w.number}</div>}
            </div>
            <div className="flex gap-2">
              {w.status !== "open" && <Button size="sm" onClick={() => showQr(w.name)}>QR / ربط</Button>}
              <Button size="sm" variant="ghost" onClick={async () => { try { await delFn({ data: { name: w.name } }); await reload(); } catch (e) { toast.error((e as Error).message); } }}>🗑️</Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 rounded-lg bg-muted/50 p-2 text-sm">
            <Button size="sm" variant={c?.enabled ? "default" : "outline"} onClick={() => setAuto(w.name, !c?.enabled, c?.voice ?? false)}>
              🤖 الموظفة ترد تلقائياً: {c?.enabled ? "شغّالة" : "مطفية"}
            </Button>
            <Button size="sm" variant={c?.voice ? "default" : "outline"} disabled={!c?.enabled} onClick={() => setAuto(w.name, true, !c?.voice)}>
              {c?.voice ? "🔊 ترد بفويس سعودي" : "💬 ترد بالكتابة"}
            </Button>
            {c?.enabled && (
              <div className="flex w-full flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">ترد من:</span>
                {([["smart", "🧠 ردودي + الذكاء"], ["rules", "📘 ردودي المكتوبة بس"], ["library", "📚 محفظة أصواتي"], ["ai", "✨ الذكاء بالكامل"]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setAuto(w.name, true, c.voice, k)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${(c.source ?? "smart") === k ? "bg-primary text-primary-foreground" : "bg-background"}`}>{l}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        );
      })}
      <Button variant="outline" onClick={async () => { await reload(); await loadAuto(); }}>🔄 تحديث الحالة</Button>
      {auto.inbox.length > 0 && (
        <div className="rounded-2xl border bg-card p-4">
          <h3 className="mb-2 font-semibold">📥 آخر ردود الموظفة</h3>
          {auto.inbox.map((m) => (
            <div key={m.msg_id} className="border-b py-2 text-sm last:border-0">
              <div dir="ltr" className="text-xs text-muted-foreground">+{m.from_number} • {m.status === "done" ? "✅ انرد" : m.status === "skipped" ? "⚠️ الرصيد ما يكفي" : m.status === "failed" ? "❌ تعذر الرد" : "⏳"}</div>
              <div>👤 {m.text}</div>
              {m.reply && <div className="text-primary">👩‍💼 {m.reply}</div>}
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">التكلفة: رد من قواعدك نقطة، رد ذكي نقطتين، والفويس +3 نقاط.</p>
    </section>
  );
}

function Recharge({ storeId }: { storeId: string }) {
  const [pack, setPack] = useState(0);
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const p = STUDIO_PACKS[pack]!;
  const submit = async (): Promise<void> => {
    if (!ref.trim()) { toast.error("اكتب رقم العملية من جيب"); return; }
    setBusy(true);
    const { error } = await supabase.from("topup_requests").insert({ store_id: storeId, points: p.points, amount_sar: p.sar, reference: `جيب: ${ref.trim()}` });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("✅ انرسل طلبك — ينضاف رصيدك بعد موافقة الإدارة"); setRef("");
  };
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5">
      <h2 className="font-semibold">💳 اختر الباقة</h2>
      {STUDIO_PACKS.map((x, i) => (
        <button key={x.sar} onClick={() => setPack(i)}
          className={`block w-full rounded-xl border-2 p-3 text-right ${i === pack ? "border-primary bg-secondary" : "border-transparent bg-muted"}`}>{x.label}</button>
      ))}
      <div className="rounded-xl bg-muted p-3">
        <p className="text-sm">حوّل المبلغ على جيب:</p>
        <div className="mt-1 flex items-center justify-between">
          <b dir="ltr" className="text-lg">{JEEB_NUMBER}</b>
          <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard.writeText(JEEB_NUMBER); toast.success("تم النسخ"); }}>📋 نسخ</Button>
        </div>
      </div>
      <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="رقم العملية من جيب" />
      <Button onClick={submit} disabled={busy} className="w-full">✅ تأكيد الدفع — إرسال للموافقة</Button>
    </section>
  );
}
