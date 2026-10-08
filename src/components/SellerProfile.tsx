import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { BUSINESS_TYPES } from "@/lib/bots";
import { saveProfile } from "@/lib/bots.functions";

export function SellerProfile({ storeId }: { storeId?: string | undefined }) {
  const save = useServerFn(saveProfile);
  const [f, setF] = useState({ name: "", business_type: "products", bio: "", whatsapp: "" });
  useEffect(() => {
    if (!storeId) return;
    void supabase.from("stores").select("name, business_type, bio, whatsapp").eq("id", storeId).maybeSingle()
      .then(({ data }) => { if (data) setF(data as typeof f); });
  }, [storeId]);
  const link = storeId ? `${window.location.origin}/s/${storeId}` : "";
  const go = async (): Promise<void> => {
    try { await save({ data: { ...f, whatsapp: f.whatsapp.replace(/\D/g, "") } }); toast.success("✅ انحفظ ملفك"); }
    catch (e) { toast.error((e as Error).message); }
  };
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5">
      <h2 className="font-display text-xl">🏪 ملفي وصفحة متجري</h2>
      <label className="block text-sm">اسم المتجر<Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <div>
        <p className="mb-1 text-sm">وش نشاطك؟</p>
        <div className="flex flex-wrap gap-2">
          {BUSINESS_TYPES.map(([k, l]) => (
            <button key={k} onClick={() => setF({ ...f, business_type: k })} className={`rounded-full border px-3 py-1 text-sm ${f.business_type === k ? "bg-primary text-primary-foreground" : "bg-background"}`}>{l}</button>
          ))}
        </div>
      </div>
      <label className="block text-sm">نبذة عنك وعن خدماتك<Textarea rows={3} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value.slice(0, 500) })} /></label>
      <label className="block text-sm">رقم واتساب للطلبات (مثل 9665xxxxxxxx)<Input dir="ltr" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} /></label>
      <Button onClick={go} className="w-full">💾 احفظ</Button>
      {link && (
        <div className="rounded-xl bg-muted p-3 text-sm">
          <p>🔗 رابط صفحة متجرك العامة — شاركيه مع زبائنك:</p>
          <div className="mt-2 flex gap-2">
            <Input dir="ltr" readOnly value={link} />
            <Button variant="secondary" onClick={() => { void navigator.clipboard.writeText(link); toast.success("انسخ ✅"); }}>نسخ</Button>
            <Button variant="outline" onClick={() => window.open(link, "_blank")}>فتح</Button>
          </div>
        </div>
      )}
    </section>
  );
}
