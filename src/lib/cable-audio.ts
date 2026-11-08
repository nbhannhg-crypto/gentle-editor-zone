// 🎧 وضع السلك النقي: يخفف قوة الخرج ويقص الدمدمة المنخفضة عشان ما يتجهم الصوت في مدخل مايك الجوال الثاني
export const CABLE_KEY = "cable_mode";
export const loadCable = () => { try { return localStorage.getItem(CABLE_KEY) === "1"; } catch { return false; } };
export const saveCable = (v: boolean) => { try { localStorage.setItem(CABLE_KEY, v ? "1" : "0"); } catch { /* ignore */ } };

let ctx: AudioContext | null = null;

/** يفك قفل الصوت في متصفح الجوال عند لمسة المستخدم (عشان الصوت المتولد بعدين ما ينكتم) */
export function unlockAudio() {
  try {
    const C = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (C && ctx && ctx.state !== "running") void ctx.resume?.().catch(() => {});
    const a = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=");
    a.volume = 0; void a.play().catch(() => {});
  } catch { /* ignore */ }
}

/** يطبّق فلتر السلك على عنصر الصوت. لو فشل أي شي يكتفي بتخفيض الصوت فقط. */
export function applyCable(a: HTMLAudioElement) {
  if (!loadCable()) return;
  a.volume = 0.65;
  try {
    const C = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!C) return;
    ctx = ctx ?? new C();
    // لو مسار الصوت المتقدم معلّق، لا نوجّه الصوت عليه (كان يكتم كل الأصوات) — نشغله مباشرة
    if (ctx!.state !== "running") { void ctx!.resume?.().catch(() => {}); return; }
    const src = ctx!.createMediaElementSource(a);
    const hp = ctx!.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 130;
    const presence = ctx!.createBiquadFilter(); presence.type = "peaking"; presence.frequency.value = 3000; presence.gain.value = 2.5; presence.Q.value = 0.9;
    const comp = ctx!.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2;
    const out = ctx!.createGain(); out.gain.value = 0.8;
    src.connect(hp); hp.connect(presence); presence.connect(comp); comp.connect(out); out.connect(ctx!.destination);
  } catch { /* نكتفي بتخفيض الصوت */ }
}
