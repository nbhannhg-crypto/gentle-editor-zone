import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { phoneToken } from "@/lib/phone.functions";
import { listClips, clipUrl, type CallClip } from "@/lib/call-vault";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Browser phone: owner hears the customer, talks via mic, and injects Um Nada vault clips into the call.
function toE164(n: string) {
  const d = n.replace(/[^\d+]/g, "").replace(/^00/, "+");
  if (d.startsWith("+")) return d;
  if (d.startsWith("05")) return "+966" + d.slice(1);
  if (d.startsWith("5") && d.length === 9) return "+966" + d;
  if (d.startsWith("966")) return "+" + d;
  return d;
}

export function WebPhone() {
  const [num, setNum] = useState("");
  const [state, setState] = useState("جاهز");
  const [inCall, setInCall] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [balance, setBalance] = useState("");
  const [clips, setClips] = useState<CallClip[]>([]);
  const [q, setQ] = useState("");
  const client = useRef<any>(null), call = useRef<any>(null);
  const ac = useRef<AudioContext | null>(null), dest = useRef<MediaStreamAudioDestinationNode | null>(null);
  const micGain = useRef<GainNode | null>(null), remote = useRef<HTMLAudioElement>(null);

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
    const to = toE164(num);
    if (to.length < 8) { toast.error("اكتب رقم صحيح"); return; }
    try {
      setState("يجهز الخط…");
      const [{ token, balance: bal }, stream, { TelnyxRTC }] = await Promise.all([phoneToken(), mixedStream(), import("@telnyx/webrtc")]);
      setBalance(bal);
      client.current?.disconnect();
      const c = new TelnyxRTC({ login_token: token });
      client.current = c;
      c.on("telnyx.error", () => { setState("خطأ في الخط"); setInCall(false); });
      c.on("telnyx.notification", (n: any) => {
        const cl = n.call; if (!cl) return;
        if (remote.current && cl.remoteStream) remote.current.srcObject = cl.remoteStream;
        const s = cl.state as string;
        setState(s === "active" ? "🟢 متصل — تسمعه ويسمعك" : s === "ringing" || s === "trying" || s === "early" ? "📞 يرن…" : s === "hangup" || s === "destroy" ? "انتهت المكالمة" : s);
        if (s === "hangup" || s === "destroy") { setInCall(false); call.current = null; }
      });
      c.on("telnyx.ready", () => {
        call.current = c.newCall({ destinationNumber: to, localStream: stream, audio: true, video: false } as any);
        setInCall(true);
      });
      c.connect();
    } catch (e) { setState("جاهز"); toast.error((e as Error).message); }
  }

  function hangup() { try { call.current?.hangup(); } catch { /* */ } setInCall(false); setState("انتهت المكالمة"); }
  function toggleMic() { const v = !micOn; setMicOn(v); if (micGain.current) micGain.current.gain.value = v ? 1 : 0; }

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
        <Input dir="ltr" inputMode="tel" placeholder="05xxxxxxxx" value={num} onChange={(e) => setNum(e.target.value)} />
        {inCall ? <Button variant="destructive" onClick={hangup}>إنهاء</Button> : <Button onClick={dial}>اتصال</Button>}
      </div>
      <div className="flex items-center justify-between rounded-xl bg-muted px-3 py-2 text-sm">
        <span>{state}</span>
        <Button size="sm" variant="outline" onClick={toggleMic}>{micOn ? "🎙️ مايكي شغال" : "🔇 مايكي مكتوم"}</Button>
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
