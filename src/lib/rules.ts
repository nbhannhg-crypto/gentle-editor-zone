import Fuse from "fuse.js";
import { supabase } from "@/integrations/supabase/client";

export type Rule = {
  id: string;
  trigger_text: string;
  response_text: string;
  category: string;
  use_count: number;
};

const LS = "kingdom_rules";

export function normalize(s: string) {
  return s
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[؟?!.,،]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function guessCategory(t: string) {
  const n = normalize(t);
  if (/غالي|سعر|بكم|كم|خصم|فلوس|تقسيط/.test(n)) return "السعر";
  if (/بعدين|افكر|اشوف|مو الحين/.test(n)) return "التأجيل";
  if (/توصيل|شحن|متى يوصل/.test(n)) return "التوصيل";
  if (/ضمان|جوده|اصلي/.test(n)) return "الجودة";
  return "عام";
}

export function cacheRules(rules: Rule[]) {
  if (typeof window !== "undefined") localStorage.setItem(LS, JSON.stringify(rules));
}
export function cachedRules(): Rule[] {
  try { return JSON.parse(localStorage.getItem(LS) || "[]"); } catch { return []; }
}

export async function fetchRules(storeId?: string): Promise<Rule[]> {
  let q = supabase.from("training_rules").select("*").order("created_at", { ascending: false });
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q;
  if (error) return cachedRules();
  cacheRules(data as Rule[]);
  return data as Rule[];
}

export async function addRule(trigger: string, response: string, storeId?: string) {
  return supabase.from("training_rules").insert({ trigger_text: trigger.trim(), response_text: response.trim(), category: guessCategory(trigger), store_id: storeId ?? null });
}

export type Match = { rule: Rule; score: number };

/** Fuzzy match: word overlap + Fuse similarity on normalized triggers. Score 0..1 (higher = better). */
export function findMatches(text: string, rules: Rule[], limit = 4): Match[] {
  const q = normalize(text);
  if (!q || !rules.length) return [];
  const items = rules.map((r) => ({ r, n: normalize(r.trigger_text) }));
  const fuse = new Fuse(items, { keys: ["n"], includeScore: true, threshold: 0.6, ignoreLocation: true });
  const fuseScores = new Map<string, number>();
  fuse.search(q).forEach((h) => fuseScores.set(h.item.r.id, 1 - (h.score ?? 1)));
  const qWords = q.split(" ");
  return items
    .map(({ r, n }) => {
      const tWords = n.split(" ");
      const contains = q.includes(n) || n.includes(q) ? 1 : 0;
      const overlap = tWords.filter((w) => qWords.some((qw) => qw.includes(w) || w.includes(qw))).length / tWords.length;
      const score = Math.max(contains * 0.95, overlap * 0.85, fuseScores.get(r.id) ?? 0);
      return { rule: r, score };
    })
    .filter((m) => m.score > 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function recordUse(text: string, rule?: Rule) {
  await supabase.from("customer_messages").insert({ text, matched_rule_id: rule?.id ?? null });
  if (rule) await supabase.from("training_rules").update({ use_count: rule.use_count + 1 }).eq("id", rule.id);
}
