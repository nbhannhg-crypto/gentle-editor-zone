import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type Product = { id: string; name: string; price: number; description: string };

export async function fetchProducts(storeId: string): Promise<Product[]> {
  const { data } = await supabase.from("products").select("*").eq("store_id", storeId).order("created_at");
  return (data ?? []) as Product[];
}

export function Products({ storeId }: { storeId?: string | undefined }) {
  const [items, setItems] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [desc, setDesc] = useState("");

  const reload = async (): Promise<void> => { if (storeId) setItems(await fetchProducts(storeId)); };
  useEffect(() => {
    reload();
    const h = () => { reload(); };
    window.addEventListener("data-changed", h);
    return () => window.removeEventListener("data-changed", h);
  }, [storeId]);

  const add = async (): Promise<void> => {
    if (!storeId || !name.trim()) { toast.error("اكتب اسم المنتج"); return; }
    const { error } = await supabase.from("products").insert({ store_id: storeId, name: name.trim(), price: Number(price) || 0, description: desc.trim() });
    if (error) { toast.error("تعذر الحفظ"); return; }
    setName(""); setPrice(""); setDesc("");
    toast.success("انضاف المنتج — الموظفة صارت تعرفه 🛍️");
    reload();
  };

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-soft">
      <h2 className="font-display mb-1 text-lg text-primary">🛍️ منتجاتك وأسعارك</h2>
      <p className="mb-4 text-sm text-muted-foreground">الموظفة تبيع من هذي القائمة وتذكر السعر الصحيح دايماً.</p>
      <div className="grid gap-2 md:grid-cols-[2fr_1fr_3fr_auto]">
        <Input placeholder="اسم المنتج" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="السعر ر.س" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        <Input placeholder="وصف قصير (التوصيل، الضمان…)" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <Button onClick={add}>+ أضف</Button>
      </div>
      <div className="mt-4 space-y-2">
        {items.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
            <div><p className="font-semibold">{p.name} — <span className="text-primary">{p.price} ر.س</span></p><p className="text-xs text-muted-foreground">{p.description}</p></div>
            <button className="text-xs" onClick={async () => { await supabase.from("products").delete().eq("id", p.id); reload(); }}>🗑️</button>
          </div>
        ))}
      </div>
    </section>
  );
}
