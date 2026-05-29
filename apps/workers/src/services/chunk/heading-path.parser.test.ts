import { describe, it, expect } from "vitest";
import { parseHeadingPath } from "./heading-path.parser.js";

describe("parseHeadingPath", () => {
  it("parses a four-segment path positionally with lowercased values", () => {
    const result = parseHeadingPath(
      "Leon A > Get to the RPD (Leon) > Navigate the Sewers (Leon) > Save Ada"
    );
    expect(result).toEqual({
      route: "leon a",
      chapter: "get to the rpd (leon)",
      area: "navigate the sewers (leon)",
      sub_area: "save ada",
    });
  });

  it("populates only present segments when fewer than four exist", () => {
    expect(parseHeadingPath("Walkthrough > Side Quests")).toEqual({
      route: "walkthrough",
      chapter: "side quests",
    });
  });

  it("populates only segment[0] for a single-segment path", () => {
    expect(parseHeadingPath("Document")).toEqual({ route: "document" });
  });

  it("truncates to the first four segments when more exist", () => {
    const result = parseHeadingPath(
      "A > B > C > D > E > F"
    );
    expect(result).toEqual({
      route: "a",
      chapter: "b",
      area: "c",
      sub_area: "d",
    });
  });

  it("trims whitespace inside segments", () => {
    expect(parseHeadingPath("  Leon A  >  Sewers  ")).toEqual({
      route: "leon a",
      chapter: "sewers",
    });
  });

  it("omits empty segments produced by adjacent separators", () => {
    // Splitting "A >  > B" on " > " yields ["A", "", "B"]; the empty segment
    // is dropped, but it still consumes the chapter slot positionally — that's
    // acceptable for the v1 mapping and matches the strict-positional contract.
    const result = parseHeadingPath("A >  > B");
    expect(result.route).toBe("a");
    expect(result.chapter).toBeUndefined();
    expect(result.area).toBe("b");
  });

  it("returns an empty object for empty input", () => {
    expect(parseHeadingPath("")).toEqual({});
    expect(parseHeadingPath("   ")).toEqual({});
  });

  it("truncates a single segment longer than 200 chars", () => {
    const huge = "x".repeat(500);
    const result = parseHeadingPath(huge);
    expect(result.route).toHaveLength(200);
  });
});
