import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { aiReplyWith, bestRule, evoSend, fishTts, kingdomAutoReply, kingdomWelcome, numberAllowed, type AiOpts } from "@/lib/autoreply.server";

const ok = (s = 200, t = "ok") => new Response(t, { status: s });

export const Route = createFileRoute("/api/public/evolution")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["EVO_WEBHOOK_SECRET"] ?? "";
        const t = new URL(request.url).searchParams.get("t") ?? "";
        if (!secret || t.length !== secret.length || !timingSafeEqual(Buffer.from(t), Buffer.from(secret))) return ok(401, "bad token");

        let body: any;
        try { body = await request.json(); } catch { return ok(400, "bad json"); }
        const event = String(body?.event ?? "").toLowerCase();
        if (event !== "messages.upsert" && event !== "messages_upsert") return ok();
        const instance = String(body?.instance ?? "");
        const d = Array.isArray(body?.data) ? body.data[0] : body?.data;
        const jid: string = d?.key?.remoteJid ?? "";
        const msgId: string = d?.key?.id ?? "";
        if (!d || d.key?.fromMe || !msgId || !jid.endsWith("@s.whatsapp.net")) return ok();
        const text: string = d.message?.conversation ?? d.message?.extendedTextMessage?.text ?? "";
        if (!text.trim()) return ok();
        const number = jid.split("@")[0]!;

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        // select("*") so optional new columns are read when present, and nothing breaks when absent
        const { data: cfgRow } = await db.from("wa_autoreply").select("*").eq("instance", instance).maybeSingle();
        const cfg = cfgRow as ({ store_id: string; enabled: boolean; voice: boolean; source: string | null } & AiOpts & { allowed_numbers?: string | null }) | null;
        if (!cfg?.enabled) return ok();
        if (!numberAllowed(cfg.allowed_numbers, number)) {
          console.log(`تم تجاهل رسالة من رقم غير مسموح: ${number}`);
          return ok();
        }
        const { data: st } = await db.from("stores").select("active, owner_id, name").eq("id", cfg.store_id).maybeSingle();
        if (!st?.active) return ok();

        // Durable inbox + dedupe
        const { error: insErr } = await db.from("wa_inbox").insert({ msg_id: msgId, instance, store_id: cfg.store_id, from_number: number, text: text.slice(0, 2000) });
        if (insErr) {
          if (insErr.code === "23505") {
            const { data: prev } = await db.from("wa_inbox").select("status").eq("msg_id", msgId).maybeSingle();
            if (prev?.status === "done" || prev?.status === "skipped") return ok();
          } else return ok(500, insErr.message);
        }

        try {
          // Welcome message for first-time senders (merchant toggle)
          if (st.owner_id) {
            const { count } = await db.from("wa_inbox").select("msg_id", { count: "exact", head: true }).eq("store_id", cfg.store_id).eq("from_number", number);
            if ((count ?? 0) <= 1) {
              const w = await kingdomWelcome(db, st.owner_id, st.name ?? "متجرنا").catch(() => null);
              if (w) await evoSend(`/message/sendText/${encodeURIComponent(instance)}`, { number, text: w }).catch((e) => console.error("welcome", e));
            }
          }
          const [{ data: rules }, { data: products }] = await Promise.all([
            db.from("training_rules").select("id, trigger_text, response_text, use_count").eq("store_id", cfg.store_id).limit(500),
            db.from("products").select("name, price, description").eq("store_id", cfg.store_id).limit(50),
          ]);
          const src = cfg.source ?? "smart";
          let m = src === "ai" ? null : bestRule(text, rules ?? []);
          if (m && m.score < 0.55) m = null;
          // Library: send a pre-recorded studio voice whose text best matches
          let libAudio: string | null = null;
          if (src === "library") {
            const { data: lib } = await db.from("studio_audio").select("id, text, path").eq("store_id", cfg.store_id).limit(300);
            const hit = bestRule(text, (lib ?? []).map((a) => ({ id: a.id, trigger_text: a.text, response_text: a.path, use_count: 0 })));
            if (hit && hit.score >= 0.45) {
              const dl = await db.storage.from("studio-audio").download(hit.rule.response_text);
              if (!dl.error) { libAudio = Buffer.from(await dl.data.arrayBuffer()).toString("base64"); m = { rule: { ...hit.rule, response_text: hit.rule.trigger_text }, score: hit.score }; }
            }
          }
          // Kingdom brains (merchant toggles + touches) when own rules miss
          let kingdom: { reply: string; textOnly: boolean } | null = null;
          if (!m && !libAudio && src !== "ai" && st.owner_id) {
            try { kingdom = await kingdomAutoReply(db, st.owner_id, text); } catch (e) { console.error("kingdom reply", e); }
            if (kingdom) m = { rule: { id: "", trigger_text: text, response_text: kingdom.reply, use_count: 0 }, score: 1 };
          }
          if (src === "rules" && !m) {
            await db.from("wa_inbox").update({ status: "skipped", error: "ما فيه رد مطابق في ردودك" }).eq("msg_id", msgId);
            return ok();
          }
          const useVoice = (cfg.voice && !kingdom?.textOnly) || !!libAudio;
          const cost = (m ? 1 : 2) + (useVoice && !libAudio ? 3 : 0);
          const { error: spendErr } = await db.rpc("spend_points_system", { _store: cfg.store_id, _amount: cost, _reason: "رد واتساب تلقائي" });
          if (spendErr) {
            await db.from("wa_inbox").update({ status: "skipped", error: "رصيد غير كافي" }).eq("msg_id", msgId);
            return ok();
          }
          let reply: string;
          if (m) {
            reply = m.rule.response_text;
            if (!libAudio && m.rule.id && !kingdom) await db.from("training_rules").update({ use_count: m.rule.use_count + 1 }).eq("id", m.rule.id);
          } else {
            const ctx = "منتجات المتجر:\n" + (products ?? []).map((p) => `- ${p.name}: ${p.price} ريال ${p.description}`).join("\n") +
              "\nردود المتجر المعتمدة:\n" + (rules ?? []).slice(0, 40).map((r) => `- إذا قال "${r.trigger_text}" → "${r.response_text}"`).join("\n");
            reply = await aiReplyWith(text, ctx, cfg);
          }
          if (!reply) throw new Error("empty reply");
          const path = `/message/${useVoice ? "sendWhatsAppAudio" : "sendText"}/${encodeURIComponent(instance)}`;
          if (useVoice) await evoSend(path, { number, audio: libAudio ?? (await fishTts(reply)), encoding: true, ptt: true });
          else await evoSend(path, { number, text: reply });
          await db.from("wa_inbox").update({ status: "done", reply }).eq("msg_id", msgId);
          await db.from("channel_messages").insert([
            { store_id: cfg.store_id, channel: "whatsapp", customer_phone: number, customer_name: d.pushName ?? "", direction: "in", text, replied: true },
            { store_id: cfg.store_id, channel: "whatsapp", customer_phone: number, direction: "out", text: reply, replied: true },
          ]);
          return ok();
        } catch (e) {
          await db.from("wa_inbox").update({ status: "failed", error: String((e as Error).message).slice(0, 300) }).eq("msg_id", msgId);
          console.error("autoreply failed", e);
          return ok();
        }
      },
    },
  },
});
