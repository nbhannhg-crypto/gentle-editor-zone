import { supabase } from "@/integrations/supabase/client";

export type Channel = {
  id: string;
  platform: string;
  label: string;
  auto_reply: boolean;
  connected: boolean;
};

export type ChannelMessage = {
  id: string;
  channel: string;
  customer_name: string;
  customer_phone: string;
  direction: "in" | "out";
  text: string;
  replied: boolean;
  created_at: string;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  channel: string;
  notes: string;
  purchases: string;
  last_message: string;
  last_seen: string;
  rating: number;
  created_at: string;
};

export const PLATFORMS = [
  { id: "whatsapp", name: "واتساب للأعمال", icon: "🟢", desc: "الرد التلقائي على رسائل واتساب" },
  { id: "instagram", name: "انستقرام", icon: "🟣", desc: "الرد على رسائل دايركت انستقرام" },
  { id: "messenger", name: "فيسبوك ماسنجر", icon: "🔷", desc: "الرد على رسائل صفحة فيسبوك" },
  { id: "telegram", name: "تيليقرام", icon: "🔵", desc: "بوت تيليقرام يرد على زبائنك" },
  { id: "tiktok", name: "تيك توك", icon: "⚫", desc: "الرد على رسائل وتعليقات تيك توك" },
  { id: "snapchat", name: "سناب شات", icon: "🟡", desc: "الرد على محادثات سناب" },
  { id: "x", name: "إكس (تويتر)", icon: "✖️", desc: "الرد على الرسائل الخاصة والمنشن" },
] as const;

export async function fetchChannels(storeId?: string): Promise<Channel[]> {
  let q = supabase.from("channels").select("*").order("created_at");
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q;
  if (error) return [];
  return data as Channel[];
}

export async function upsertChannel(platform: string, label: string, storeId?: string) {
  return supabase.from("channels").insert({ platform, label, store_id: storeId ?? null });
}

export async function toggleChannel(id: string, patch: Partial<Channel>) {
  return supabase.from("channels").update(patch).eq("id", id);
}

export async function fetchChannelMessages(limit = 100, storeId?: string): Promise<ChannelMessage[]> {
  let q = supabase.from("channel_messages").select("*").order("created_at", { ascending: false }).limit(limit);
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q;
  if (error) return [];
  return data as ChannelMessage[];
}

export async function fetchCustomers(storeId?: string): Promise<Customer[]> {
  let q = supabase.from("customers").select("*").order("last_seen", { ascending: false });
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q;
  if (error) return [];
  return data as Customer[];
}

export async function saveCustomer(c: Partial<Customer> & { id?: string }, storeId?: string) {
  if (c.id) return supabase.from("customers").update(c).eq("id", c.id);
  return supabase.from("customers").insert({ ...c, store_id: storeId ?? null });
}

export async function deleteCustomer(id: string) {
  return supabase.from("customers").delete().eq("id", id);
}
