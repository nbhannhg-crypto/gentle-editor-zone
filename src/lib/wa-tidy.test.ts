import { staffAnswer } from "./staff";
import { tidyReply } from "./autoreply.server";
import { test, expect } from "vitest";
const id="الاسم: سارة\nوين ساكنة: الدمام";
test("من وين",()=>{for(const q of["من وين","من وين انتي"])expect(staffAnswer(q,id)).toContain("الدمام")});
test("وينك ليس سكن",()=>{expect(staffAnswer("وينك",id)).not.toContain("الدمام");expect(staffAnswer("وينك",id)).toMatch(/موجودة|جنبك/)});
test("طلب الصورة",()=>{expect(staffAnswer("ارسلي صورتك",id)).toMatch(/أستحي/)});
test("بلا سياسة",()=>{expect(tidyReply("سوري، لكنها مخالفة لسياسة التواصل")).not.toMatch(/سياسة/);expect(tidyReply("أرسله لك دلوقتي")).toBe("أرسله لك الحين")});
test("tidy",()=>{expect(tidyReply("أحبك (23)؛ وأشتاق (17)؛ وأكثر (4)")).toBe("أحبك");expect(tidyReply("هلا <الرد يمكن> قلبي")).toBe("هلا قلبي")});
