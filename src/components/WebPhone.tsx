import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { phoneToken, phoneCallerIds, phoneVerifyStart, phoneVerifyConfirm } from "@/lib/phone.functions";
import { listClips, clipUrl, vaultSpeak, type CallClip } from "@/lib/call-vault";
import { fishSpeak } from "@/lib/ai.functions";
import { STUDIO_VOICES } from "@/lib/studio-voices";
import { getStudioVoice } from "@/lib/voice-model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { phoneVoiceProfile, type PhoneVoiceMode } from "@/lib/phone-voice-mode";

// Browser phone: owner hears the customer, talks via mic, and injects Um Nada vault clips into the call.
const COUNTRIES = [
  { c: "966", n: "🇸🇦 السعودية" }, { c: "967", n: "🇾🇪 اليمن" }, { c: "971", n: "🇦🇪 الإمارات" }, { c: "965", n: "🇰🇼 الكويت" },
  { c: "974", n: "🇶🇦 قطر" }, { c: "973", n: "🇧🇭 البحرين" }, { c: "968", n: "🇴🇲 عمان" }, { c: "20", n: "🇪🇬 مصر" },
  { c: "962", n: "🇯🇴 الأردن" }, { c: "90", n: "🇹🇷 تركيا" }, { c: "44", n: "🇬🇧 بريطانيا" }, { c: "1", n: "🇺🇸 أمريكا/كندا" },
];
// Any country: "+"/"00" numbers pass as-is; local numbers get the chosen country code (leading 0 dropped).
function toE164(n: string, cc = "966") {
  const d = n.replace(/[^\d+]/g, "").replace(/^00/, "+");
  if (d.startsWith("+")) return d;
  if (d.startsWith(cc) && d.length > cc.length + 7) return "+" + d;
  return "+" + cc + d.replace(/^0+/, "");
}

