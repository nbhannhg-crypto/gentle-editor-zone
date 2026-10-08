import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — منصة المملكة" },
      { name: "description", content: "سجل دخولك أو أنشئ حساب تاجر جديد وابدأ تدريب موظفة المبيعات الذكية" },
      { property: "og:title", content: "تسجيل الدخول — منصة المملكة" },
      { property: "og:description", content: "سجل دخولك أو أنشئ حساب تاجر جديد" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    if (!email.trim() || !password) { toast.error("اكتب بريدك وكلمة السر"); return; }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        toast.success("تم إنشاء حسابك! راجع بريدك لتأكيد الحساب ثم سجل دخولك 📧");
        setMode("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        navigate({ to: "/app" });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تسجيل الدخول");
    }
    setBusy(false);
  };

  const forgot = async (): Promise<void> => {
    if (!email.trim()) { toast.error("اكتب بريدك أولاً"); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    if (error) { toast.error("تعذر الإرسال، جرب بعد شوي"); return; }
    toast.success("أرسلنا لك رابط تغيير كلمة المرور على بريدك 📧");
  };

  const google = async () => {
    const { error } = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (error) toast.error("تعذر الدخول بحساب جوجل");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-soft">
        <h1 className="font-display text-center text-3xl text-primary">👑 منصة المملكة</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {mode === "signup" ? "أنشئ حساب تاجر وابدأ تدريب موظفة المبيعات الذكية" : "أهلاً بعودتك"}
        </p>

        <Button variant="outline" className="mt-6 w-full" onClick={google}>
          🇬 الدخول بحساب جوجل
        </Button>

        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> أو بالبريد الإلكتروني <div className="h-px flex-1 bg-border" />
        </div>

        <div className="space-y-3">
          <Input type="email" dir="ltr" placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input type="password" dir="ltr" placeholder="كلمة السر (٦ أحرف فأكثر)" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button className="w-full" disabled={busy} onClick={submit}>
            {busy ? "لحظات…" : mode === "signup" ? "أنشئ حسابي كتاجر 🚀" : "سجل دخولي"}
          </Button>
        </div>

        {mode === "login" && (
          <button className="mt-3 w-full text-center text-xs text-muted-foreground underline" onClick={forgot}>
            نسيت كلمة المرور؟
          </button>
        )}


        <button
          className="mt-4 w-full text-center text-sm text-primary underline"
          onClick={() => setMode(mode === "signup" ? "login" : "signup")}
        >
          {mode === "signup" ? "عندك حساب؟ سجل دخولك" : "ما عندك حساب؟ سجل كتاجر جديد"}
        </button>
      </div>
    </div>
  );
}
