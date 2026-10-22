import { describe, it, expect } from "vitest";
import { bestMedia, scoreMedia } from "@/lib/media-match";

const base = { title: "", transcript: "", tags: [], questions: [], ocr: "", active: true };

describe("media matcher", () => {
  it("exact trigger phrase scores 100", () => {
    expect(scoreMedia("ابي اشوف درجات اللون لو سمحت", { ...base, id: "a", triggers: ["درجات اللون"] })).toBe(100);
  });
  it("disabled items are never chosen", () => {
    expect(bestMedia("درجات اللون", [{ ...base, id: "a", triggers: ["درجات اللون"], active: false }])).toBeNull();
  });
});
