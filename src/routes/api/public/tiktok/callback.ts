import { createFileRoute } from "@tanstack/react-router";
import { defaultTtCtrl } from "@/lib/tiktok-types";

export const Route = createFileRoute("/api/public/tiktok/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code") ?? "";
        const state = (url.searchParams.get("state") ?? "").replace(/[^a-z0-9]/gi, "").slice(0, 64);
        const back = (o: string, msg: string) => Response.redirect(`${o}/studio?tiktok=${encodeURIComponent(msg)}`, 302);
        if (!code || !state) return new Response("طلب غير صالح", { status: 400 });
        const { admin, ttStateKey, loadAccounts, saveAccounts } = await import("@/lib/tiktok.server");
        const db = await admin();
        // state must exist (created by the signed-in merchant) and be fresh — then it's single use
        const { data: st } = await db.from("training_rules").select("id, response_text").eq("trigger_text", ttStateKey(state)).limit(1).maybeSingle();
        if (!st) return new Response("انتهت صلاحية الطلب", { status: 400 });
        await db.from("training_rules").delete().eq("id", st.id);
        const s = JSON.parse(st.response_text) as { store: string; origin: string; at: number };
        if (Date.now() - s.at > 15 * 60_000) return back(s.origin, "expired");
        const key = process.env["TIKTOK_CLIENT_KEY"], secret = process.env["TIKTOK_CLIENT_SECRET"];
        if (!key || !secret) return back(s.origin, "not_configured");
        try {
          const tr = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ client_key: key, client_secret: secret, code, grant_type: "authorization_code", redirect_uri: `${s.origin}/api/public/tiktok/callback` }),
          });
          const t = (await tr.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; open_id?: string };
          if (!t.access_token || !t.open_id) { console.error("tiktok token", tr.status); return back(s.origin, "failed"); }
          let name = "حساب تيك توك", avatar = "";
          const ur = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url", { headers: { Authorization: `Bearer ${t.access_token}` } });
          if (ur.ok) { const u = (await ur.json()) as { data?: { user?: { display_name?: string; avatar_url?: string } } }; name = u.data?.user?.display_name || name; avatar = u.data?.user?.avatar_url || ""; }
          const list = await loadAccounts(s.store);
          const old = list.find((a) => a.open_id === t.open_id);
          const acc = { open_id: t.open_id, name, avatar, token: t.access_token, refresh: t.refresh_token ?? "", expires: Date.now() + (t.expires_in ?? 0) * 1000, ctrl: old?.ctrl ?? defaultTtCtrl(), log: old?.log ?? [], linked_at: Date.now() };
          await saveAccounts(s.store, [...list.filter((a) => a.open_id !== t.open_id), acc]);
          return back(s.origin, "ok");
        } catch (e) { console.error("tiktok callback", e); return back(s.origin, "failed"); }
      },
    },
  },
});
