import { supabase } from "@/integrations/supabase/client";
import { vaultContext } from "@/lib/voice-vault-cloud";

/** 💾 خزينة صوت المكالمة: كل جملة تنولد تنحفظ في خزينة متجرك، وإذا تكررت بالحرف بنفس الصوت تشتغل فوراً بدون توليد. */
export type CallClip = { id: string; key: string; text: string; voice_id: string; model: string; speed: number; emotion: string; path: string; uses: number; pinned: boolean; created_at: string };
export type VaultVoice = { voiceId: string; model: string; speed: number; emotion: string };

const BUCKET = "call-vault";
const ON = "cv_on";
export const vaultOn = () => { try { return localStorage.getItem(ON) !== "0"; } catch { return true; } };
export const setVaultOn = (v: boolean) => { try { localStorage.setItem(ON, v ? "1" : "0"); } catch { /* ignore */ } window.dispatchEvent(new Event("cv-change")); };

export const normText = (t: string) => t.replace(/\s+/g, " ").trim();
export async function clipKey(text: string, v: VaultVoice) {
  const raw = [normText(text), v.voiceId, v.model, Number(v.speed).toFixed(2), v.emotion].join("|");
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

let ctx: Promise<{ storeId: string; admin: boolean }> | null = null;
export const vaultStore = () => (ctx ??= vaultContext().then((c) => { if (!c.storeId) ctx = null; return c; }));
const mem = new Map<string, string>(); // key → رابط صوت جاهز بالذاكرة

// 📱 ذاكرة الجوال المحلية (IndexedDB): تشغيل فوري بدون نت، والسحابة نسخة احتياطية
const IDB = "call-vault-local", ST = "clips";
let dbp: Promise<IDBDatabase> | null = null;
const db = () => (dbp ??= new Promise((res, rej) => { const r = indexedDB.open(IDB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => res(r.result); r.onerror = () => { dbp = null; rej(r.error); }; }));
async function localGet(key: string): Promise<Blob | null> {
  try { const d = await db(); return await new Promise((res) => { const q = d.transaction(ST).objectStore(ST).get(key); q.onsuccess = () => res((q.result as Blob) ?? null); q.onerror = () => res(null); }); } catch { return null; }
}
async function localPut(key: string, b: Blob) { try { const d = await db(); d.transaction(ST, "readwrite").objectStore(ST).put(b, key); } catch { /* ignore */ } }
async function localDel(keys: string[]) { try { const d = await db(); const s = d.transaction(ST, "readwrite").objectStore(ST); keys.forEach((k) => s.delete(k)); } catch { /* ignore */ } }

const toBlob = async (audio: string) => (await fetch(audio)).blob();
const changed = () => window.dispatchEvent(new Event("cv-change"));

/** يرجع الصوت المحفوظ إن وُجد بالحرف، وإلا يولد ويحفظ بالخلفية. */
export async function vaultSpeak(text: string, v: VaultVoice, gen: () => Promise<string>): Promise<string> {
  if (!vaultOn()) return gen();
  let key = "";
  try { key = await clipKey(text, v); } catch { return gen(); }
  const hit = mem.get(key);
  if (hit) { void vaultStore().then((c) => bump(c.storeId, key)); return hit; }
  const loc = await localGet(key);
  if (loc) { const u = URL.createObjectURL(loc); mem.set(key, u); void vaultStore().then((c) => bump(c.storeId, key)); return u; }
  const { storeId } = await vaultStore();
  if (storeId) {
    // ⏱️ صمام ثانيتين: إذا تأخرت الخزينة نولّد مباشرة بدون تعليق
    const lookup = (async () => {
      const { data } = await supabase.from("call_voice_cache").select("id, path, uses").eq("store_id", storeId).eq("key", key).maybeSingle();
      if (!data) return null;
      const { data: f } = await supabase.storage.from(BUCKET).download(data.path);
      if (!f) return null;
      const url = URL.createObjectURL(f); mem.set(key, url); void localPut(key, f);
      void supabase.from("call_voice_cache").update({ uses: data.uses + 1 }).eq("id", data.id);
      return url;
    })().catch(() => null);
    const url = await Promise.race([lookup, new Promise<null>((r) => setTimeout(() => r(null), 2000))]);
    if (url) return url;
  }
  const audio = await gen();
  mem.set(key, audio);
  void toBlob(audio).then((b) => localPut(key, b)).catch(() => {});
  if (storeId) void save(storeId, key, text, v, audio);
  return audio;
}

async function bump(storeId: string, key: string) {
  if (!storeId) return;
  const { data } = await supabase.from("call_voice_cache").select("id, uses").eq("store_id", storeId).eq("key", key).maybeSingle();
  if (data) await supabase.from("call_voice_cache").update({ uses: data.uses + 1 }).eq("id", data.id);
}

async function save(storeId: string, key: string, text: string, v: VaultVoice, audio: string) {
  try {
    const path = `${storeId}/${key}.mp3`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, await toBlob(audio), { contentType: "audio/mpeg", upsert: true });
    if (error) return;
    await supabase.from("call_voice_cache").upsert({ store_id: storeId, key, text: normText(text), voice_id: v.voiceId, model: v.model, speed: v.speed, emotion: v.emotion, path, uses: 1 }, { onConflict: "store_id,key" });
    changed();
  } catch { /* best effort */ }
}

export async function listClips(): Promise<CallClip[]> {
  const { storeId } = await vaultStore();
  if (!storeId) return [];
  const { data } = await supabase.from("call_voice_cache").select("*").eq("store_id", storeId).order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(1000);
  return (data ?? []) as CallClip[];
}

export async function clipUrl(c: CallClip) {
  const hit = mem.get(c.key); if (hit) return hit;
  const loc = await localGet(c.key); if (loc) { const u = URL.createObjectURL(loc); mem.set(c.key, u); return u; }
  const { data } = await supabase.storage.from(BUCKET).download(c.path);
  if (!data) throw new Error("تعذر تحميل الصوت");
  const url = URL.createObjectURL(data); mem.set(c.key, url); void localPut(c.key, data); return url;
}

export async function deleteClip(c: CallClip) {
  mem.delete(c.key); void localDel([c.key]);
  await supabase.storage.from(BUCKET).remove([c.path]);
  await supabase.from("call_voice_cache").delete().eq("id", c.id);
  changed();
}

export async function deleteAllClips(list: CallClip[]) {
  for (const c of list) mem.delete(c.key);
  void localDel(list.map((c) => c.key));
  if (list.length) await supabase.storage.from(BUCKET).remove(list.map((c) => c.path));
  await supabase.from("call_voice_cache").delete().in("id", list.map((c) => c.id));
  changed();
}

export async function pinClip(c: CallClip, pinned: boolean) {
  await supabase.from("call_voice_cache").update({ pinned }).eq("id", c.id); changed();
}

/** تعديل نص المقطع أو إعادة توليده: يولد نسخة جديدة ويستبدل القديمة. */
export async function replaceClip(c: CallClip, text: string, v: VaultVoice, gen: (t: string) => Promise<string>) {
  const audio = await gen(text);
  const key = await clipKey(text, v);
  const { storeId } = await vaultStore();
  if (!storeId) throw new Error("ما لقينا متجرك");
  mem.delete(c.key); void localDel([c.key]);
  const path = `${storeId}/${key}.mp3`;
  const up = await supabase.storage.from(BUCKET).upload(path, await toBlob(audio), { contentType: "audio/mpeg", upsert: true });
  if (up.error) throw up.error;
  if (path !== c.path) await supabase.storage.from(BUCKET).remove([c.path]);
  await supabase.from("call_voice_cache").delete().eq("id", c.id);
  await supabase.from("call_voice_cache").upsert({ store_id: storeId, key, text: normText(text), voice_id: v.voiceId, model: v.model, speed: v.speed, emotion: v.emotion, path, uses: c.uses, pinned: c.pinned }, { onConflict: "store_id,key" });
  mem.set(key, audio); void toBlob(audio).then((b) => localPut(key, b)).catch(() => {}); changed();
  return audio;
}
