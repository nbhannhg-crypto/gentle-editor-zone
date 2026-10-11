import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { aiReplyWith, bestRule, evoSend, fishTts, kingdomAutoReply, kingdomWelcome, numberAllowed, typingDelay, type AiOpts } from "@/lib/autoreply.server";
import { replyDelay } from "@/lib/wa-learn";

const ok = (s = 200, t = "ok") => new Response(t, { status: s });

export const Route = createFileRoute("/api/public/evolution")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["EVO_WEBHOOK_SECRET"] ?? "";
        const t = new URL(request.url).searchParams.get("t") ?? "";
        // If a secret is configured, enforce it; otherwise accept (instance must still match a saved store config below).
        if (secret && (t.length !== secret.length || !timingSafeEqual(Buffer.from(t), Buffer.from(secret)))) return ok(401, "bad token");

        let body: any;
        try { body = await request.json(); } catch { return ok(400, "bad json"); }
        // WAHA format -> Evolution format
        let wahaChat = "";
        if (body?.event === "message" && body?.payload) {
          const pl = body.payload;
          const from = String(pl.from ?? "");
          wahaChat = from;
          body = {
            event: "messages.upsert",
            instance: new URL(request.url).searchParams.get("i") ?? "",
            data: { key: { remoteJid: from.replace(/@c\.us$/, "@s.whatsapp.net"), id: String(pl.id ?? Date.now()), fromMe: !!pl.fromMe }, pushName: pl._data?.notifyName ?? "", message: { conversation: String(pl.body ?? "") } },
          };
        }
        const event = String(body?.event ?? "").toLowerCase();
        if (event !== "messages.upsert" && event !== "messages_upsert") return ok();
        const instance = String(body?.instance ?? "");
        const d = Array.isArray(body?.data) ? body.data[0] : body?.data;
        const jid: string = d?.key?.remoteJid ?? "";
        const msgId: string = d?.key?.id ?? "";
        // Accept direct chats only: @s.whatsapp.net, @c.us and @lid (groups/status ignored)
        if (!d || d.key?.fromMe || !msgId || !/@(s\.whatsapp\.net|c\.us|lid)$/.test(jid)) return ok();
        const text: string = d.message?.conversation ?? d.message?.extendedTextMessage?.text ?? "";
        if (!text.trim()) return ok();
        // For WAHA reply to the exact chat id (works for @lid); Evolution uses plain number
        const number = wahaChat && wahaChat.endsWith("@lid") ? wahaChat : jid.split("@")[0]!;

        // Admin client when the server key exists; otherwise fall back to the public key (rules table is readable)
        let db: any;
        let limited = false;
        try {
          const mod = await import("@/integrations/supabase/client.server");
          db = mod.supabaseAdmin;
          await db.from("training_rules").select("id").limit(1);
        } catch {
          const { createClient } = await import("@supabase/supabase-js");
          const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"] || "https://fzbkadflmlwgrbuxbtey.supabase.co";
          const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || "sb_publishable_CMchUjkN04kOIT5y-z_6hA_A7mhsUmZ";
          db = createClient(url, key, {
            auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
            global: { fetch: (input: any, init: any) => { const h = new Headers(init?.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); } },
          });
          limited = true;
        }
        // select("*") so optional new columns are read when present, and nothing breaks when absent
        const { data: cfgRow } = await db.from("wa_autoreply").select("*").eq("instance", instance).maybeSingle();
        const cfg = cfgRow as ({ store_id: string; enabled: boolean; voice: boolean; source: string | null } & AiOpts & { allowed_numbers?: string | null }) | null;
        if (!cfg) {
          // Settings locked (no server key): still answer from saved rules exactly like the in-app test
          // No store config for this session: still answer from saved rules (same as in-app test)
          try {
            const all: { id: string; trigger_text: string; response_text: string; use_count: number }[] = [];
            for (let from = 0; ; from += 1000) {
              const { data, error } = await db.from("training_rules").select("id, trigger_text, response_text, use_count").order("id").range(from, from + 999);
              if (error || !data) break;
              all.push(...data);
              if (data.length < 1000) break;
            }
            const hit = bestRule(text, all);
            let reply = hit && hit.score >= 0.6 ? hit.rule.response_text : "";
            if (!reply) {
              // ما فيه قاعدة مطابقة بقوة: الذكاء يفهم القصد ويرد بأسلوب القواعد
              const qw = text.split(/\s+/).filter((w) => w.length > 2);
              const related = all.filter((r) => qw.some((w) => r.trigger_text.includes(w))).slice(0, 30);
              const pool = [...related, ...all.filter((r) => !related.includes(r)).slice(0, 40 - related.length)];
              const ctx = "ردود المتجر المعتمدة (افهمي قصد الزبون واختاري الرد الأنسب منها بنفس الكلام، ولا تردي برد لا يناسب سؤاله، وردي باختصار):\n" + pool.map((r) => `- إذا قال "${r.trigger_text}" → "${r.response_text}"`).join("\n");
              reply = await aiReplyWith(text, ctx, {} as AiOpts).catch(() => "");
            }
            if (reply) {
              await typingDelay(number, 3);
              await evoSend(`/message/sendText/${encodeURIComponent(instance)}`, { number, text: reply });
            }
          } catch (e) { console.error("limited autoreply", e); }
          return ok();
        }
        if (!cfg?.enabled) return ok();
        if (!numberAllowed(cfg.allowed_numbers, number)) {
          console.log(`تم تجاهل رسالة من رقم غير مسموح: ${number}`);
          return ok();
        }
        const { data: st } = await db.from("stores").select("active, owner_id, name").eq("id", cfg.store_id).maybeSingle();
        if (!st?.active) return ok();

        // Durable inbox + dedupe (archive failure never blocks the reply)
        const { error: insErr } = await db.from("wa_inbox").insert({ msg_id: msgId, instance, store_id: cfg.store_id, from_number: number, text: text.slice(0, 2000) });
        if (insErr) {
          if (insErr.code === "23505") {
            const { data: prev } = await db.from("wa_inbox").select("status").eq("msg_id", msgId).maybeSingle();
            if (prev?.status === "done" || prev?.status === "skipped") return ok();
          } else console.error("wa_inbox insert", insErr.message);
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
          // Load ALL store rules (newest first, paged) — same as the library test, no 500 cap
          const loadAllRules = async () => {
            const all: { id: string; trigger_text: string; response_text: string; use_count: number }[] = [];
            // No cap: stable id ordering + retry each page so every rule (even millions) is read
            for (let from = 0; ; from += 1000) {
              let page: typeof all | null = null;
              for (let attempt = 0; attempt < 3 && !page; attempt++) {
                const { data, error } = await db.from("training_rules").select("id, trigger_text, response_text, use_count")
                  .eq("store_id", cfg.store_id).order("id").range(from, from + 999);
                if (!error && data) page = data;
                else console.error("loadAllRules page", from, error?.message);
              }
              if (!page) break;
              all.push(...page);
              if (page.length < 1000) break;
            }
            return all;
          };
          const [rules, { data: products }] = await Promise.all([
            loadAllRules().then((r) => ({ data: r })).then((x) => x.data),
            db.from("products").select("name, price, description").eq("store_id", cfg.store_id).limit(50),
          ]);
          const src = cfg.source ?? "smart";
          let m = src === "ai" ? null : bestRule(text, rules ?? []);
          // تدقيق: المطابقة الضعيفة ما تنرسل كما هي — الذكاء يفهم القصد بدلها
          if (m && m.score < 0.6) m = null;
          // Library: send a pre-recorded studio voice whose text best matches
          let libAudio: string | null = null;
          if (src === "library") {
            const { data: lib } = await db.from("studio_audio").select("id, text, path").eq("store_id", cfg.store_id).limit(300);
            const hit = bestRule(text, (lib ?? []).map((a: any) => ({ id: a.id, trigger_text: a.text, response_text: a.path, use_count: 0 })));
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
            console.error("spend_points_system", spendErr.message);
            const lowBalance = /insufficient|رصيد|balance/i.test(spendErr.message || "");
            // ردود القواعد/المكتبة لا تتعطل بسبب فشل الخصم — فقط الرد الذكي يتوقف عند نقص الرصيد الفعلي
            if (!m && lowBalance) {
              await db.from("wa_inbox").update({ status: "skipped", error: "رصيد غير كافي" }).eq("msg_id", msgId);
              return ok();
            }
          }
          let reply: string;
          if (m) {
            reply = m.rule.response_text;
            if (!libAudio && m.rule.id && !kingdom) await db.from("training_rules").update({ use_count: m.rule.use_count + 1 }).eq("id", m.rule.id);
          } else {
            // أقرب القواعد لرسالة الزبون (مو أول 40 عشوائية) عشان الذكاء يرد بأسلوبك وكلامك
            const qw = text.split(/\s+/).filter((w) => w.length > 2);
            const related = (rules ?? []).filter((r) => qw.some((w) => r.trigger_text.includes(w))).slice(0, 30);
            const pool = [...related, ...(rules ?? []).filter((r) => !related.includes(r)).slice(0, 40 - related.length)];
            const ctx = "منتجات المتجر:\n" + (products ?? []).map((p: any) => `- ${p.name}: ${p.price} ريال ${p.description}`).join("\n") +
              "\nردود المتجر المعتمدة (افهمي قصد الزبون واختاري الرد الأنسب منها بنفس الكلام، ولا تردي برد لا يناسب سؤاله):\n" + pool.map((r) => `- إذا قال "${r.trigger_text}" → "${r.response_text}"`).join("\n");
            reply = await aiReplyWith(text, ctx, cfg);
          }
          if (!reply) throw new Error("empty reply");
          await typingDelay(number, replyDelay(cfg.system_prompt));
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
