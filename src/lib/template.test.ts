import { describe, expect, it } from "vitest";
import { formatDuration } from "./format";
import { renderTemplate } from "./template";

describe("renderTemplate", () => {
  it("fills known fields and blanks unknown ones", () => {
    expect(renderTemplate("Hi {{firstName}} [{{inquiryNumber}}]{{nope}}", { firstName: "Pat", inquiryNumber: "INQ-7" })).toBe(
      "Hi Pat [INQ-7]",
    );
  });
});

describe("formatDuration", () => {
  it.each([
    [null, "—"],
    [45, "45m"],
    [120, "2h"],
  ])("formats %s minutes", (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected);
  });
});
