import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { phoneToken, phoneCallerIds, phoneVerifyStart, phoneVerifyConfirm } from "@/lib/phone.functions";
import { listClips, clipUrl, vaultSpeak, type CallClip } from "@/lib/call-vault";
import { fishSpeak } from "@/lib/ai.functions";
import { STUDIO_VOICES } from "@/lib/studio-voices";
import { getStudioVoice } from "@/lib/voice-model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Volume2, Mic, Square, Play } from "lucide-react";
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
  const micEnabled = useRef(true), callActive = useRef(false);
  const [volume, setVolume] = useState(20);
  const volumeRef = useRef(0.2), monitor = useRef<GainNode | null>(null);
  const remoteSource = useRef<MediaElementAudioSourceNode | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const [previewText, setPreviewText] = useState("");
  const [previewListening, setPreviewListening] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const previewRef = useRef(false), previewEpoch = useRef(0);
  const previewSource = useRef<AudioBufferSourceNode | null>(null);
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
  async function prepareAudio() {
    const ctx = (ac.current ??= new AudioContext());
    await ctx.resume();
    if (!monitor.current) {
      monitor.current = ctx.createGain();
      monitor.current.gain.value = volumeRef.current;
      monitor.current.connect(ctx.destination);
    }
    if (remote.current && !remoteSource.current) {
      remoteSource.current = ctx.createMediaElementSource(remote.current);
      remoteSource.current.connect(monitor.current);
    }
    return ctx;
  }
  function changeVolume(value: number) {
    setVolume(value); volumeRef.current = value / 100;
    if (monitor.current) monitor.current.gain.value = volumeRef.current;
  }
  function syncMic() {
    const enabled = callActive.current && micEnabled.current && !nadaRef.current;
    if (micGain.current) micGain.current.gain.value = enabled ? 1 : 0;
    micStream.current?.getAudioTracks().forEach(track => { track.enabled = enabled; });
    // A recovered SDK sender must never bypass the controlled mixer.
    const expected = dest.current?.stream.getAudioTracks()[0];
    const senders: RTCRtpSender[] = call.current?.peer?.instance?.getSenders() ?? [];
    senders.forEach(sender => { if (sender.track?.kind === "audio" && sender.track !== expected) sender.track.enabled = false; });
  }
  async function bindCallAudio(required = false) {
    const currentCall = call.current, destination = dest.current;
    const track = destination?.stream.getAudioTracks()[0];
    const senders: RTCRtpSender[] = currentCall?.peer?.instance?.getSenders() ?? [];
    const transceivers: RTCRtpTransceiver[] = currentCall?.peer?.instance?.getTransceivers?.() ?? [];
    const sender = senders.find(item => item.track?.kind === "audio")
      ?? transceivers.find(item => item.receiver.track?.kind === "audio" && item.receiver.track.readyState !== "ended")?.sender;
    if (!destination || !track || track.readyState !== "live" || !sender) {
      if (required) throw new Error("مسار صوت العميل مو جاهز، أعد الاتصال");
      return;
    }
    if (sender.track !== track) {
      const previous = sender.track;
      if (previous) previous.enabled = false;
      await sender.replaceTrack(track);
      if (call.current !== currentCall || dest.current !== destination) return;
      if (currentCall.options) currentCall.options.localStream = destination.stream;
    }
    track.enabled = true;
    syncMic();
  }
  function stopPreview() {
    previewEpoch.current++; previewRef.current = false;
    stopNada(); setPreviewListening(false); setPreviewBusy(false);
    try { previewSource.current?.stop(); } catch { /* already ended */ }
    previewSource.current = null;
  }
  async function testVoice() {
    if (!previewText.trim() || inCall) return;
    stopPreview();
    setPreviewError("");
    try { await prepareAudio(); sayAsNada(previewText, voiceModeRef.current, "preview"); }
    catch { toast.error("تعذر تشغيل الصوت"); }
  }
  async function testMic() {
    if (inCall) return;
    stopPreview();
    setPreviewError("");
    try { await prepareAudio(); previewRef.current = true; startNada(); }
    catch { toast.error("تعذر تشغيل المايك"); }
  }
  function sayAsNada(text: string, mode = voiceModeRef.current, target: "call" | "preview" = "call") {
    const t = text.trim(); if (!t) return;
    const epoch = previewEpoch.current;
    const callDestination = target === "call" ? dest.current : null;
    if (target === "preview") setPreviewBusy(true);
    const v = liveVoice();
    const profile = phoneVoiceProfile(mode);
    const src = vaultSpeak(t.slice(0, 600), { voiceId: v.id, model: v.model, speed: v.speed, emotion: v.emotion, ...("synthesisProfile" in profile ? { synthesisProfile: profile.synthesisProfile } : {}) }, async () => {
      const r = await fishSpeak({ data: { text: t.slice(0, 600), voiceId: v.id, custom: true, model: v.model, speed: v.speed, volume: v.gain, emotion: v.emotion, stable: profile.stable } as any });
      return String((r as any).audio);
    });
    // Handle generation rejection immediately, even while a previous sentence is playing.
    const generated = Promise.resolve(src).then(url => ({ url }), error => ({ error }));
    sayQ.current = sayQ.current.then(async () => {
      try {
        const result = await generated;
        if ("error" in result) throw result.error;
        if (target === "preview" && epoch !== previewEpoch.current) return;
        if (target === "call" && (!callActive.current || dest.current !== callDestination)) return;
        const ctx = ac.current;
        if (!ctx || (target === "call" && !dest.current)) return;
        const response = await fetch(result.url);
        const buf = await ctx.decodeAudioData(await response.arrayBuffer());
        if (target === "preview" && epoch !== previewEpoch.current) return;
        if (target === "call" && (!callActive.current || dest.current !== callDestination)) return;
        await ctx.resume();
        if (target === "call") await bindCallAudio(true);
        if (target === "call" && (!callActive.current || dest.current !== callDestination)) return;
        const source = ctx.createBufferSource(); source.buffer = buf;
        if (target === "preview") {
          if (!monitor.current) return;
          source.connect(monitor.current); previewSource.current = source;
        } else if (dest.current) source.connect(dest.current);
        await new Promise<void>((resolve) => { source.onended = () => resolve(); source.start(); });
      } catch (e) {
        const message = "ما طلع الصوت: " + (e as Error).message;
        if (target === "preview" && epoch === previewEpoch.current) setPreviewError(message);
        toast.error(message);
      }
      finally { if (target === "preview" && epoch === previewEpoch.current) { setPreviewBusy(false); previewSource.current = null; } }
    });
  }
  function startNada() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error("المتصفح ما يدعم التحدث، استخدم كروم"); return; }
    const preview = previewRef.current;
    nadaRef.current = true;
    if (preview) setPreviewListening(true);
    else { setNadaMode(true); micEnabled.current = false; setMicOn(false); }
    syncMic();
    if (!preview) void bindCallAudio().catch(() => toast.error("تعذر توصيل صوت أم ندى للعميل"));
    const mode = voiceModeRef.current, profile = phoneVoiceProfile(mode);
    const r = new SR(); r.lang = "ar-SA"; r.continuous = profile.continuous; r.interimResults = profile.interimResults; r.maxAlternatives = profile.maxAlternatives; rec.current = r;
    r.onresult = (e: any) => {
      if (rec.current !== r || !nadaRef.current) return;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) { const x = e.results[i]; const t = x[0]?.transcript ?? ""; if (x.isFinal) {
        if (preview) {
          nadaRef.current = false; previewRef.current = false; setPreviewListening(false);
          try { r.stop(); } catch { /* */ }
          setPreviewText(t); setHeard(""); sayAsNada(t, mode, "preview");
        } else { setHeard(""); sayAsNada(t, mode); }
      } else interim += t; }
      if (interim) setHeard(interim);
    };
    r.onend = () => { if (nadaRef.current && rec.current === r) startNada(); };
    r.onerror = (e: any) => { if (rec.current !== r || !nadaRef.current) return; if (["not-allowed", "service-not-allowed", "audio-capture"].includes(e.error)) { stopPreview(); toast.error("تعذر سماعك، تأكد من إذن المايك"); } };
    try { r.start(); } catch { stopPreview(); toast.error("تعذر بدء الاستماع"); }
  }
  function stopNada() { nadaRef.current = false; previewRef.current = false; setNadaMode(false); setPreviewListening(false); setHeard(""); const previous = rec.current; rec.current = null; try { previous?.stop(); } catch { /* */ } syncMic(); }
  function changeVoiceMode(mode: PhoneVoiceMode) {
    if (mode === voiceModeRef.current) return;
    voiceModeRef.current = mode; setVoiceMode(mode); setHeard("");
    // Finish the current utterance with its original settings; restart in the new mode.
    if (nadaRef.current) { try { rec.current?.stop(); } catch { startNada(); } }
  }
  useEffect(() => () => {
    nadaRef.current = false; previewEpoch.current++; callActive.current = false;
    try { rec.current?.stop(); previewSource.current?.stop(); } catch { /* */ }
    micStream.current?.getTracks().forEach(track => track.stop());
    void ac.current?.close();
  }, []);

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
    const ctx = await prepareAudio();
    // Telnyx stops local tracks on hangup; never reuse a finished destination.
    micStream.current?.getTracks().forEach(track => track.stop());
    micGain.current?.disconnect();
    dest.current?.stream.getTracks().forEach(track => track.stop());
    dest.current = null;
    const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    micStream.current = mic;
    dest.current = ctx.createMediaStreamDestination();
    micGain.current = ctx.createGain();
    micGain.current.gain.value = 0;
    ctx.createMediaStreamSource(mic).connect(micGain.current).connect(dest.current);
    syncMic();
    return dest.current.stream;
  }

  async function dial() {
    const to = toE164(num, cc);
    if (to.length < 8) { toast.error("اكتب رقم صحيح"); return; }
    try {
      stopPreview(); callActive.current = false; syncMic();
      client.current?.disconnect(); call.current = null;
      setState("يجهز الخط…");
      const [{ token, balance: bal, from }, stream, mod] = await Promise.all([phoneToken(), mixedStream(), import("@telnyx/webrtc")]);
      setBalance(bal);
      const m: any = mod; const TelnyxRTC = m.TelnyxRTC ?? m.default?.TelnyxRTC;
      if (!TelnyxRTC) throw new Error("تعذر تحميل الهاتف");
      const caller = fromNum || from;
      const c = new TelnyxRTC({ login_token: token });
      client.current = c;
      c.on("telnyx.error", (e: any) => { if (client.current !== c) return; setState("خطأ في الخط: " + (e?.error?.message ?? e?.message ?? "")); setInCall(false); callActive.current = false; stopNada(); syncMic(); });
      c.on("telnyx.notification", (n: any) => {
        if (client.current !== c) return;
        const cl = n.call; if (!cl) return;
        call.current = cl;
        if (remote.current && cl.remoteStream) remote.current.srcObject = cl.remoteStream;
        const s = cl.state as string;
        callActive.current = s === "active"; syncMic();
        if (callActive.current) void bindCallAudio().catch(() => toast.error("تعذر توصيل صوت أم ندى للعميل"));
        if (remote.current && cl.remoteStream) void remote.current.play().catch(() => toast.error("اضغط على مستوى الصوت لتفعيل السماعة"));
        setState(s === "active" ? "🟢 متصل — تسمعه ويسمعك" : s === "ringing" || s === "trying" || s === "early" ? "📞 يرن…" : s === "hangup" || s === "destroy" ? "انتهت المكالمة" + (cl.cause && cl.cause !== "NORMAL_CLEARING" ? ` (${cl.cause})` : "") : s);
        if (s === "hangup" || s === "destroy") { stopNada(); setInCall(false); call.current = null; }
      });
      c.on("telnyx.ready", () => {
        if (client.current !== c) return;
        call.current = c.newCall({ destinationNumber: to, callerNumber: caller, callerName: "Um Nada", localStream: stream, audio: true, video: false } as any);
        setInCall(true);
      });
      c.connect();
    } catch (e) { callActive.current = false; syncMic(); setState("جاهز"); toast.error((e as Error).message); }
  }

  function hangup() { callActive.current = false; stopNada(); try { call.current?.hangup(); } catch { /* */ } setInCall(false); setState("انتهت المكالمة"); }
  function toggleMic() { if (nadaRef.current) { toast("أنت في وضع صوت أم ندى — مايكك مقفول عن العميل"); return; } const v = !micOn; setMicOn(v); micEnabled.current = v; syncMic(); }

  async function inject(c: CallClip) {
    if (!ac.current || !dest.current || !callActive.current) { toast.error("انتظر العميل يرد أول"); return; }
    const destination = dest.current;
    try {
      const buf = await ac.current.decodeAudioData(await (await fetch(await clipUrl(c))).arrayBuffer());
      if (!callActive.current || dest.current !== destination) return;
      await ac.current.resume(); await bindCallAudio(true);
      if (!callActive.current || dest.current !== destination) return;
      const src = ac.current.createBufferSource(); src.buffer = buf;
      src.connect(destination); if (monitor.current) src.connect(monitor.current); src.start();
    } catch { toast.error("تعذر توصيل الصوت للعميل"); }
  }

  const shown = clips.filter((c) => !q || c.text.includes(q)).slice(0, 60);
  return (
    <div className="space-y-4 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">📞 الهاتف المباشر</h2>
        {balance && <span className="text-xs text-muted-foreground">رصيد الخط: ${balance}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <select value={cc} onChange={(e) => setCc(e.target.value)} className="rounded-md border bg-background px-2 text-sm">
          {COUNTRIES.map((x) => <option key={x.c} value={x.c}>{x.n} +{x.c}</option>)}
        </select>
        <Input className="min-w-0 flex-1" dir="ltr" inputMode="tel" placeholder="رقم العميل" value={num} onChange={(e) => setNum(e.target.value)} />
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
      <div className="space-y-2">
        <label htmlFor="phone-volume" className="flex items-center gap-2 text-sm"><Volume2 className="size-4" /> صوت السماعة والرنين <span dir="ltr">{volume}%</span></label>
        <Input id="phone-volume" type="range" min="0" max="100" value={volume} className="h-8 cursor-pointer border-0 px-0 accent-primary" onChange={e => changeVolume(Number(e.target.value))} onPointerDown={() => { void ac.current?.resume(); void remote.current?.play().catch(() => {}); }} />
      </div>
      <div className="space-y-2 rounded-xl border border-primary/40 p-3">
        <div role="group" aria-label="وضع صوت الهاتف" className="grid grid-cols-2 gap-2">
          <Button size="sm" variant={voiceMode === "previous" ? "default" : "outline"} aria-pressed={voiceMode === "previous"} onClick={() => changeVoiceMode("previous")}>السابق — ثابت</Button>
          <Button size="sm" variant={voiceMode === "developed" ? "default" : "outline"} aria-pressed={voiceMode === "developed"} onClick={() => changeVoiceMode("developed")}>المطوّر — طبيعي</Button>
        </div>
        <section aria-label="اختبار النطق قبل الاتصال" className="space-y-2 border-b pb-3">
          <h3 className="text-sm font-bold">اختبار النطق قبل الاتصال</h3>
          <Input aria-label="نص اختبار النطق" placeholder="اكتب جملة للاختبار" value={previewText} disabled={inCall} onChange={e => setPreviewText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void testVoice(); }} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={inCall || previewBusy || previewListening} onClick={() => void testMic()}><Mic className="size-4" /> اختبار المايك</Button>
            <Button size="sm" disabled={inCall || !previewText.trim() || previewBusy || previewListening} onClick={() => void testVoice()}><Play className="size-4" /> اسمع الاختبار</Button>
            {(previewListening || previewBusy) && <Button size="sm" variant="outline" onClick={stopPreview}><Square className="size-4" /> إيقاف الاختبار</Button>}
          </div>
          <p role="status" className="text-xs text-muted-foreground">{previewListening ? (heard || "أسمعك…") : previewBusy ? "يجهّز النطق…" : ""}</p>
          {previewError && <p role="alert" className="text-xs text-destructive">{previewError}</p>}
          <p className="text-xs text-muted-foreground">توليد صوت جديد قد يستهلك من رصيد مزوّد الصوت.</p>
        </section>
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
