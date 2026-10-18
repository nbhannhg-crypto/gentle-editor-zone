import { supabase } from "@/integrations/supabase/client";
import { findMatches, normalize, type Rule } from "@/lib/rules";
import { loadMySections } from "@/lib/sections-cloud";

/* عقل المكالمة: أقسام وعقول مفعلة + دقة مطابقة (إضافة فقط) */

const GEN = new Set(["settings", "عام", "السعر", "التوصيل", "الجودة", "الضمان", "التأجيل"]);

export async function loadCallSections(): Promise<string[]> {
  const set = new Set<string>();
  try { (await loadMySections()).forEach((s) => s && set.add(String(s))); } catch { /* ignore */ }
  try {
    const { data } = await (supabase.from as any)("reply_library").select("tag").limit(1000);
    ((data ?? []) as any[]).forEach((r) => r.tag && set.add(String(r.tag)));
  } catch { /* ignore */ }
  try {
    const { data } = await supabase.from("training_rules").select("response_text").like("trigger_text", "mb_sections:%");
    ((data ?? []) as any[]).forEach((r) => { try { (JSON.parse(r.response_text || "[]") as any[]).forEach((s) => s && set.add(String(s))); } catch { /* ignore */ } });
  } catch { /* ignore */ }
  try {
    const { data } = await supabase.from("brains").select("library_tag");
    ((data ?? []) as any[]).forEach((b) => { if (b.library_tag && b.library_tag !== "__rules__") set.add(String(b.library_tag)); });
  } catch { /* ignore */ }
  return [...set].filter((s) => !GEN.has(s));
}

export async function loadCallBrains(): Promise<{ id: string; name: string }[]> {
  try {
    const r: any = await (supabase.rpc as any)("kingdom_brains");
    return ((r.data ?? []) as any[]).map((b) => ({ id: String(b.id), name: String(b.name) }));
  } catch { return []; }
}

const brainCache = new Map<string, Rule[]>();
const toRule = (t: string, a: string, cat: string, i: number): Rule => ({ id: `${cat}:${i}:${t.slice(0, 20)}`, trigger_text: t, response_text: a, category: cat, use_count: 0 });

/** Searches only the enabled sections/brains, directly by keywords (no full download). */
export async function searchCallSources(text: string, secs: string[], brains: string[], threshold: number): Promise<string> {
  const words = normalize(text).split(" ").filter((w) => w.length > 2).sort((a, b) => b.length - a.length).slice(0, 3);
  if (!words.length) return "";
  const pool: Rule[] = [];
  const or = (col: string) => words.map((w) => `${col}.ilike.%${w}%`).join(",");
  await Promise.all(secs.map(async (s) => {
    try {
      const { data } = await (supabase.from as any)("reply_library").select("trigger_text, reply_text").eq("tag", s).or(or("trigger_text")).limit(150);
      ((data ?? []) as any[]).forEach((r, i) => r.trigger_text && r.reply_text && pool.push(toRule(r.trigger_text, r.reply_text, s, i)));
    } catch { /* ignore */ }
    try {
      const { data } = await supabase.from("training_rules").select("trigger_text, response_text").eq("category", s).or(or("trigger_text")).limit(150);
      ((data ?? []) as any[]).forEach((r, i) => r.trigger_text && r.response_text && pool.push(toRule(r.trigger_text, r.response_text, "r" + s, i)));
    } catch { /* ignore */ }
  }));
  for (const b of brains) {
    if (!brainCache.has(b)) {
      try {
        const { data } = await (supabase.rpc as any)("kingdom_replies", { _brain: b });
        brainCache.set(b, ((data ?? []) as any[]).filter((r) => r?.trigger_text && r?.reply_text).map((r, i) => toRule(String(r.trigger_text), String(r.reply_text), "b" + b, i)));
      } catch { brainCache.set(b, []); }
    }
    pool.push(...(brainCache.get(b) ?? []));
  }
  if (!pool.length) return "";
  if (threshold >= 1) {
    const q = normalize(text);
    return pool.find((r) => normalize(r.trigger_text) === q)?.response_text ?? "";
  }
  const best = findMatches(text, pool, 1)[0];
  return best && best.score >= threshold ? best.rule.response_text : "";
}
