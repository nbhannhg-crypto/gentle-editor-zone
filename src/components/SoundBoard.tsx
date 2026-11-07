import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { applyCable } from "@/lib/cable-audio";

// 🎛️ أزرار المؤثرات السريعة: ضحكة، تنهيدة، أي مقطع — تنحفظ في الجهاز وتشتغل بلمسة
type Pad = { id: string; label: string; emoji: string; text?: string; audio?: string };
const DB = "soundboard", STORE = "pads";
const DEFAULTS: Pad[] = [
  { id: "laugh", emoji: "🤭", label: "ضحكة", text: "ههههههه" },
  { id: "sigh", emoji: "🌸", label: "تنهيدة", text: "آآآه" },
  { id: "aww", emoji: "🥺", label: "أووه", text: "أوووه يا عمري" },
  { id: "hmm", emoji: "🤔", label: "امممم", text: "اممممم" },
  { id: "hala", emoji: "💖", label: "يا هلا", text: "يا هلا والله" },
];

const open = () => new Promise<IDBDatabase>((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
async function loadPads(): Promise<Pad[] | null> {
  const db = await open();
  return new Promise((res) => {
    const q = db.transaction(STORE).objectStore(STORE).getAll();
    q.onsuccess = () => res(q.result.length ? (q.result as (Pad & { o: number })[]).sort((a, b) => a.o - b.o) : null);
    q.onerror = () => res(null);
  });
}
async function savePads(pads: Pad[]) {
  const db = await open();
  const tx = db.transaction(STORE, "readwrite"); const s = tx.objectStore(STORE);
  s.clear(); pads.forEach((p, o) => s.put({ ...p, o }));
}
const toDataUrl = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(b); });

export function SoundBoard({ tts, loud = true }: { tts: (t: string) => Promise<string>; loud?: boolean }) {
  const [pads, setPads] = useState<Pad[]>(DEFAULTS);
  const [edit, setEdit] = useState(false);
  const [playing, setPlaying] = useState("");
  const [form, setForm] = useState<Pad | null>(null);
  const [recOn, setRecOn] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    void loadPads().then((p) => p && setPads(p)).catch(() => {});
    const sync = (e: Event) => setPads((e as CustomEvent<Pad[]>).detail);
    window.addEventListener("soundboard-sync", sync);
    return () => window.removeEventListener("soundboard-sync", sync);
  }, []);
  const persist = (p: Pad[]) => { window.dispatchEvent(new CustomEvent("soundboard-sync", { detail: p })); void savePads(p).catch(() => toast.error("تعذر الحفظ")); };

  const play = async (pad: Pad) => {
    try {
      let src = pad.audio;
      if (!src && pad.text) {
        setPlaying(pad.id);
        src = await tts(pad.text);
        persist(pads.map((x) => (x.id === pad.id ? { ...x, audio: src } : x))); // يتولد مرة وحدة وينحفظ
      }
      if (!src) return;
      audioRef.current?.pause();
      const a = new Audio(src); audioRef.current = a;
      a.volume = loud ? 1 : 0.3; applyCable(a);
      setPlaying(pad.id);
      a.onended = a.onerror = a.onpause = () => setPlaying((x) => (x === pad.id ? "" : x));
      await a.play();
    } catch (e) { setPlaying(""); toast.error((e as Error).message || "تعذر التشغيل"); }
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream); const chunks: Blob[] = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = async () => { stream.getTracks().forEach((t) => t.stop()); const url = await toDataUrl(new Blob(chunks, { type: mr.mimeType })); setForm((f) => f && { ...f, audio: url, text: "" }); setRecOn(false); };
      recRef.current = mr; mr.start(); setRecOn(true);
    } catch { toast.error("اسمح بالمايك"); }
  };

  const saveForm = () => {
    if (!form || !form.label.trim()) { toast.error("اكتب اسم الزر"); return; }
    if (!form.audio && !form.text?.trim()) { toast.error("ارفع مقطع أو سجّل أو اكتب كلام ينطق"); return; }
    const exists = pads.some((p) => p.id === form.id);
    persist(exists ? pads.map((p) => (p.id === form.id ? form : p)) : [...pads, form]);
    setForm(null); toast.success("✅ انحفظ الزر");
  };

  return (
    <div className="mt-2 rounded-xl border bg-background/60 p-2">
      <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>🎛️ مؤثرات سريعة — اضغط ويشتغل</span>
        <div className="flex gap-1">
          <button className="rounded-full border px-2 py-0.5" onClick={() => setForm({ id: crypto.randomUUID(), label: "", emoji: "✨", text: "" })}>➕ أضف</button>
          <button className={`rounded-full border px-2 py-0.5 ${edit ? "bg-primary text-primary-foreground" : ""}`} onClick={() => setEdit(!edit)}>{edit ? "✔️ تم" : "✏️ تعديل"}</button>
        </div>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {pads.map((p) => (
          <div key={p.id} className="relative shrink-0">
            <button onClick={() => (edit ? setForm(p) : void play(p))}
              className={`rounded-full border px-3 py-1 text-xs whitespace-nowrap transition ${playing === p.id ? "animate-pulse bg-primary text-primary-foreground" : "bg-card hover:bg-secondary"}`}>
              {p.emoji} {p.label}
            </button>
            {edit && <button aria-label="حذف" className="absolute -top-1.5 -left-1.5 rounded-full bg-destructive px-1 text-[9px] text-destructive-foreground"
              onClick={() => { if (confirm(`تحذف «${p.label}»؟`)) persist(pads.filter((x) => x.id !== p.id)); }}>✕</button>}
          </div>
        ))}
      </div>

      {form && (
        <div className="mt-2 space-y-2 rounded-xl border bg-card p-2 text-xs">
          <div className="flex gap-2">
            <input value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} className="w-12 rounded-lg border bg-background p-1 text-center" />
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="اسم الزر (ضحكة، نهدة…)" className="flex-1 rounded-lg border bg-background p-1" />
          </div>
          <input value={form.text ?? ""} onChange={(e) => setForm({ ...form, text: e.target.value, audio: undefined })} placeholder="أو اكتب كلام تنطقه الموظفة (مثل: هههههه)" className="w-full rounded-lg border bg-background p-1" />
          <div className="flex flex-wrap gap-1">
            <label className="cursor-pointer rounded-full border px-2 py-1">📁 ارفع صوت/فيديو
              <input type="file" accept="audio/*,video/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 15e6) { toast.error("الملف كبير (حد 15MB)"); return; } setForm({ ...form, audio: await toDataUrl(f), text: "" }); }} />
            </label>
            <button className="rounded-full border px-2 py-1" onClick={() => (recOn ? recRef.current?.stop() : void startRec())}>{recOn ? "⏹️ وقّف التسجيل" : "🎙️ سجّل بصوتك"}</button>
            {form.audio && <button className="rounded-full border px-2 py-1" onClick={() => void new Audio(form.audio).play()}>▶️ جرّب</button>}
            {form.audio && form.text === "" && <span className="self-center text-muted-foreground">✅ مقطع جاهز</span>}
          </div>
          <div className="flex gap-1">
            <button className="flex-1 rounded-full bg-primary py-1 text-primary-foreground" onClick={saveForm}>💾 احفظ</button>
            <button className="rounded-full border px-3 py-1" onClick={() => setForm(null)}>إلغاء</button>
          </div>
        </div>
      )}
    </div>
  );
}
