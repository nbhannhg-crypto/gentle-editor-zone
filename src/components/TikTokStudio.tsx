import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { guessCategory } from "@/lib/rules";
import { STUDIO_VOICES } from "@/lib/studio-voices";
import { studioGenerate } from "@/lib/studio.functions";
import { ttList, ttLoginUrl, ttSaveCtrl, ttRemove, ttManualReply, ttAddManual } from "@/lib/tiktok.functions";
import { ttChannel, type TtAccount, type TtCtrl, type TtLog } from "@/lib/tiktok-types";
import { CallIdentity, StaffSwitcher } from "@/components/CallIdentity";
import { CallBoxes } from "@/components/CallBoxes";

const pill = (on: boolean) => `shrink-0 rounded-full border px-3 py-1.5 text-xs ${on ? "bg-primary text-primary-foreground" : "bg-background"}`;

/** 🎵 استوديو تيك توك — حسابات متعددة لكل متجر، لوحة تحكم مثل الواتساب، وصندوق رسائل. */
export function TikTokStudio({ storeId }: { storeId?: string | undefined }) {
  const list = useServerFn(ttList);
  const login = useServerFn(ttLoginUrl);
  const addManual = useServerFn(ttAddManual);
  const [uname, setUname] = useState("");
  const addDirect = async () => {
    try { await addManual({ data: { storeId, username: uname } }); setUname(""); toast.success("✅ انضاف الحساب"); await load(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const [accs, setAccs] = useState<TtAccount[]>([]);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    try { const r = await list({ data: { storeId } }); setAccs(r.accounts); setReady(r.ready); }
    catch (e) { toast.error((e as Error).message); }
    setLoading(false);
  };
  useEffect(() => {
    void load();
    const p = new URLSearchParams(window.location.search).get("tiktok");
    if (p === "ok") toast.success("✅ انربط حساب تيك توك");
    else if (p) toast.error("ما تم ربط الحساب — جرّب مرة ثانية");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);
  const connect = async () => {
    try { const r = await login({ data: { storeId, origin: window.location.origin } }); const w = window.open(r.url, "_blank"); if (!w) { try { (window.top ?? window).location.href = r.url; } catch { window.location.href = r.url; } } }
    catch (e) { toast.error((e as Error).message); }
  };
  return (
    <section className="space-y-4">
      <div className="space-y-2 rounded-2xl border bg-card p-5">
        <h2 className="font-semibold">🎵 حسابات تيك توك</h2>
        <p className="text-sm text-muted-foreground">اربط أكثر من حساب لنفس المتجر، ولكل حساب موظفته ولوحته المستقلة.</p>
        {!ready && <p className="rounded-lg bg-muted p-2 text-xs">⚠️ الربط ينتظر مفاتيح تطبيق تيك توك من الإدارة.</p>}
        <Button onClick={connect} className="w-full">🔗 + ربط حساب تيك توك جديد</Button>
        <div className="flex gap-2">
          <input value={uname} onChange={(e) => setUname(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addDirect(); }} placeholder="يوزر الحساب مثل asas055555" className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm" dir="ltr" />
          <Button variant="secondary" onClick={addDirect} disabled={!uname.trim()}>➕ إضافة مباشرة</Button>
        </div>
      </div>
      {loading && <p className="text-center text-sm text-muted-foreground">⏳ جاري التحميل…</p>}
      {!loading && !accs.length && <p className="rounded-xl bg-secondary p-6 text-center text-sm">ما فيه حسابات مربوطة للحين 🎵</p>}
      {accs.map((a) => <TtPanel key={a.open_id} acc={a} storeId={storeId} reload={load} />)}
    </section>
  );
}

function TtPanel({ acc, storeId, reload }: { acc: TtAccount; storeId?: string | undefined; reload: () => Promise<void> }) {
  const save = useServerFn(ttSaveCtrl);
  const remove = useServerFn(ttRemove);
  const manual = useServerFn(ttManualReply);
  const gen = useServerFn(studioGenerate);
  const [c, setC] = useState<TtCtrl>(acc.ctrl);
  const [log, setLog] = useState<TtLog[]>(acc.log ?? []);
  const [staffOpen, setStaffOpen] = useState(false);
  const [chat, setChat] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [teach, setTeach] = useState<{ t: string } | null>(null);
  const [ans, setAns] = useState("");
  const [voice, setVoice] = useState<string>(STUDIO_VOICES[0]![0]);
  const [audio, setAudio] = useState("");
  const [busy, setBusy] = useState(false);

  const update = async (patch: Partial<TtCtrl>) => {
    const next = { ...c, ...patch }; setC(next);
    try { await save({ data: { storeId, openId: acc.open_id, ctrl: next } }); toast.success("✅ انحفظ"); }
    catch (e) { toast.error((e as Error).message); }
  };
  const del = async (m: TtLog) => {
    setLog(log.filter((x) => x.at !== m.at));
    try { await save({ data: { storeId, openId: acc.open_id, deleteAt: m.at } }); } catch (e) { toast.error((e as Error).message); }
  };
  const saveTeach = async () => {
    if (!teach || !ans.trim()) return;
    const { error } = await supabase.from("training_rules").insert({ trigger_text: teach.t.trim(), response_text: ans.trim(), category: guessCategory(teach.t), store_id: storeId ?? null });
    if (error) { toast.error(error.message); return; }
    toast.success("✅ تعلّمت الرد"); setTeach(null); setAns("");
  };
  const send = async () => {
    if (!chat || !draft.trim()) return;
    setBusy(true);
    try {
      await manual({ data: { storeId, openId: acc.open_id, to: chat, text: draft } });
      setLog([...log, { n: chat, t: "", r: draft, at: Date.now(), me: true }]); setDraft("");
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };
  const makeVoice = async () => {
    if (!draft.trim()) { toast.error("اكتب الرد أول"); return; }
    setBusy(true);
    try {
      const name = STUDIO_VOICES.find((v) => v[0] === voice)?.[1] ?? "";
      const r = await gen({ data: { text: draft, voiceId: voice, voiceName: name, emotion: "friendly", speed: 1, model: "s2.1-pro" } });
      setAudio(r.audio); toast.success(`🎙️ الفويس جاهز (${r.cost} نقطة) وانحفظ في مكتبتك`);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };

  const groups = new Map<string, TtLog[]>();
  for (const m of log) { const g = groups.get(m.n) ?? []; g.push(m); groups.set(m.n, g); }
  const people = [...groups.entries()].sort((a, b) => b[1][b[1].length - 1]!.at - a[1][a[1].length - 1]!.at);
  const history = chat ? groups.get(chat) ?? [] : [];

  return (
    <div className="space-y-3 rounded-2xl border-2 border-primary/40 bg-card p-4">
      <div className="flex items-center gap-3">
        {acc.avatar ? <img src={acc.avatar} alt={acc.name} className="h-10 w-10 rounded-full" /> : <span className="text-3xl">🎵</span>}
        <div className="min-w-0 flex-1"><b className="block truncate">{acc.name}</b><span className="text-xs text-muted-foreground">{c.enabled ? "🟢 الرد الآلي شغال" : "🔴 متوقف"}</span></div>
        <Button size="sm" variant="ghost" onClick={async () => { if (!confirm("تفك ربط هذا الحساب؟")) return; await remove({ data: { storeId, openId: acc.open_id } }); await reload(); }}>✕</Button>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <button className={pill(c.enabled)} onClick={() => update({ enabled: !c.enabled })}>{c.enabled ? "🟢 شغال" : "🔴 متوقف"}</button>
        {([["ai", "🤖 ذكاء اصطناعي"], ["smart", "🧠 ذكي"], ["rules", "📜 قواعد تدريب"]] as const).map(([k, l]) => <button key={k} className={pill(c.source === k)} onClick={() => update({ source: k })}>{l}</button>)}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {[0, 3, 10, 25].map((s) => <button key={s} className={pill(c.delay === s)} onClick={() => update({ delay: s })}>{s ? `⏱️ ${s} ث` : "⚡ فوري"}</button>)}
      </div>
      <Button size="sm" variant="outline" className="w-full" onClick={() => setStaffOpen(true)}>👯 الموظفة المناوبة والمربعات الأربعة</Button>

      <div className="space-y-1.5">
        <span className="text-xs font-semibold">💬 رسائل الخاص</span>
        {!people.length && <p className="text-xs text-muted-foreground">بتظهر هنا الرسائل أول ما توصل.</p>}
        {people.map(([n, msgs]) => {
          const last = msgs[msgs.length - 1]!;
          return (
            <button key={n} onClick={() => { setChat(n); setDraft(""); setAudio(""); }} className="flex w-full items-center justify-between gap-2 rounded-lg bg-muted/50 p-2 text-right text-sm">
              <div className="min-w-0"><div className="text-xs text-muted-foreground">@{n}</div><div className="truncate">{last.me ? `👩‍💼 ${last.r}` : `👤 ${last.t}`}</div></div>
              <span className="shrink-0 rounded-full bg-background px-2 text-xs">{msgs.length}</span>
            </button>
          );
        })}
      </div>

      <Dialog open={staffOpen} onOpenChange={setStaffOpen}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader><DialogTitle>👯 موظفة حساب {acc.name}</DialogTitle></DialogHeader>
          <StaffSwitcher storeId={storeId} channel={ttChannel(acc.open_id)} />
          <CallIdentity storeId={storeId} />
          <CallBoxes storeId={storeId} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!chat} onOpenChange={(o) => { if (!o) setChat(null); }}>
        <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto">
          <DialogHeader><DialogTitle>💬 @{chat}</DialogTitle></DialogHeader>
          <div ref={(el) => { if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; }); }} className="max-h-[45vh] space-y-1.5 overflow-y-auto rounded-lg bg-muted p-2">
            {history.map((m) => (
              <div key={m.at} className="space-y-1">
                {m.t && <p className="w-fit max-w-[85%] rounded-xl bg-background p-2 text-sm">{m.t}</p>}
                {m.r && <p className="mr-auto w-fit max-w-[85%] rounded-xl bg-primary p-2 text-sm text-primary-foreground">{m.r}</p>}
                <div className="flex gap-1.5">
                  {m.t && <button className="rounded-full bg-primary px-2.5 py-1 text-xs text-primary-foreground" onClick={() => { setTeach({ t: m.t }); setAns(""); }}>💡 علّم الموظفة الرد</button>}
                  <button className="rounded-full border bg-background px-2.5 py-1 text-xs" onClick={() => del(m)}>🗑️ حذف</button>
                </div>
              </div>
            ))}
          </div>
          <Textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="اكتب ردك" />
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" disabled={busy || !draft.trim()} onClick={send}>🚀 إرسال</Button>
            <select value={voice} onChange={(e) => setVoice(e.target.value)} className="min-w-0 flex-1 rounded-md border bg-background p-1.5 text-xs">
              {STUDIO_VOICES.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
            <Button size="sm" variant="outline" disabled={busy || !draft.trim()} onClick={makeVoice}>🎙️ ولّد فويس</Button>
          </div>
          {audio && <><audio controls src={audio} className="w-full" /><a href={audio} download="tiktok-voice.mp3" className="text-xs underline">⬇️ تحميل الفويس</a></>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!teach} onOpenChange={(o) => { if (!o) setTeach(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>💡 علّم الموظفة الرد</DialogTitle></DialogHeader>
          <p className="rounded-md bg-muted p-2 text-sm">العميل قال: «{teach?.t}»</p>
          <Textarea rows={3} value={ans} onChange={(e) => setAns(e.target.value)} placeholder="الرد اللي تبيها ترد فيه" />
          <Button onClick={saveTeach} disabled={!ans.trim()}>حفظ ✅</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