export function WebPhone() {
  const [num, setNum] = useState("");
  const [fromNum, setFromNum] = useState("");
  const [cc, setCc] = useState("966");
  const [ids, setIds] = useState<{ owned: string[]; verified: string[] }>({ owned: [], verified: [] });
  const [vNum, setVNum] = useState(""), [vCode, setVCode] = useState(""), [vSent, setVSent] = useState(false), [vBusy, setVBusy] = useState(false);
  const [state, setState] = useState("جاهز");
  const [inCall, setInCall] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [balance, setBalance] = useState("");
  const [clips, setClips] = useState<CallClip[]>([]);
  const [q, setQ] = useState("");
  const client = useRef<any>(null), call = useRef<any>(null);
  const ac = useRef<AudioContext | null>(null), dest = useRef<MediaStreamAudioDestinationNode | null>(null);
  const micGain = useRef<GainNode | null>(null), remote = useRef<HTMLAudioElement>(null);
  // 🎙️➡️👩 Voice mode: owner speaks, mic is cut from the call, each sentence is spoken to the customer in Um Nada's voice (same engine as LiveStudio).
  const [nadaMode, setNadaMode] = useState(false), [heard, setHeard] = useState(""), [typed, setTyped] = useState("");
  const nadaRef = useRef(false), rec = useRef<any>(null), sayQ = useRef<Promise<void>>(Promise.resolve());
  const [voiceMode, setVoiceMode] = useState<PhoneVoiceMode>("previous");
  const voiceModeRef = useRef<PhoneVoiceMode>("previous");
  function liveVoice() {
    let v: any = {}; try { v = JSON.parse(localStorage.getItem("live_studio_v1") || "{}").voice ?? {}; } catch { /* */ }
    return { id: getStudioVoice() || v.id || STUDIO_VOICES[0]?.[0] || "", model: String(v.model || "s2.1-pro"), speed: Number(v.speed || 1), gain: Number(v.gain || 0), emotion: String(v.emotion || "") };
  }
  function sayAsNada(text: string, mode = voiceModeRef.current) {
    const t = text.trim(); if (!t) return;
    const v = liveVoice();
    const profile = phoneVoiceProfile(mode);
    const src = vaultSpeak(t.slice(0, 600), { voiceId: v.id, model: v.model, speed: v.speed, emotion: v.emotion, ...("synthesisProfile" in profile ? { synthesisProfile: profile.synthesisProfile } : {}) }, async () => {
      const r = await fishSpeak({ data: { text: t.slice(0, 600), voiceId: v.id, custom: true, model: v.model, speed: v.speed, volume: v.gain, emotion: v.emotion, stable: profile.stable } as any });
      return String((r as any).audio);
    });
    sayQ.current = sayQ.current.then(async () => {
      try {
        if (!ac.current || !dest.current) return;
        const buf = await ac.current.decodeAudioData(await (await fetch(await src)).arrayBuffer());
        const s = ac.current.createBufferSource(); s.buffer = buf; s.connect(dest.current); s.start();
        await new Promise((r) => (s.onended = r));
      } catch (e) { toast.error("ما طلع الصوت: " + (e as Error).message); }
    });
  }
  function startNada() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error("المتصفح ما يدعم التحدث، استخدم كروم"); return; }
    nadaRef.current = true; setNadaMode(true);
    if (micGain.current) micGain.current.gain.value = 0; setMicOn(false);
    const mode = voiceModeRef.current, profile = phoneVoiceProfile(mode);
    const r = new SR(); r.lang = "ar-SA"; r.continuous = profile.continuous; r.interimResults = profile.interimResults; r.maxAlternatives = profile.maxAlternatives; rec.current = r;
    r.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) { const x = e.results[i]; const t = x[0]?.transcript ?? ""; if (x.isFinal) { setHeard(""); sayAsNada(t, mode); } else interim += t; }
      if (interim) setHeard(interim);
    };
    r.onend = () => { if (nadaRef.current && rec.current === r) startNada(); };
    r.onerror = (e: any) => { if (["not-allowed", "service-not-allowed", "audio-capture"].includes(e.error)) { stopNada(); toast.error("تعذر سماعك، تأكد من إذن المايك"); } };
    try { r.start(); } catch { /* */ }
  }
  function stopNada() { nadaRef.current = false; setNadaMode(false); setHeard(""); try { rec.current?.stop(); } catch { /* */ } }
  function changeVoiceMode(mode: PhoneVoiceMode) {
    if (mode === voiceModeRef.current) return;
    voiceModeRef.current = mode; setVoiceMode(mode); setHeard("");
    // Finish the current utterance with its original settings; restart in the new mode.
    if (nadaRef.current) { try { rec.current?.stop(); } catch { startNada(); } }
  }
  useEffect(() => () => { nadaRef.current = false; try { rec.current?.stop(); } catch { /* */ } }, []);

  // Default caller ID: the owner's verified Saudi number (US numbers get blocked by Saudi/Yemeni carriers).
  const loadIds = () => phoneCallerIds().then((r) => {
    setIds(r);
    const sa = [...r.verified, ...r.owned].find((n) => n.startsWith("+966")) ?? r.verified[0];
    if (sa) setFromNum((cur) => cur || sa);
  }).catch(() => {});
  useEffect(() => { loadIds(); }, []);
  async function sendCode(method: "sms" | "call") {
    setVBusy(true);
    try { await phoneVerifyStart({ data: { number: toE164(vNum, cc), method } }); setVSent(true); toast.success(method === "sms" ? "وصلك كود برسالة" : "بيجيك اتصال فيه الكود"); }
    catch (e) { toast.error((e as Error).message); } finally { setVBusy(false); }
  }
  async function confirmCode() {
    setVBusy(true);
    try { const n = toE164(vNum, cc); await phoneVerifyConfirm({ data: { number: n, code: vCode } }); toast.success("تم توثيق الرقم ✅"); setVSent(false); setVCode(""); setVNum(""); await loadIds(); setFromNum(n); }
    catch (e) { toast.error((e as Error).message); } finally { setVBusy(false); }
  }

  useEffect(() => { listClips().then(setClips).catch(() => {}); return () => { try { call.current?.hangup(); client.current?.disconnect(); } catch { /* */ } }; }, []);

  async function mixedStream() {
    const ctx = (ac.current ??= new AudioContext());
    await ctx.resume();
    if (!dest.current) {
      dest.current = ctx.createMediaStreamDestination();
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      micGain.current = ctx.createGain();
      ctx.createMediaStreamSource(mic).connect(micGain.current).connect(dest.current);
    }
    return dest.current.stream;
  }

  async function dial() {
    const to = toE164(num, cc);
    if (to.length < 8) { toast.error("اكتب رقم صحيح"); return; }
    try {
      setState("يجهز الخط…");
      const [{ token, balance: bal, from }, stream, mod] = await Promise.all([phoneToken(), mixedStream(), import("@telnyx/webrtc")]);
      setBalance(bal);
      const m: any = mod; const TelnyxRTC = m.TelnyxRTC ?? m.default?.TelnyxRTC;
      if (!TelnyxRTC) throw new Error("تعذر تحميل الهاتف");
      const caller = fromNum || from;
      client.current?.disconnect();
      const c = new TelnyxRTC({ login_token: token });
      client.current = c;
      c.on("telnyx.error", (e: any) => { setState("خطأ في الخط: " + (e?.error?.message ?? e?.message ?? "")); setInCall(false); });
      c.on("telnyx.notification", (n: any) => {
        const cl = n.call; if (!cl) return;
        if (remote.current && cl.remoteStream) remote.current.srcObject = cl.remoteStream;
        const s = cl.state as string;
        setState(s === "active" ? "🟢 متصل — تسمعه ويسمعك" : s === "ringing" || s === "trying" || s === "early" ? "📞 يرن…" : s === "hangup" || s === "destroy" ? "انتهت المكالمة" + (cl.cause && cl.cause !== "NORMAL_CLEARING" ? ` (${cl.cause})` : "") : s);
        if (s === "hangup" || s === "destroy") { stopNada(); setInCall(false); call.current = null; }
      });
      c.on("telnyx.ready", () => {
        call.current = c.newCall({ destinationNumber: to, callerNumber: caller, callerName: "Um Nada", localStream: stream, audio: true, video: false } as any);
        setInCall(true);
      });
      c.connect();
    } catch (e) { setState("جاهز"); toast.error((e as Error).message); }
  }

  function hangup() { stopNada(); try { call.current?.hangup(); } catch { /* */ } setInCall(false); setState("انتهت المكالمة"); }
  function toggleMic() { if (nadaRef.current) { toast("أنت في وضع صوت أم ندى — مايكك مقفول عن العميل"); return; } const v = !micOn; setMicOn(v); if (micGain.current) micGain.current.gain.value = v ? 1 : 0; }

  async function inject(c: CallClip) {
    if (!ac.current || !dest.current) { toast.error("اتصل أول"); return; }
    const buf = await ac.current.decodeAudioData(await (await fetch(await clipUrl(c))).arrayBuffer());
    const src = ac.current.createBufferSource(); src.buffer = buf;
    src.connect(dest.current); src.connect(ac.current.destination); src.start();
  }

  const shown = clips.filter((c) => !q || c.text.includes(q)).slice(0, 60);
  return (
    <div className="space-y-4 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">📞 الهاتف المباشر</h2>
        {balance && <span className="text-xs text-muted-foreground">رصيد الخط: ${balance}</span>}
      </div>
      <div className="flex gap-2">
        <select value={cc} onChange={(e) => setCc(e.target.value)} className="rounded-md border bg-background px-2 text-sm">
          {COUNTRIES.map((x) => <option key={x.c} value={x.c}>{x.n} +{x.c}</option>)}
        </select>
        <Input dir="ltr" inputMode="tel" placeholder="رقم العميل" value={num} onChange={(e) => setNum(e.target.value)} />
        {inCall ? <Button variant="destructive" onClick={hangup}>إنهاء</Button> : <Button onClick={dial}>اتصال</Button>}
      </div>
      <label className="block text-xs text-muted-foreground">الرقم اللي يطلع للعميل</label>
      <select dir="ltr" value={fromNum} onChange={(e) => setFromNum(e.target.value)} className="w-full rounded-md border bg-background p-2 text-sm">
        <option value="">الافتراضي</option>
        {ids.verified.map((n) => <option key={n} value={n}>✅ {n} (رقمك الموثّق)</option>)}
        {ids.owned.map((n) => <option key={n} value={n}>{n} (رقم الخط)</option>)}
      </select>
      <details className="rounded-xl border p-3 text-sm">
        <summary className="cursor-pointer font-bold">➕ وثّق رقم جديد عشان يطلع للعميل</summary>
        <p className="my-2 text-xs text-muted-foreground">شركات الاتصال ترفض أي رقم غير موثّق وتقول «رقمك لا يتوافق مع الخدمة». اكتب رقمك، يجيك كود، تدخله ويصير جاهز.</p>
        <Input dir="ltr" inputMode="tel" placeholder="رقمك (يُستخدم مفتاح الدولة المختار)" value={vNum} onChange={(e) => setVNum(e.target.value)} className="mb-2" />
        {!vSent ? (
          <div className="flex gap-2">
            <Button size="sm" disabled={vBusy || !vNum} onClick={() => sendCode("sms")}>كود برسالة</Button>
            <Button size="sm" variant="outline" disabled={vBusy || !vNum} onClick={() => sendCode("call")}>كود باتصال</Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input dir="ltr" inputMode="numeric" placeholder="الكود" value={vCode} onChange={(e) => setVCode(e.target.value)} />
            <Button size="sm" disabled={vBusy || !vCode} onClick={confirmCode}>تأكيد</Button>
          </div>
        )}
      </details>
      <div className="flex items-center justify-between rounded-xl bg-muted px-3 py-2 text-sm">
        <span>{state}</span>
        <Button size="sm" variant="outline" onClick={toggleMic}>{micOn ? "🎙️ مايكي شغال" : "🔇 مايكي مكتوم"}</Button>
      </div>
      <div className="space-y-2 rounded-xl border border-primary/40 p-3">
        <div role="group" aria-label="وضع صوت الهاتف" className="grid grid-cols-2 gap-2">
          <Button size="sm" variant={voiceMode === "previous" ? "default" : "outline"} aria-pressed={voiceMode === "previous"} onClick={() => changeVoiceMode("previous")}>السابق — ثابت</Button>
          <Button size="sm" variant={voiceMode === "developed" ? "default" : "outline"} aria-pressed={voiceMode === "developed"} onClick={() => changeVoiceMode("developed")}>المطوّر — طبيعي</Button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div><p className="text-sm font-bold">👩 تكلم بصوتك ويوصله صوت أم ندى</p><p className="text-xs text-muted-foreground">مايكك ما يوصل للعميل، كل جملة تقولها تنطق له بصوت أم ندى وأنت تسمعه.</p></div>
          {nadaMode ? <Button size="sm" variant="destructive" onClick={stopNada}>إيقاف</Button> : <Button size="sm" onClick={() => { if (!inCall) { toast.error("اتصل أول"); return; } startNada(); }}>تشغيل</Button>}
        </div>
        {nadaMode && <p className="text-xs">{heard ? `🎙️ ${heard}` : "🎙️ أسمعك… تكلم"}</p>}
        <div className="flex gap-2">
          <Input placeholder="أو اكتب جملة وتنطق فوراً" value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && typed.trim()) { if (!inCall) { toast.error("اتصل أول"); return; } sayAsNada(typed); setTyped(""); } }} />
          <Button size="sm" variant="outline" disabled={!typed.trim()} onClick={() => { if (!inCall) { toast.error("اتصل أول"); return; } sayAsNada(typed); setTyped(""); }}>انطق</Button>
        </div>
      </div>
      <audio ref={remote} autoPlay />
      <div>
        <p className="mb-2 text-sm font-bold">💾 أصوات أم ندى — اضغط يدخل الصوت للمكالمة</p>
        <Input placeholder="ابحث في الأصوات…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2" />
        <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto overscroll-contain">
          {shown.map((c) => <button key={c.id} onClick={() => inject(c)} className="rounded-lg border p-2 text-right text-xs hover:bg-accent">{c.text}</button>)}
          {!shown.length && <p className="col-span-2 text-xs text-muted-foreground">ما فيه أصوات محفوظة بعد.</p>}
        </div>
      </div>
    </div>
  );
}
