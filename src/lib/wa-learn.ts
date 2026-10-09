// "علميها بذكاء": 3 optional fields stored inside the existing system_prompt text (no DB change needed).
const MARK = "\n\n<<LEARN>>";
export type Example = { u: string; r: string };
export type Learn = { identity: string; banned: string; dialect: string; examples?: Example[] };

export function splitPrompt(full: string | null | undefined): { base: string; learn: Learn } {
  const s = full ?? "";
  const i = s.indexOf(MARK);
  const empty: Learn = { identity: "", banned: "", dialect: "" };
  if (i < 0) return { base: s, learn: empty };
  try {
    const j = JSON.parse(s.slice(i + MARK.length)) as Partial<Learn>;
    return { base: s.slice(0, i), learn: { identity: j.identity ?? "", banned: j.banned ?? "", dialect: j.dialect ?? "", examples: Array.isArray(j.examples) ? j.examples : [] } };
  } catch { return { base: s.slice(0, i), learn: empty }; }
}

export function joinPrompt(base: string, l: Learn): string {
  if (!l.identity.trim() && !l.banned.trim() && !l.dialect.trim() && !(l.examples ?? []).some((e) => e.u.trim() || e.r.trim())) return base;
  return base + MARK + JSON.stringify(l);
}

/** Final system prompt: identity + persona + extra rules. */
export function composePrompt(full: string | null | undefined): string {
  const { base, learn } = splitPrompt(full);
  const parts: string[] = [];
  if (learn.identity.trim()) parts.push(`هويتك: ${learn.identity.trim()}`);
  if (base.trim()) parts.push(base.trim());
  const rules: string[] = [];
  if (learn.banned.trim()) rules.push(`الممنوعات (لا تقوليها أبداً): ${learn.banned.trim()}`);
  if (learn.dialect.trim()) rules.push(`يجب أن تفهمي هذه اللهجات والكلمات حتى لو كُتبت ملخبطة أو بأخطاء إملائية: ${learn.dialect.trim()}. وإذا ما فهمتي كلمة خمّني معناها من السياق وردي بذكاء.`);
  if (rules.length) parts.push("قواعد إضافية: " + rules.join(" | "));
  const ex = (learn.examples ?? []).filter((e) => e.u.trim() && e.r.trim()).slice(-10);
  if (ex.length) parts.push("أمثلة مهمة جداً يجب أن تتعلمي منها:\n" + ex.map((e) => `العميل: ${e.u.trim()}\nانتِ: ${e.r.trim()}`).join("\n"));
  return parts.join("\n");
}
