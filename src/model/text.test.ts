import { describe, expect, it } from "vitest";
import { plural } from "./text";

describe("plural", () => {
  it("counts a noun without ever reading '1 nodes'", () => {
    expect(plural(0, "node")).toBe("0 nodes");
    expect(plural(1, "node")).toBe("1 node");
    expect(plural(2, "node")).toBe("2 nodes");
  });

  it("takes an irregular plural when the s does not fit", () => {
    expect(plural(1, "entry", "entries")).toBe("1 entry");
    expect(plural(3, "entry", "entries")).toBe("3 entries");
  });
});
