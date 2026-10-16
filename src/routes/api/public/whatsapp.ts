import { createFileRoute } from "@tanstack/react-router";

/**
 * WhatsApp Cloud API webhook.
 * GET  — Meta verification handshake (hub.challenge).
 * POST — incoming messages; auto-replies using taught rules + AI when enabled.
 *
 * Required secrets (add via Lovable secrets when ready):
 *   WHATSAPP_VERIFY_TOKEN  — any string you choose, pasted also in Meta dashboard
 *   WHATSAPP_TOKEN         — permanent access token from Meta
 *   WHATSAPP_PHONE_ID      — phone number ID from Meta
 */
export const Route = createFileRoute("/api/public/whatsapp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const mode = u.searchParams.get("hub.mode");
        const token = u.searchParams.get("hub.verify_token");
        const challenge = u.searchParams.get("hub.challenge");
        if (mode === "subscribe" && token && token === process.env["WHATSAPP_VERIFY_TOKEN"]) {
          return new Response(challenge ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        let body: any;
        try { body = await request.json(); } catch { return new Response("bad request", { status: 400 }); }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const entry = body?.entry?.[0]?.changes?.[0]?.value;
        const msg = entry?.messages?.[0];
        if (!msg || msg.type !== "text") return Response.json({ ok: true });

        const from: string = msg.from;
        const text: string = msg.text?.body ?? "";
        const name: string = entry?.contacts?.[0]?.profile?.name ?? "";

        // Log incoming message
        await supabaseAdmin.from("channel_messages").insert({
          channel: "whatsapp", customer_name: name, customer_phone: from, direction: "in", text,
        });
        await supabaseAdmin.from("customers").upsert(
          { phone: from, name, channel: "whatsapp", last_message: text, last_seen: new Date().toISOString() },
          { onConflict: "phone" },
        );

        // Auto-reply if the channel has it enabled
        const { data: ch } = await supabaseAdmin.from("channels").select("auto_reply").eq("platform", "whatsapp").maybeSingle();
        if (!ch?.auto_reply) return Response.json({ ok: true, replied: false });

        const reply = await craftReply(text);
        const token = process.env["WHATSAPP_TOKEN"];
        const phoneId = process.env["WHATSAPP_PHONE_ID"];
        if (reply && token && phoneId) {
          const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              messaging_product: "whatsapp", to: from, type: "text", text: { body: reply },
            }),
          });
          if (!res.ok) console.error("WhatsApp send failed", res.status, await res.text());
          else {
            await supabaseAdmin.from("channel_messages").insert({
              channel: "whatsapp", customer_name: name, customer_phone: from, direction: "out", text: reply, replied: true,
            });
          }
        }
        return Response.json({ ok: true, replied: Boolean(reply) });
      },
    },
  },
});

async function craftReply(text: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { pageAll, bestRule } = await import("@/lib/autoreply.server");
  const [{ data: rules }, { data: libRows }] = await Promise.all([
    pageAll((f, t) => supabaseAdmin.from("training_rules").select("id, trigger_text, response_text").not("trigger_text", "like", "__wa_%").order("created_at", { ascending: false }).range(f, t)),
    pageAll((f, t) => supabaseAdmin.from("reply_library").select("id, trigger_text, response_text:reply_text").order("created_at", { ascending: false }).range(f, t)),
  ]);
  const allRules = [...rules, ...libRows] as { id: string; trigger_text: string; response_text: string }[];
  const direct = bestRule(text, allRules.map((r) => ({ ...r, use_count: 0 })));
  if (direct && direct.score >= 0.35) return direct.rule.response_text;
  const qw = text.split(/\s+/).filter((w) => w.length > 2);
  const related = allRules.filter((r) => qw.some((w) => r.trigger_text?.includes(w)));
  const list = [...related, ...allRules.filter((r) => !related.includes(r))].slice(0, 200);

  const { quickGreeting, getAIResponse } = await import("@/lib/ai-keys.server");
  const greet = quickGreeting(text);
  if (greet) return greet;

  const rulesText = list.map((r, i) => `${i + 1}. إذا قال الزبون: "${r.trigger_text}" ← الرد: "${r.response_text}"`).join("\n");
  const ext = await getAIResponse(`أنتِ موظفة مبيعات سعودية تردين على زبائن واتساب. التزمي بتعليمات صاحب المتجر أولاً، وردي بجملة أو جملتين باللهجة السعودية البيضاء.\n\nتعليمات صاحب المتجر:\n${rulesText || "لا يوجد"}`, text);
  if (ext) return ext;

  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return list[0]?.response_text ?? "";
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash",
      messages: [
        { role: "system", content: `أنتِ موظفة مبيعات سعودية تردين على زبائن واتساب. التزمي بتعليمات صاحب المتجر أولاً، وردي بجملة أو جملتين باللهجة السعودية البيضاء.\n\nتعليمات صاحب المتجر:\n${rulesText || "لا يوجد"}` },
        { role: "user", content: text },
      ],
    }),
  });
  if (!res.ok) return list[0]?.response_text ?? "";
  const j = await res.json();
  return j.choices?.[0]?.message?.content?.trim() ?? "";
}
