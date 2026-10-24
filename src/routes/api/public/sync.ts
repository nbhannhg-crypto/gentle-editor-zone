import { createFileRoute } from "@tanstack/react-router";

/** مزامنة النسخ الاحتياطية للكمبيوتر — محمي برمز سري لكل متجر (Authorization: Bearer <token>). */
export const Route = createFileRoute("/api/public/sync")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const tok = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
        if (!/^[a-f0-9]{64}$/.test(tok)) return new Response("unauthorized", { status: 401 });
        const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
        const { data: row } = await sb.from("training_rules").select("trigger_text").eq("response_text", tok).like("trigger_text", "sync_token:%").limit(1).maybeSingle();
        const storeId = row?.trigger_text.slice("sync_token:".length);
        if (!storeId) return new Response("unauthorized", { status: 401 });
        const [st, tr, mm, cu, ml] = await Promise.all([
          sb.from("stores").select("id, name, bio, business_type, whatsapp, created_at").eq("id", storeId),
          sb.from("training_rules").select("*").eq("store_id", storeId).limit(100000),
          sb.from("training_rules").select("trigger_text, response_text").like("trigger_text", `ml_meta:${storeId}:%`).limit(20000),
          sb.from("customers").select("*").eq("store_id", storeId).limit(50000),
          sb.from("media_library").select("*").eq("store_id", storeId).limit(20000),
        ]);
        const paths = (ml.data ?? []).map((m) => m.path);
        const { data: urls } = paths.length ? await sb.storage.from("media-library").createSignedUrls(paths, 3600) : { data: [] };
        return Response.json({
          manifest: { app: "kingdom-library-backup", version: 1, store_id: storeId, created_at: new Date().toISOString() },
          stores: st.data ?? [], training_rules: tr.data ?? [], media_meta: mm.data ?? [], customers: cu.data ?? [], media_library: ml.data ?? [],
          media: (ml.data ?? []).map((m, i) => ({ id: m.id, path: m.path, title: m.title, url: urls?.[i]?.signedUrl ?? null })),
        }, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
