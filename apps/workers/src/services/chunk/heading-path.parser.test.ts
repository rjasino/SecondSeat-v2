import { describe, it, expect } from "vitest";
import { parseHeadingPath } from "./heading-path.parser.js";

describe("parseHeadingPath", () => {
  it("maps segment[0] → route, segment[1] → area, segment[2] → sub_area", () => {
    const result = parseHeadingPath(
      "Leon A > Main Hall 1st Floor > Reception 1st Floor"
    );
    expect(result).toEqual({
      route: "leon a",
      area: "main hall 1st floor",
      sub_area: "reception 1st floor",
    });
  });

  it("maps a 2-segment path to route + area (no sub_area)", () => {
    expect(parseHeadingPath("Leon A > Underground Facility")).toEqual({
      route: "leon a",
      area: "underground facility",
    });
  });

  it("populates only route for a single-segment path", () => {
    expect(parseHeadingPath("Document")).toEqual({ route: "document" });
  });

  it("truncates to the first 3 segments when 4 or more are present", () => {
    const result = parseHeadingPath("A > B > C > D > E");
    expect(result).toEqual({ route: "a", area: "b", sub_area: "c" });
  });

  it("lowercases and trims each segment", () => {
    expect(parseHeadingPath("  Leon A  >  Underground Facility  ")).toEqual({
      route: "leon a",
      area: "underground facility",
    });
  });

  it("omits the area slot when it contains only whitespace", () => {
    // "A >  > B" splits to ["A", "", "B"]; empty segment is dropped,
    // but it still consumes the area slot positionally.
    const result = parseHeadingPath("A >  > B");
    expect(result.route).toBe("a");
    expect(result.area).toBeUndefined();
    expect(result.sub_area).toBe("b");
  });

  it("returns an empty object for empty or whitespace-only input", () => {
    expect(parseHeadingPath("")).toEqual({});
    expect(parseHeadingPath("   ")).toEqual({});
  });

  it("truncates a single segment longer than 200 chars", () => {
    const huge = "x".repeat(500);
    const result = parseHeadingPath(huge);
    expect(result.route).toHaveLength(200);
  });
});
