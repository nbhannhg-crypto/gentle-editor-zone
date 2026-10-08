import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  PLATFORMS, fetchChannels, upsertChannel, toggleChannel, fetchChannelMessages,
  type Channel, type ChannelMessage,
} from "@/lib/channels";
import { waList } from "@/lib/studio.functions";
import { WhatsApp, type Wa } from "@/components/WaAccounts";
import { supabase } from "@/integrations/supabase/client";

export function Channels({ storeId }: { storeId?: string | undefined }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [was, setWas] = useState<Wa[]>([]);

  const listWa = useServerFn(waList);
  const loadWa = async () => { try { setWas(await listWa()); } catch (e) { toast.error((e as Error).message); } };
  useEffect(() => { void loadWa(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = async (): Promise<void> => {
    setChannels(await fetchChannels(storeId));
    setMessages(await fetchChannelMessages(100, storeId));
  };
  useEffect(() => { reload(); }, [storeId]);

  const addAccount = async (platform: string): Promise<void> => {
    const label = labels[platform]?.trim();
    if (!label) { toast.error("اكتب اسم الحساب أو الرقم أولاً"); return; }
    const { error } = await upsertChannel(platform, label, storeId);
    if (error) { toast.error("تعذر الحفظ"); return; }
    toast.success("انضاف الحساب ✅ — فعّل الرد التلقائي متى ما جاهز");
    setLabels({ ...labels, [platform]: "" });
    reload();
  };

  const removeAccount = async (id: string): Promise<void> => {
    await supabase.from("channels").delete().eq("id", id);
    reload();
  };

  return (
    <div className="space-y-6">
      <WhatsApp was={was} reload={loadWa} />
      <section className="rounded-2xl border bg-card p-5 shadow-soft">
        <h2 className="font-display mb-1 text-lg text-primary">📡 قنوات الرد التلقائي</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          اربط حساباتك — وتقدر تضيف أكثر من حساب لنفس المنصة (واتساب فرع الرياض + واتساب فرع جدة مثلاً) — وخلّ الموظفة ترد تلقائياً من قواعدك وذكائها.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {PLATFORMS.map((p) => {
            const accounts = channels.filter((c) => c.platform === p.id);
            return (
              <div key={p.id} className="rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{p.icon}</span>
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.desc}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{accounts.length} حساب • 🧪 وضع التجربة</span>
                </div>

                {accounts.map((ch) => (
                  <div key={ch.id} className="mt-3 rounded-lg bg-secondary/60 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{ch.label}</span>
                      <button className="text-xs text-muted-foreground" onClick={() => removeAccount(ch.id)}>🗑️</button>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-xs">الرد التلقائي {ch.auto_reply ? "شغال ✅" : "متوقف ⏸️"}</span>
                      <Switch
                        checked={ch.auto_reply}
                        onCheckedChange={async (v) => { await toggleChannel(ch.id, { auto_reply: v }); reload(); }}
                      />
                    </div>
                  </div>
                ))}

                <div className="mt-3 flex gap-2">
                  <Input
                    placeholder="اسم الحساب / رقم الواتساب"
                    value={labels[p.id] ?? ""}
                    onChange={(e) => setLabels({ ...labels, [p.id]: e.target.value })}
                  />
                  <Button variant="outline" onClick={() => addAccount(p.id)}>+ أضف</Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-soft">
        <h2 className="font-display mb-2 text-lg text-primary">🔗 طريقة الربط السريع</h2>
        <ol className="list-decimal space-y-1 pr-5 text-sm text-muted-foreground">
          <li>اكتب اسم الحساب (مثال: واتساب الأعمال) ودوس + أضف</li>
          <li>بيطلع لك QR Code داخل الموقع</li>
          <li>افتح واتساب بجوالك {'>'} الإعدادات {'>'} الأجهزة المرتبطة {'>'} ربط جهاز</li>
          <li>صوّر الكود</li>
          <li>انتظر ثانيتين وبيظهر «متصل ✅» مع صورتك</li>
        </ol>
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-soft">
        <h2 className="font-display mb-3 text-lg text-primary">📥 صندوق الرسائل الموحد</h2>
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد رسائل بعد — أول ما يراسلك زبون على قناة مربوطة تظهر رسالته هنا.</p>
        ) : (
          <div className="space-y-2">
            {messages.map((m) => (
              <div key={m.id} className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${m.direction === "out" ? "bg-secondary/50" : ""}`}>
                <span>{m.direction === "in" ? "📩" : "🤖"}</span>
                <div className="flex-1">
                  <p className="font-medium">{m.customer_name || m.customer_phone} <span className="text-xs text-muted-foreground">({m.channel})</span></p>
                  <p>{m.text}</p>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString("ar-SA")}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
