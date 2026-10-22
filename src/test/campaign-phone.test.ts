import { describe, it, expect } from "vitest";
import { cleanPhone } from "@/components/Campaigns";
describe("cleanPhone", () => {
  it("converts 05 to 9665", () => expect(cleanPhone("0544810389")).toBe("966544810389"));
  it("rejects garbage", () => expect(cleanPhone("abc12")).toBe(""));
});
