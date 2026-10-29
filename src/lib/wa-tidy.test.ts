import { staffAnswer } from "./staff";
import { tidyReply } from "./autoreply.server";
import { test, expect } from "vitest";
const id="الاسم: سارة\nوين ساكنة: الدمام";
test("من وين",()=>{for(const q of["من وين","من وين انتي"])expect(staffAnswer(q,id)).toContain("الدمام")});
test("وينك ليس سكن",()=>{expect(staffAnswer("وينك",id)).not.toContain("الدمام");expect(staffAnswer("وينك",id)).not.toContain('ساكنة')});
test("طلب الصورة",()=>{expect(PHOTO_EXCUSES).toContain(staffAnswer("ارسلي صورتك",id))});
test("بلا سياسة",()=>{expect(tidyReply("سوري، لكنها مخالفة لسياسة التواصل")).not.toMatch(/سياسة/);expect(tidyReply("أرسله لك دلوقتي")).toBe("أرسله لك الحين")});
test("tidy",()=>{expect(tidyReply("أحبك (23)؛ وأشتاق (17)؛ وأكثر (4)")).toBe("أحبك");expect(tidyReply("هلا <الرد يمكن> قلبي")).toBe("هلا قلبي")});

test("رفض آلي يُستبدل",()=>{const r=tidyReply("أعتذر، لكن لا يمكنني تقديم محتوى غير لائق. كوني مساعد ذكاء صناعي");expect(SOFT_DODGE).toContain(r);});
test("فيديو وهوية",()=>{expect(VIDEO_EXCUSES).toContain(staffAnswer("ارسلي فيديو",id));expect(IDENTITY_EXCUSES).toContain(staffAnswer("انت بنت يمنية",id));});
test("الأعذار لا تتكرر متتالية",()=>{const a=staffAnswer("ارسلي صورتك",id),b=staffAnswer("ارسلي صورتك",id),c=staffAnswer("ارسلي صورتك",id);expect(new Set([a,b,c]).size).toBe(3);});
