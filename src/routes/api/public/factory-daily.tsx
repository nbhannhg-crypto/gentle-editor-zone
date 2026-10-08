import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { runTrainingBatch } from "@/lib/factory.server";

// Daily training job (runs at 3am via the platform scheduler):
// processes a bounded batch of queued texts, scores each generation,
// auto-saves anything that passes the pronunciation check.
export const Route = createFileRoute("/api/public/factory-daily")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = await authenticateCronRequest(request);
        if (unauth) return unauth;
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

        // Single-flight: a second run exits while one is active
        const { data: lock } = await db.from("app_settings").select("value").eq("key", "factory_lock").maybeSingle();
        if (lock?.value && Date.parse(lock.value) > Date.now()) return new Response("busy", { status: 200 });

        const { data: paused } = await db.from("app_settings").select("value").eq("key", "factory_paused").maybeSingle();
        if (paused?.value === "1") return new Response("paused", { status: 200 });

        await db.from("app_settings").upsert({ key: "factory_lock", value: new Date(Date.now() + 15 * 60_000).toISOString() }, { onConflict: "key" });
        try {
          const { trained, summary } = await runTrainingBatch(db as never, 6);
          return new Response(JSON.stringify({ trained, summary }), { status: 200, headers: { "Content-Type": "application/json" } });
        } finally {
          await db.from("app_settings").upsert({ key: "factory_lock", value: "" }, { onConflict: "key" });
        }
      },
    },
  },
});
