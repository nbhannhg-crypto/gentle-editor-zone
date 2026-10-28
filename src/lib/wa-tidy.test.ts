import { staffAnswer } from "./staff";
import { tidyReply } from "./autoreply.server";
import { test, expect } from "vitest";
const id="الاسم: سارة\nوين ساكنة: الدمام";
test("من وين",()=>{for(const q of["من وين","من وين انتي","وينك"])expect(staffAnswer(q,id)).toContain("الدمام")});
test("tidy",()=>{expect(tidyReply("أحبك (23)؛ وأشتاق (17)؛ وأكثر (4)")).toBe("أحبك");expect(tidyReply("هلا <الرد يمكن> قلبي")).toBe("هلا قلبي")});
