/** Pure meaning-style matcher for media items: scores customer text against triggers, likely questions, tags, OCR and transcript. */
export function normalizeArabic(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ").trim();
}

const STOP = new Set(["في", "من", "على", "عن", "الى", "ال", "و", "يا", "هل", "ابي", "ودي", "عندكم", "لو", "ممكن", "انا", "انت", "هذا", "هذي"]);
const words = (s: string) => normalizeArabic(s).split(" ").filter((w) => w.length > 1 && !STOP.has(w)).map((w) => w.replace(/^ال/, ""));

export type Matchable = { id: string; title: string; transcript?: string; triggers: string[]; questions: string[]; tags: string[]; ocr?: string; active: boolean };

/** Returns 0..100. Exact trigger phrase inside text = 100; otherwise weighted word overlap. */
export function scoreMedia(text: string, m: Matchable): number {
  const t = normalizeArabic(text);
  if (!t) return 0;
  for (const tr of m.triggers) { const n = normalizeArabic(tr); if (n && t.includes(n)) return 100; }
  const q = new Set(words(text));
  if (!q.size) return 0;
  const pool = (arr: string[], w: number) => arr.flatMap((s) => words(s).map((x) => [x, w] as const));
  const bag = [
    ...pool(m.triggers, 3), ...pool(m.questions, 3), ...pool(m.tags, 2),
    ...pool([m.title], 2), ...pool([m.ocr ?? ""], 1), ...pool([m.transcript ?? ""], 1),
  ];
  const best = new Map<string, number>();
  for (const [w, wt] of bag) best.set(w, Math.max(best.get(w) ?? 0, wt));
  let hit = 0;
  for (const w of q) hit += best.get(w) ?? 0;
  return Math.min(99, Math.round((hit / (q.size * 3)) * 100));
}

export function bestMedia<T extends Matchable>(text: string, items: T[], min = 50): { item: T; score: number } | null {
  let top: { item: T; score: number } | null = null;
  for (const it of items) {
    if (!it.active) continue;
    const s = scoreMedia(text, it);
    if (s >= min && (!top || s > top.score)) top = { item: it, score: s };
  }
  return top;
}
