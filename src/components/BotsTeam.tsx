import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { BUSINESS_BOTS, COMPANION_BOTS, BOTS, TONES } from "@/lib/bots";
import { botRun } from "@/lib/bots.functions";
import { waList, inboxSend, waSendVoice } from "@/lib/studio.functions";
import { useSpeaker } from "@/components/VoiceStudio";
import { supabase } from "@/integrations/supabase/client";

type Dest = "none" | "wa" | "campaign" | "copy" | "draft";
type Out = { id: number; bot: string; order: string; text: string; tone: string; at: number; status: string };
type Clip = { id: string; text: string; voice_name: string };

const DESTS: [Dest, string][] = [
  ["none", "👀 عرض فقط"], ["wa", "🟢 إرسال واتساب"], ["campaign", "📢 حملة رسائل"], ["copy", "📋 نسخ"], ["draft", "💾 مسودة"],
];
const LS = "bots_hub";

function words(s: string) { return new Set(s.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 1)); }
function bestClip(text: string, clips: Clip[]) {
  const a = words(text); let best: { c: Clip; s: number } | null = null;
  for (const c of clips) { const b = words(c.text); let n = 0; b.forEach((w) => { if (a.has(w)) n++; }); const s = n / Math.max(1, Math.min(a.size, b.size)); if (!best || s > best.s) best = { c, s }; }
  return best && best.s > 0 ? best : null;
}

