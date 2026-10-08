import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const norm = (s: string) => s.replace(/[إأآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}\s]/gu, " ").toLowerCase();
const words = (s: string) => norm(s).split(/\s+/).filter((w) => w.length > 1);

function score(q: string, t: string) {
  const a = new Set(words(q)); const b = words(t);
  if (!b.length) return 0;
  let hit = 0; for (const w of b) if (a.has(w) || [...a].some((x) => x.length > 2 && (x.includes(w) || w.includes(x)))) hit++;
  return hit / b.length + (norm(q).includes(norm(t)) ? 1 : 0);
}

/** Parse merchant control commands: delete / add / edit. */
function parseCommand(msg: string): { type: "delete_keyword" | "add_info" | "edit_response"; content: string } | null {
  const m = msg.trim();
  let r = m.match(/^(?:احذف|احدف|امسح|شيل)(?:\s+(?:كلمة|كلمه|الكلمة))?\s+(.+)$/);
  if (r) return { type: "delete_keyword", content: r[1]!.replace(/^["«]|["»]$/g, "").trim() };
  r = m.match(/^عدل(?:\s+الرد)?\s+(.+?)\s+(?:إلى|الى|ل)\s+(.+)$/);
  if (r) return { type: "edit_response", content: `${r[1]!.trim()}||${r[2]!.trim()}` };
  r = m.match(/^(?:أضف|اضف|ضيف|زيد|زد)(?:\s+(?:معلومة|معلومه))?\s+(.+)$/);
  if (r) return { type: "add_info", content: r[1]!.trim() };
  return null;
}

export const kingdomTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ brainId: z.string().uuid(), message: z.string().trim().min(1).max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: list } = await sb.rpc("kingdom_brains");
    const brain = (list ?? []).find((b) => b.id === data.brainId);
    if (!brain) throw new Error("العقل غير متاح");

    // Owner (queen) commands write straight into the Mother library
    const own = await sb.from("brains").select("store_id, library_tag, stores!inner(owner_id)").eq("id", data.brainId).eq("stores.owner_id", context.userId).maybeSingle();
    if (own.data) {
      const tag = own.data.library_tag || brain.name;
      if (!own.data.library_tag) await sb.from("brains").update({ library_tag: tag }).eq("id", data.brainId);
      const add = data.message.trim().match(/^(?:أضف|اضف|ضيف|زيد)\s+رد\s+(.+?)\s*(?:=|:|←|->)\s*(.+)$/);
      if (add) {
        const { error } = await sb.from("reply_library").insert({ store_id: own.data.store_id, tag, trigger_text: add[1]!.slice(0, 500), reply_text: add[2]!.slice(0, 2000) });
        if (error) throw new Error(error.message);
        return { reply: `👑 انضاف للعقل الأم: «${add[1]}» ← ${add[2]}`, command: "mother_add", source: "command" as const };
      }
      const rm = data.message.trim().match(/^(?:احذف|امسح)\s+رد\s+(.+)$/);
      if (rm) {
        const { data: gone } = await sb.from("reply_library").delete().eq("store_id", own.data.store_id).eq("tag", tag).ilike("trigger_text", `%${rm[1]!.replace(/[%_]/g, "")}%`).select("id");
        return { reply: `👑 حذفت ${gone?.length ?? 0} رد من العقل الأم`, command: "mother_del", source: "command" as const };
      }
    }
    const cmd = parseCommand(data.message);
    if (cmd) {
      const { error } = await sb.from("merchant_brain_overrides").insert({ merchant_id: context.userId, mother_brain_id: data.brainId, type: cmd.type, content: cmd.content.slice(0, 2000) });
      if (error) throw new Error(error.message);
      const label = cmd.type === "delete_keyword" ? `🗑️ تم — ما راح أقول «${cmd.content}» بعد اليوم` : cmd.type === "add_info" ? `➕ تم — أضفت معلومتك فوق العقل الأم: ${cmd.content}` : `✏️ تم — عدّلت الرد: ${cmd.content.replace("||", " ← ")}`;
      return { reply: label, command: cmd.type, source: "command" as const };
    }

    const [{ data: lib }, { data: ov }] = await Promise.all([
      sb.rpc("kingdom_replies", { _brain: data.brainId }),
      sb.from("merchant_brain_overrides").select("type, content").eq("merchant_id", context.userId).eq("mother_brain_id", data.brainId).order("created_at"),
    ]);
    const overrides = ov ?? [];
    // Merchant's own replies take priority over the mother library
    const mine = overrides.filter((o) => o.type === "add_reply").map((o) => { const [t, r] = o.content.split("||"); return { trigger_text: t ?? "", reply_text: r ?? "" }; });
    const pick = (rows: { trigger_text: string; reply_text: string }[]) => {
      let best: { s: number; r: string } | null = null;
      for (const x of rows) { const s = score(data.message, x.trigger_text); if (s >= 0.5 && (!best || s > best.s)) best = { s, r: x.reply_text }; }
      return best?.r ?? null;
    };
    let reply = pick(mine);
    let source: "mine" | "mother" | "ai" = "mine";
    if (!reply) { reply = pick(lib ?? []); source = "mother"; }
    if (!reply) {
      source = "ai";
      const ctx = (lib ?? []).slice(0, 60).map((r) => `[${r.trigger_text} ← ${r.reply_text}]`).join(" ");
      const sys = `أنت ${brain.name}: ${brain.short_desc}. ترد كموظف مبيعات سعودي على زبون، باللهجة السعودية، مختصر. استخدم أسلوب وردود المكتبة: ${ctx}`;
      const { getAIResponse } = await import("@/lib/ai-keys.server");
      reply = (await getAIResponse(sys, data.message)) ?? "هلا والله، وش تحتاج بالضبط؟ أنا بالخدمة 🌷";
    }
    // Apply merchant touches: edits, deletions, then added info
    for (const o of overrides) {
      if (o.type === "edit_response") { const [f, t] = o.content.split("||"); if (f) reply = reply.split(f).join(t ?? ""); }
    }
    for (const o of overrides) if (o.type === "delete_keyword") reply = reply.split(o.content).join("");
    reply = reply.replace(/\s{2,}/g, " ").trim();
    const adds = overrides.filter((o) => o.type === "add_info").map((o) => o.content);
    if (adds.length) reply = `${reply}\n${adds.map((a) => `• ${a}`).join("\n")}`;
    return { reply, command: null, source };
  });
