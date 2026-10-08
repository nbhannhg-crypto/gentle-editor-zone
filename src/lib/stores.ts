import { supabase } from "@/integrations/supabase/client";

export type Store = {
  id: string;
  name: string;
  owner_id: string;
  active: boolean;
  plan: string;
};

/** يرجع متجر التاجر الحالي، وينشئ له متجر جديد أول مرة يسجل فيها. */
export async function getOrCreateMyStore(): Promise<Store | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: existing } = await supabase.from("stores").select("*").eq("owner_id", user.id).limit(1);
  if (existing?.length) return existing[0] as Store;
  const name = (user.user_metadata?.['full_name'] as string) || user.email?.split("@")[0] || "متجري";
  const { data, error } = await supabase.from("stores").insert({ name: `متجر ${name}`, owner_id: user.id }).select().single();
  if (error) return null;
  await supabase.from("user_roles").insert({ user_id: user.id, role: "merchant" });
  return data as Store;
}

export async function isAdmin(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").limit(1);
  return Boolean(data?.length);
}