export function BotsTeam() {
  const run = useServerFn(botRun);
  const list = useServerFn(waList);
  const send = useServerFn(inboxSend);
  const sendClip = useServerFn(waSendVoice);
  const speak = useSpeaker();
  const [group, setGroup] = useState<"fun" | "biz">("fun");
  const [bot, setBot] = useState<string>("auto");
  const [tone, setTone] = useState("auto");
  const [dest, setDest] = useState<Dest>("none");
  const [phone, setPhone] = useState("");
  const [inst, setInst] = useState("");
  const [insts, setInsts] = useState<{ name: string; label: string; status: string }[]>([]);
  const [order, setOrder] = useState("");
  const [busy, setBusy] = useState(false);
  const [outs, setOuts] = useState<Out[]>([]);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [listening, setListening] = useState(false);
  const [rowBusy, setRowBusy] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cur = BOTS.find((b) => b.id === bot);

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(LS) || "{}"); if (s.outs) setOuts(s.outs); if (s.drafts) setDrafts(s.drafts); if (s.phone) setPhone(s.phone); if (s.tone) setTone(s.tone); if (s.dest) setDest(s.dest); if (s.inst) setInst(s.inst); } catch { /* ignore */ }
    list().then((r) => setInsts(r.filter((i) => i.status === "open"))).catch(() => {});
    supabase.from("studio_audio").select("id, text, voice_name").order("created_at", { ascending: false }).limit(300).then(({ data }) => setClips((data ?? []) as Clip[]));
  }, []);
  useEffect(() => { try { localStorage.setItem(LS, JSON.stringify({ outs: outs.slice(0, 50), drafts: drafts.slice(0, 50), phone, tone, dest, inst })); } catch { /* ignore */ } }, [outs, drafts, phone, tone, dest, inst]);
  useEffect(() => { if (!inst && insts[0]) setInst(insts[0].name); }, [insts, inst]);

  const setStatus = (id: number, status: string) => setOuts((o) => o.map((x) => (x.id === id ? { ...x, status } : x)));
  const cleanPhone = () => phone.replace(/\D/g, "").replace(/^00/, "").replace(/^0(5\d{8})$/, "966$1");

  const route = async (o: Out, d: Dest): Promise<void> => {
    try {
      if (d === "copy") { await navigator.clipboard.writeText(o.text); setStatus(o.id, "📋 انسخ"); toast.success("انسخ ✅"); }
      else if (d === "draft") { setDrafts((x) => [o.text, ...x].slice(0, 50)); setStatus(o.id, "💾 محفوظ مسودة"); toast.success("انحفظ بالمسودات"); }
      else if (d === "campaign") { localStorage.setItem("campaign_draft", o.text); setStatus(o.id, "📢 جاهز بقسم الحملات"); toast.success("افتح تبويب الحملات، الرسالة جاهزة فيه"); }
      else if (d === "wa") {
        const n = cleanPhone();
        if (!inst) { window.open(`https://wa.me/${n}?text=${encodeURIComponent(o.text)}`, "_blank"); setStatus(o.id, "🟢 فُتح واتساب"); return; }
        if (n.length < 8) { toast.error("اكتب رقم المستلم"); return; }
        setRowBusy(o.id); await send({ data: { name: inst, to: n, text: o.text, voice: false } });
        setStatus(o.id, `✅ وصل واتساب ${n}`); toast.success("انرسلت ✅");
      }
    } catch (e) { setStatus(o.id, "❌ فشل الإرسال"); toast.error((e as Error).message); } finally { setRowBusy(null); }
  };

  const go = async (andSend: boolean): Promise<void> => {
    if (order.trim().length < 2) { toast.error("اكتب أمرك أول"); return; }
    setBusy(true);
    try {
      const r = await run({ data: { bot, order, tone } });
      const o: Out = { id: Date.now(), bot: cur?.name ?? "👑 الملكة", order, text: r.text, tone: TONES.find((t) => t[0] === tone)?.[1] ?? "", at: Date.now(), status: "✅ نُفذ (−2 نقطة)" };
      setOuts((x) => [o, ...x].slice(0, 50));
      setOrder("");
      window.dispatchEvent(new Event("wallet-changed"));
      if (andSend && dest !== "none") await route(o, dest);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const spoil = async (o: Out) => {
    setRowBusy(o.id);
    try { const r = await run({ data: { bot: "auto", order: o.text, spoil: true } }); setOuts((x) => x.map((y) => (y.id === o.id ? { ...y, text: r.text, status: "✨ دلّعته (−2 نقطة)" } : y))); window.dispatchEvent(new Event("wallet-changed")); }
    catch (e) { toast.error((e as Error).message); } finally { setRowBusy(null); }
  };

  const mic = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error("المايك يشتغل على متصفح كروم"); return; }
    const r = new SR(); r.lang = "ar-SA"; r.interimResults = false;
    r.onresult = (e: any) => setOrder((o) => (o ? o + " " : "") + e.results[0][0].transcript);
    r.onend = () => setListening(false);
    setListening(true); r.start();
  };

  const listen = async (o: Out) => {
    setRowBusy(o.id);
    try { const a = await speak(o.text.slice(0, 600)); audioRef.current?.pause(); audioRef.current = new Audio(a); await audioRef.current.play(); }
    catch (e) { toast.error((e as Error).message); } finally { setRowBusy(null); }
  };

  const sendVoice = async (o: Out) => {
    const n = cleanPhone();
    if (!inst || n.length < 8) { toast.error("اختر رقم واتساب متصل واكتب رقم المستلم"); return; }
    setRowBusy(o.id);
    try { await send({ data: { name: inst, to: n, text: o.text.slice(0, 600), voice: true } }); setStatus(o.id, `🎙️ وصل فويس لـ ${n}`); toast.success("انرسل فويس ✅"); }
    catch (e) { setStatus(o.id, "❌ فشل الفويس"); toast.error((e as Error).message); } finally { setRowBusy(null); }
  };

  const sendMatched = async (o: Out, c: Clip) => {
    const n = cleanPhone();
    if (!inst || n.length < 8) { toast.error("اختر رقم واتساب متصل واكتب رقم المستلم"); return; }
    setRowBusy(o.id);
    try { await sendClip({ data: { name: inst, number: n, audioId: c.id } }); setStatus(o.id, `🎧 وصل المقطع المسجل لـ ${n}`); toast.success("انرسل المقطع ✅"); }
    catch (e) { toast.error((e as Error).message); } finally { setRowBusy(null); }
  };

  const shown = group === "fun" ? COMPANION_BOTS : BUSINESS_BOTS;
  const sent = outs.filter((o) => o.status.startsWith("✅ وصل") || o.status.startsWith("🎙️") || o.status.startsWith("🎧")).length;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="font-display text-xl">🤖 فريق البوتات — أنتِ تأمرين وهم ينفذون</h2>
        <p className="mt-1 text-sm text-muted-foreground">اختاري رفيقة أو بوت، النبرة، ووين يروح الرد. كل أمر = نقطتين.</p>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-muted p-2"><b className="block text-lg">{outs.length}</b>أوامر</div>
          <div className="rounded-xl bg-muted p-2"><b className="block text-lg">{outs.length * 2}</b>نقطة مخصومة</div>
          <div className="rounded-xl bg-muted p-2"><b className="block text-lg">{sent}</b>وصلت واتساب</div>
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={() => setGroup("fun")} className={`flex-1 rounded-full px-3 py-2 text-sm ${group === "fun" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>🌸 رفيقات السوالف</button>
          <button onClick={() => setGroup("biz")} className={`flex-1 rounded-full px-3 py-2 text-sm ${group === "biz" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>💼 بوتات الأعمال</button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <button onClick={() => setBot("auto")} className={`rounded-xl border-2 p-3 text-right text-sm ${bot === "auto" ? "border-primary bg-secondary" : "border-transparent bg-muted"}`}>
            <b>👑 الملكة — تفهم كل شي</b><div className="text-xs text-muted-foreground">قولي أي طلب وهي تختار الخبرة</div>
          </button>
          {shown.map((b) => (
            <button key={b.id} onClick={() => setBot(b.id)} className={`rounded-xl border-2 p-3 text-right text-sm ${bot === b.id ? "border-primary bg-secondary" : "border-transparent bg-muted"}`}>
              <b>{b.icon} {b.name}</b><div className="text-xs text-muted-foreground">{b.job}</div>
            </button>
          ))}
        </div>

        <p className="mt-4 text-xs font-bold">🎚️ النبرة</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {TONES.map(([id, label]) => (
            <button key={id} onClick={() => setTone(id)} className={`rounded-full px-3 py-1 text-xs ${tone === id ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{label}</button>
          ))}
        </div>

        <p className="mt-3 text-xs font-bold">📍 وين يروح الرد؟</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {DESTS.map(([id, label]) => (
            <button key={id} onClick={() => setDest(id)} className={`rounded-full px-3 py-1 text-xs ${dest === id ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{label}</button>
          ))}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Input dir="ltr" inputMode="tel" placeholder="رقم المستلم مثل 9665xxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <select value={inst} onChange={(e) => setInst(e.target.value)} className="h-10 rounded-md border bg-background px-2 text-sm">
            <option value="">بدون رقم متصل (يفتح واتساب)</option>
            {insts.map((i) => <option key={i.name} value={i.name}>🟢 {i.label}</option>)}
          </select>
        </div>

        <div className="mt-4 space-y-2">
          <Textarea rows={3} value={order} onChange={(e) => setOrder(e.target.value.slice(0, 1500))}
            placeholder={cur?.hint ?? "قولي أي شي: رسالة صباح، رد على زعلان، ذبة، عرض، منشور…"}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void go(false); }} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => go(false)} disabled={busy} className="flex-1">{busy ? "⏳ البوت يشتغل…" : "⚡ نفّذي"}</Button>
            <Button onClick={() => go(true)} disabled={busy || dest === "none"} variant="outline" className="flex-1">🚀 نفّذي وأرسلي</Button>
            <Button variant="secondary" onClick={mic} disabled={listening}>{listening ? "🎙️ أسمعك…" : "🎙️ بالصوت"}</Button>
          </div>
        </div>
      </section>

      {outs.map((o) => {
        const m = bestClip(o.text, clips);
        const b = rowBusy === o.id;
        return (
          <section key={o.id} className="rounded-2xl border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{o.bot} {o.tone && `• ${o.tone}`} • {new Date(o.at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}</span>
              <span className="rounded-full bg-muted px-2 py-0.5">{o.status}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">الأمر: {o.order}</p>
            <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{o.text}</div>
            {m && <p className="mt-2 rounded-lg bg-muted p-2 text-xs">🎧 أقرب مقطع مسجل ({Math.round(m.s * 100)}%): «{m.c.text.slice(0, 80)}» — {m.c.voice_name}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={b} onClick={() => listen(o)}>🔊 معاينة الصوت</Button>
              <Button size="sm" variant="outline" disabled={b} onClick={() => spoil(o)}>✨ دلّعي الرد زيادة</Button>
              <Button size="sm" variant="outline" disabled={b} onClick={() => route(o, "wa")}>🟢 واتساب</Button>
              <Button size="sm" variant="outline" disabled={b} onClick={() => sendVoice(o)}>🎙️ أرسليه فويس</Button>
              {m && <Button size="sm" variant="outline" disabled={b} onClick={() => sendMatched(o, m.c)}>🎧 أرسلي المقطع المسجل</Button>}
              <Button size="sm" variant="outline" onClick={() => route(o, "campaign")}>📢 للحملات</Button>
              <Button size="sm" variant="outline" onClick={() => route(o, "copy")}>📋 نسخ</Button>
              <Button size="sm" variant="outline" onClick={() => route(o, "draft")}>💾 مسودة</Button>
            </div>
          </section>
        );
      })}

      {drafts.length > 0 && (
        <section className="rounded-2xl border bg-card p-5">
          <h3 className="font-bold">💾 المسودات ({drafts.length})</h3>
          <div className="mt-2 space-y-2">
            {drafts.map((d, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-muted p-2 text-sm">
                <p className="flex-1 whitespace-pre-wrap">{d}</p>
                <button className="text-xs" onClick={() => setOrder(d)}>✏️</button>
                <button className="text-xs" onClick={() => { void navigator.clipboard.writeText(d); toast.success("انسخ"); }}>📋</button>
                <button className="text-xs" onClick={() => setDrafts((x) => x.filter((_, j) => j !== i))}>🗑️</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
