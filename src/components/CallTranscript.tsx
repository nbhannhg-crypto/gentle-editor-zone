import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addRule } from "@/lib/rules";

export type TMsg = { who: "c" | "a"; t: string };
type Saved = { id: string; at: number; log: TMsg[]; hasAudio: boolean };

// ---- تخزين محلي معزول لكل متجر (المكالمات + التسجيلات الصوتية) ----
const DB = "call-archive";
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("audio");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function putAudio(key: string, b: Blob) {
  const d = await db();
  await new Promise<void>((res, rej) => { const tx = d.transaction("audio", "readwrite"); tx.objectStore("audio").put(b, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}
async function getAudio(key: string): Promise<Blob | undefined> {
  const d = await db();
  return new Promise((res) => { const q = d.transaction("audio").objectStore("audio").get(key); q.onsuccess = () => res(q.result as Blob | undefined); q.onerror = () => res(undefined); });
}
async function delAudio(key: string) {
  const d = await db();
  d.transaction("audio", "readwrite").objectStore("audio").delete(key);
}
const listKey = (store: string, kind: string) => `call-archive:${store}:${kind}`;
const loadList = (k: string): Saved[] => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };

/** محادثة متسلسلة مثل الواتساب + تعليم من الرسالة + تسجيل صوتي + أرشيف. */
export function CallTranscript({ log, setLog, storeId, kind, live, onSay, reload, onTaught }: {
  log: TMsg[]; setLog: (f: (l: TMsg[]) => TMsg[]) => void; storeId?: string | undefined; kind: "kcall" | "live";
  live: boolean; onSay?: (t: string) => void; reload?: () => Promise<void> | void; onTaught?: (q: string, a: string) => void;
}) {
  const store = storeId || "default";
  const lk = listKey(store, kind);
  const [open, setOpen] = useState(true);
  const [teach, setTeach] = useState<number | null>(null);
  const [ans, setAns] = useState("");
  const [saved, setSaved] = useState<Saved[]>([]);
  const [view, setView] = useState<Saved | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [rec, setRec] = useState(false);
  const recRef = useRef<{ mr: MediaRecorder; chunks: Blob[]; stream: MediaStream } | null>(null);
  const lastBlob = useRef<Blob | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSaved(loadList(lk)); }, [lk]);
  // ينزل لآخر رسالة داخل الصندوق فقط — بدون تحريك شاشة الموقع
  useEffect(() => { if (open && !view) { const box = endRef.current?.parentElement; if (box) box.scrollTop = box.scrollHeight; } }, [log.length, open, view]);

  // السجل الحالي يبقى محفوظ دائماً (ما ينمسح بالخروج أو إعادة التشغيل)
  const curKey = `call-current:${store}:${kind}`;
  const restored = useRef(false);
  useEffect(() => {
    restored.current = false;
    try {
      const old = JSON.parse(localStorage.getItem(curKey) || "[]") as TMsg[];
      if (old.length) setLog((l) => (l.length ? l : old));
    } catch { /* ignore */ }
    restored.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curKey]);
  useEffect(() => {
    if (!restored.current) return;
    try { localStorage.setItem(curKey, JSON.stringify(log.slice(-500))); } catch { /* ignore */ }
  }, [log, curKey]);

  // التسجيل الصوتي يدوي فقط — تشغيله تلقائياً كان يسرق المايك من سماع المتصفح ويقطّع الصوت
  useEffect(() => { if (!live && recRef.current) stopRec(); }, [live]);

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => { lastBlob.current = new Blob(chunks, { type: mr.mimeType || "audio/webm" }); stream.getTracks().forEach((t) => t.stop()); };
      mr.start(1000);
      recRef.current = { mr, chunks, stream };
      setRec(true);
    } catch { toast.error("ما قدرت أشغّل تسجيل المكالمة — اسمح بالمايك"); }
  }
  function stopRec() { recRef.current?.mr.stop(); recRef.current = null; setRec(false); }

  async function saveCall() {
    if (!log.length) { toast.error("ما فيه محادثة للحفظ"); return; }
    if (recRef.current) { stopRec(); await new Promise((r) => setTimeout(r, 400)); }
    const id = String(Date.now());
    let hasAudio = false;
    if (lastBlob.current?.size) { try { await putAudio(`${store}:${id}`, lastBlob.current); hasAudio = true; } catch { /* ignore */ } lastBlob.current = null; }
    const next = [{ id, at: Date.now(), log: [...log], hasAudio }, ...saved].slice(0, 100);
    localStorage.setItem(lk, JSON.stringify(next));
    setSaved(next);
    toast.success(hasAudio ? "💾 حفظت المحادثة مع التسجيل الصوتي" : "💾 حفظت المحادثة");
  }

  async function openSaved(s: Saved) {
    setView(s); setAudioUrl("");
    if (s.hasAudio) { const b = await getAudio(`${store}:${s.id}`); if (b) setAudioUrl(URL.createObjectURL(b)); }
  }
  function delSaved(s: Saved) {
    if (!confirm("تحذف هذه المكالمة المحفوظة وتسجيلها؟")) return;
    const next = saved.filter((x) => x.id !== s.id);
    localStorage.setItem(lk, JSON.stringify(next)); setSaved(next);
    void delAudio(`${store}:${s.id}`);
    if (view?.id === s.id) setView(null);
  }

  async function doTeach(q: string) {
    if (!ans.trim()) { toast.error("اكتب الرد أول"); return; }
    onTaught?.(q, ans.trim());
    const { error } = await addRule(q, ans, storeId);
    if (error) { toast.error(error.message); return; }
    toast.success("🧠 تعلّمتها — صارت قاعدة دائمة");
    setTeach(null); setAns(""); void reload?.();
  }

  const shown = view ? view.log : log;
  const fmt = (n: number) => new Date(n).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" });

  return (
    <section className="mt-4 rounded-2xl border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg">💬 سجل وسوالف المكالمة {rec && <span className="ms-1 text-xs text-destructive">● يسجّل</span>}</h3>
        <div className="flex flex-wrap gap-2">
          {!view && <Button size="sm" variant="secondary" onClick={saveCall}>💾 احفظ المكالمة</Button>}
          {!view && live && <Button size="sm" variant="outline" onClick={() => (rec ? stopRec() : void startRec())}>{rec ? "⏹️ أوقف التسجيل" : "🎙️ سجّل الصوت"}</Button>}
          <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>{open ? "🙈 إخفاء" : "👁️ إظهار"}</Button>
        </div>
      </div>

      {open && (
        <>
          {view && (
            <div className="mt-2 rounded-xl bg-secondary p-2 text-sm">
              <div className="flex items-center justify-between"><span>📂 مكالمة {fmt(view.at)}</span>
                <Button size="sm" variant="ghost" onClick={() => setView(null)}>↩️ رجوع للحالية</Button></div>
              {audioUrl ? <audio controls src={audioUrl} className="mt-2 w-full" /> : view.hasAudio ? <p className="text-xs">يحمّل التسجيل…</p> : <p className="text-xs text-muted-foreground">بدون تسجيل صوتي</p>}
            </div>
          )}
          <div className={`mt-2 ${kind === "kcall" ? "max-h-[38vh]" : "max-h-[60vh]"} space-y-2 overflow-y-auto rounded-xl bg-muted/50 p-2`}>
            {!shown.length && <p className="p-3 text-center text-sm text-muted-foreground">ما فيه كلام للحين.</p>}
            {shown.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.who === "a" ? "items-start" : "items-end"}`}>
                <p className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.who === "a" ? "bg-royal text-primary-foreground" : "bg-background text-foreground shadow-sm"}`}>
                  {m.who === "a" ? "👩‍💼 " : "🧑 "}{m.t}
                </p>
                <div className="mt-1 flex gap-1">
                  {m.who === "c" && <Button size="sm" className="h-7 px-2 text-xs" onClick={() => { setTeach(teach === i ? null : i); setAns(shown[i + 1]?.who === "a" ? shown[i + 1]!.t : ""); }}>💡 علّمها</Button>}
                  {m.who === "a" && live && onSay && !view && <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={() => onSay(m.t)}>🗣️ قوليها</Button>}
                  {!view && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setLog((l) => l.filter((_, j) => j !== i))}>🗑️</Button>}
                </div>
                {teach === i && (
                  <div className="mt-1 flex w-full max-w-[90%] gap-2">
                    <Input autoFocus value={ans} onChange={(e) => setAns(e.target.value)} placeholder={`ردها على: ${m.t}`} onKeyDown={(e) => { if (e.key === "Enter") void doTeach(m.t); }} />
                    <Button size="sm" onClick={() => void doTeach(m.t)}>احفظ</Button>
                  </div>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {saved.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium">📚 المكالمات المحفوظة ({saved.length})</summary>
              <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto">
                {saved.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-secondary px-2 py-1 text-sm">
                    <button type="button" className="flex-1 text-start" onClick={() => void openSaved(s)}>
                      {s.hasAudio ? "🎧" : "📝"} {fmt(s.at)} — {s.log.length} جملة
                    </button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => delSaved(s)}>🗑️</Button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
