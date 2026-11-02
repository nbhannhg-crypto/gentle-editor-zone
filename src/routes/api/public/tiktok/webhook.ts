import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

const Evt = z.object({
  event: z.string().max(100),
  user_openid: z.string().max(200),
  content: z.string().max(20000).optional(),
});

/** TikTok-Signature: t=<ts>,s=<hex hmac sha256 of "<ts>.<body>"> */
function verified(header: string | null, body: string, secret: string): boolean {
  if (!header) return false;
  const p = Object.fromEntries(header.split(",").map((x) => x.split("=") as [string, string])) as { t?: string; s?: string };
  if (!p.t || !p.s) return false;
  if (Math.abs(Date.now() / 1000 - Number(p.t)) > 300) return false;
  const exp = createHmac("sha256", secret).update(`${p.t}.${body}`).digest("hex");
  const a = Buffer.from(exp), b = Buffer.from(p.s);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/tiktok/webhook")({
  server: {
    handlers: {
      // TikTok URL test / verification: echo the challenge back
      GET: async ({ request }) => {
        const c = (new URL(request.url).searchParams.get("challenge") ?? "").slice(0, 500);
        return new Response(c || "ok", { status: 200, headers: { "Content-Type": "text/plain" } });
      },
      POST: async ({ request }) => {
        const secret = process.env["TIKTOK_CLIENT_SECRET"];
        const qc = new URL(request.url).searchParams.get("challenge");
        if (qc) return new Response(qc.slice(0, 500), { status: 200, headers: { "Content-Type": "text/plain" } });
        const body = await request.text();
        // unsigned test pings from the portal: acknowledge without processing anything
        if (!request.headers.get("tiktok-signature")) {
          try { const j = JSON.parse(body || "{}") as { challenge?: string }; if (j.challenge) return new Response(String(j.challenge).slice(0, 500), { status: 200, headers: { "Content-Type": "text/plain" } }); } catch { /* ignore */ }
          return new Response("ok", { status: 200 });
        }
        if (!secret || !verified(request.headers.get("tiktok-signature"), body, secret)) return new Response("bad signature", { status: 401 });
        const parsed = Evt.safeParse(JSON.parse(body || "{}"));
        if (!parsed.success) return new Response("ok");
        const e = parsed.data;
        let msg: { from?: string; text?: string } = {};
        try { msg = JSON.parse(e.content ?? "{}"); } catch { /* ignore */ }
        const text = String(msg.text ?? "").trim().slice(0, 1000);
        const from = String(msg.from ?? "عميل").slice(0, 200);
        if (!text) return new Response("ok");

        const { findOwner, saveAccounts, pushLog, admin } = await import("@/lib/tiktok.server");
        const own = await findOwner(e.user_openid);
        if (!own) return new Response("ok");
        const acc = own.list.find((a) => a.open_id === e.user_openid)!;
        pushLog(acc, { n: from, t: text, at: Date.now() });
        let reply = "";
        if (acc.ctrl?.enabled) {
          const { staffContext, aiReplyWith, tidyReply, fixCut, bestRule } = await import("@/lib/autoreply.server");
          const db = await admin();
          if (acc.ctrl.source !== "ai") {
            const { data: rules } = await db.from("training_rules").select("id, trigger_text, response_text, use_count").eq("store_id", own.store).not("trigger_text", "like", "\\_\\_%").limit(1000);
            const hit = bestRule(text, (rules ?? []) as never);
            if (hit) reply = hit.rule.response_text;
          }
          if (!reply && acc.ctrl.source !== "rules") {
            const ctx = await staffContext(db, own.store, `tt_${acc.open_id}`);
            const hist = (acc.log ?? []).slice(-6).map((m) => (m.me ? `أنتِ: ${m.r}` : `هو: ${m.t}`)).join("\n");
            reply = await aiReplyWith(text, `${ctx}\n\nآخر السالفة:\n${hist}`).catch(() => "");
          }
          reply = reply ? fixCut(tidyReply(reply, text)) : "";
          if (reply) pushLog(acc, { n: from, t: "", r: reply, at: Date.now() + 1, me: true });
        }
        await saveAccounts(own.store, own.list);
        return Response.json({ ok: true, reply });
      },
    },
  },
});
