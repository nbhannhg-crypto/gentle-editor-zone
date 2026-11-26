import { createFileRoute, Link } from "@tanstack/react-router";
import { SmsSender } from "@/components/SmsSender";
import { smsQueryOptions } from "@/lib/sms-query";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sms")({
  head: () => ({ meta: [
    { title: "الرسائل النصية — أم ندى" },
    { name: "description", content: "إرسال الرسائل النصية وحفظ جهات الاتصال والمسودات وتتبع التكلفة والتسليم في موقع أم ندى." },
    { property: "og:title", content: "الرسائل النصية — أم ندى" },
    { property: "og:description", content: "جهات اتصال ورسائل محفوظة، مع حساب الحروف والمقاطع وحالة التسليم." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(smsQueryOptions(context.user.id)),
  errorComponent: ({ error, reset }) => <div dir="rtl" className="mx-auto max-w-3xl space-y-4 p-4"><p role="alert">{error.message}</p><Button onClick={reset}>إعادة المحاولة</Button><Button asChild variant="outline"><Link to="/studio">العودة للهاتف</Link></Button></div>,
  component: SmsPage,
});

function SmsPage() {
  return <main dir="rtl" className="mx-auto min-h-screen max-w-4xl space-y-6 px-4 py-6">
    <Button asChild variant="ghost" size="sm"><Link to="/studio"><ArrowRight className="size-4" /> استوديو الأصوات والهاتف</Link></Button>
    <SmsSender expanded />
  </main>;
}