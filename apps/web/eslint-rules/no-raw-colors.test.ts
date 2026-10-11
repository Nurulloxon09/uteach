import { describe, expect, it } from "vitest";
import { rawColorIn } from "./no-raw-colors.mjs";

describe("rawColorIn", () => {
  it.each([
    ["bg-blue-500", "palette"],
    ["flex text-white", "palette"],
    ["hover:border-gray-200/50 p-2", "palette"],
    ["bg-[#f0f0f0]", "arbitrary"],
    ["text-[oklch(0.5_0.1_200)]", "arbitrary"],
    ["#1f2937", "value"],
    ["rgb(0 0 0 / 50%)", "value"],
    ["oklch(0.6 0.15 155)", "value"],
  ])("flags %s", (text, kind) => {
    expect(rawColorIn(text)).toBe(kind);
  });

  it.each([
    "bg-primary text-primary-foreground",
    "bg-stat-blue/15 text-muted-foreground",
    "border-border/70 shadow-card",
    "ID #0031",
    "text-[15px] rounded-[7px]",
    "Room 3 · 12 students",
    "bg-primary-soft",
  ])("allows %s", (text) => {
    expect(rawColorIn(text)).toBeNull();
  });
});
