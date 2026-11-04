import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { runBackup } from "@/lib/backup.functions";

export const Route = createFileRoute("/api/public/jobs/backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const r = await runBackup();
        return Response.json({ ok: r.ok, sent: r.sent, skipped: r.skipped, files: r.files, filesLeft: r.filesLeft });
      },
    },
  },
});
