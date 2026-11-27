import { expect, it } from "vitest";
import { estimateSmsCost, normalizeSmsNumber, smsMetrics, smsRouteProblem } from "./sms";

const usLocal = { number: "+12025550123", country: "US", profile: true, domestic: true, international: false };

it("blocks a sender without international SMS from texting Saudi numbers", () => {
  expect(smsRouteProblem(usLocal, "+966580158578")).toContain("دولياً");
});

it("allows a profiled international sender", () => {
  expect(smsRouteProblem({ ...usLocal, international: true }, "+966580158578")).toBe("");
});

it("normalizes pasted Arabic digits and 00 prefix", () => {
  expect(normalizeSmsNumber("00٩٦٦ ٥٨٠ ١٥٨ ٥٧٨")).toBe("+966580158578");
});

it("counts Arabic as 70 per single part and splits at 71", () => {
  expect(smsMetrics("ا".repeat(70)).parts).toBe(1);
  expect(smsMetrics("ا".repeat(71)).parts).toBe(2);
});

it("estimates cost per part from a delivered message only", () => {
  expect(estimateSmsCost(2, { parts: 1, cost_amount: "0.05", cost_currency: "USD" })).toEqual({ amount: "0.10000", currency: "USD" });
  expect(estimateSmsCost(2, undefined)).toBeNull();
});