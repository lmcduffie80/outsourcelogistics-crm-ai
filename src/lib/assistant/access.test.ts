import { describe, expect, it } from "vitest";
import { allowedToolNames } from "./access";

describe("allowedToolNames", () => {
  it("withholds team metrics from reps", () => {
    const tools = allowedToolNames("rep");
    expect(tools).not.toContain("teamMetrics");
    expect(tools).toEqual(expect.arrayContaining(["searchOrders", "getInquiry", "draftReply", "myMetrics"]));
  });

  it.each(["manager", "admin"] as const)("gives %s team metrics", (role) => {
    expect(allowedToolNames(role)).toContain("teamMetrics");
  });
});
