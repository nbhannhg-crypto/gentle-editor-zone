import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MicButton } from "@/components/MicButton";

type C = { id: string; subject: string; details: string; status: string; admin_reply: string; created_at: string; user_id: string };
const STATUS: Record<string, string> = { new: "🆕 جديدة", working: "⏳ قيد المعالجة", done: "✅ تم الحل", closed: "🔒 مغلقة" };

export function Complaints({ storeId, admin }: { storeId?: string | undefined; admin?: boolean | undefined }) {
  const [list, setList] = useState<C[]>([]);
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [replies, setReplies] = useState<Record<string, string>>({});

  const load = async () => {
    const { data } = await supabase.from("complaints").select("*").order("created_at", { ascending: false }).limit(200);
    setList((data ?? []) as C[]);
  };
  useEffect(() => { void load(); }, []);

  const send = async () => {
    if (subject.trim().length < 3) { toast.error("اكتب عنوان الشكوى"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("complaints").insert({ user_id: user.id, store_id: storeId ?? null, subject: subject.trim().slice(0, 200), details: details.trim().slice(0, 4000) });
    if (error) { toast.error(error.message); return; }
    setSubject(""); setDetails(""); toast.success("وصلتنا شكواك، بنتابعها 🌷"); await load();
  };

  const update = async (c: C, status: string) => {
    const { error } = await supabase.from("complaints").update({ status, admin_reply: replies[c.id] ?? c.admin_reply }).eq("id", c.id);
    if (error) toast.error(error.message); else { toast.success("تم التحديث"); await load(); }
  };

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-4">
      <h2 className="text-lg font-bold">📮 مكتب الشكاوى {admin && <span className="text-sm text-muted-foreground">(تشوفين كل الشكاوى)</span>}</h2>
      <div className="space-y-2">
        <div className="flex gap-2"><Input placeholder="عنوان الشكوى" value={subject} onChange={(e) => setSubject(e.target.value)} /><MicButton onText={(t) => setSubject((s) => `${s} ${t}`.trim())} /></div>
        <div className="flex gap-2"><Textarea placeholder="التفاصيل" value={details} onChange={(e) => setDetails(e.target.value)} /><MicButton onText={(t) => setDetails((s) => `${s} ${t}`.trim())} /></div>
        <Button onClick={send}>إرسال الشكوى</Button>
      </div>
      {!list.length && <p className="text-sm text-muted-foreground">ما فيه شكاوى.</p>}
      {list.map((c) => (
        <div key={c.id} className="space-y-1 rounded-xl border p-3">
          <div className="flex items-center justify-between gap-2"><b>{c.subject}</b><span className="text-xs">{STATUS[c.status] ?? c.status}</span></div>
          {c.details && <p className="text-sm text-muted-foreground">{c.details}</p>}
          <p className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString("ar-SA")}</p>
          {c.admin_reply && <p className="rounded bg-secondary p-2 text-sm">💬 رد الإدارة: {c.admin_reply}</p>}
          {admin && (
            <div className="space-y-2 pt-2">
              <Input placeholder="ردك على الشكوى" value={replies[c.id] ?? ""} onChange={(e) => setReplies({ ...replies, [c.id]: e.target.value })} />
              <div className="flex flex-wrap gap-2">
                {Object.entries(STATUS).filter(([k]) => k !== "new").map(([k, l]) => <Button key={k} size="sm" variant="secondary" onClick={() => update(c, k)}>{l}</Button>)}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
