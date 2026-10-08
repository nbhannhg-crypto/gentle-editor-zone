import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "تغيير كلمة المرور — مملكة المبيعات" },
      { name: "description", content: "اختر كلمة مرور جديدة لحسابك في مملكة المبيعات" },
      { property: "og:title", content: "تغيير كلمة المرور — مملكة المبيعات" },
      { property: "og:description", content: "اختر كلمة مرور جديدة لحسابك" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (): Promise<void> => {
    if (pw.length < 6) { toast.error("كلمة المرور ٦ أحرف فأكثر"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { toast.error("الرابط منتهي — اطلب رابط جديد"); return; }
    toast.success("تم تغيير كلمة المرور ✅");
    navigate({ to: "/app" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-soft">
        <h1 className="font-display text-center text-2xl text-primary">🔐 كلمة مرور جديدة</h1>
        <Input className="mt-6" type="password" dir="ltr" placeholder="كلمة المرور الجديدة" value={pw} onChange={(e) => setPw(e.target.value)} />
        <Button className="mt-3 w-full" disabled={busy} onClick={save}>{busy ? "لحظات…" : "احفظ"}</Button>
      </div>
    </div>
  );
}
