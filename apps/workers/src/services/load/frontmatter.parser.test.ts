import { describe, it, expect, vi, afterEach } from "vitest";
import { parseFrontmatter } from "./frontmatter.parser.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseFrontmatter", () => {
  describe("when there is no frontmatter", () => {
    it("returns empty frontmatter and unchanged body when file does not start with ---", () => {
      const content = "# Some Heading\nBody text.";
      const result = parseFrontmatter(content, "test.md");
      expect(result.frontmatter).toEqual({});
      expect(result.body).toBe(content);
    });

    it("returns empty frontmatter for an empty file", () => {
      const result = parseFrontmatter("", "empty.md");
      expect(result.frontmatter).toEqual({});
      expect(result.body).toBe("");
    });
  });

  describe("when frontmatter is valid", () => {
    it("parses content_type, spoiler_level, and default_area", () => {
      const content =
        "---\ncontent_type: boss_guide\nspoiler_level: 1\ndefault_area: underground facility\n---\n# Leon A\nBody.";
      const result = parseFrontmatter(content, "test.md");
      expect(result.frontmatter).toEqual({
        contentType: "boss_guide",
        spoilerLevel: 1,
        defaultArea: "underground facility",
      });
      expect(result.body).toBe("# Leon A\nBody.");
    });

    it("strips the frontmatter block (including delimiters) from the body", () => {
      const content = "---\ncontent_type: map_data\nspoiler_level: 0\n---\n# Heading\nContent.";
      const { body } = parseFrontmatter(content, "test.md");
      expect(body).toBe("# Heading\nContent.");
      expect(body).not.toContain("---");
    });

    it("normalises default_area to lowercase and trims whitespace", () => {
      const content = "---\ndefault_area:  Underground Facility  \n---\n# H1\n";
      const { frontmatter } = parseFrontmatter(content, "test.md");
      expect(frontmatter.defaultArea).toBe("underground facility");
    });

    it("parses spoiler_level as a number from a string value", () => {
      const content = "---\nspoiler_level: 2\n---\n# H1\n";
      const { frontmatter } = parseFrontmatter(content, "test.md");
      expect(frontmatter.spoilerLevel).toBe(2);
    });

    it("silently ignores unknown keys", () => {
      const content = "---\ncontent_type: area_guide\nunknown_key: ignored\n---\n# H1\n";
      const { frontmatter } = parseFrontmatter(content, "test.md");
      expect(frontmatter.contentType).toBe("area_guide");
      expect(frontmatter).not.toHaveProperty("unknown_key");
    });

    it("returns only valid fields when some are absent", () => {
      const content = "---\ncontent_type: full_walkthrough\n---\n# H1\n";
      const { frontmatter } = parseFrontmatter(content, "test.md");
      expect(frontmatter.contentType).toBe("full_walkthrough");
      expect(frontmatter.spoilerLevel).toBeUndefined();
      expect(frontmatter.defaultArea).toBeUndefined();
    });
  });

  describe("when frontmatter values are invalid", () => {
    it("drops invalid content_type and logs a warning", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const content = "---\ncontent_type: not_a_valid_type\nspoiler_level: 0\n---\n# H1\n";
      const { frontmatter } = parseFrontmatter(content, "bad.md");
      expect(frontmatter.contentType).toBeUndefined();
      expect(frontmatter.spoilerLevel).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("invalid content_type"));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("bad.md"));
    });

    it("drops invalid spoiler_level and logs a warning", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const content = "---\nspoiler_level: 9\ncontent_type: boss_guide\n---\n# H1\n";
      const { frontmatter } = parseFrontmatter(content, "bad.md");
      expect(frontmatter.spoilerLevel).toBeUndefined();
      expect(frontmatter.contentType).toBe("boss_guide");
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("invalid spoiler_level"));
    });

    it("drops spoiler_level that is not numeric", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const content = "---\nspoiler_level: high\n---\n# H1\n";
      const { frontmatter } = parseFrontmatter(content, "bad.md");
      expect(frontmatter.spoilerLevel).toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
    });

    it("drops default_area that is empty after normalisation and logs a warning", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const content = "---\ndefault_area:    \n---\n# H1\n";
      const { frontmatter } = parseFrontmatter(content, "bad.md");
      expect(frontmatter.defaultArea).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("invalid default_area"));
    });

    it("keeps valid fields even when other fields are invalid", () => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const content =
        "---\ncontent_type: invalid_type\nspoiler_level: 1\ndefault_area: main hall\n---\n# H1\n";
      const { frontmatter } = parseFrontmatter(content, "partial.md");
      expect(frontmatter.contentType).toBeUndefined();
      expect(frontmatter.spoilerLevel).toBe(1);
      expect(frontmatter.defaultArea).toBe("main hall");
    });
  });

  describe("malformed frontmatter", () => {
    it("treats the whole file as body when the closing --- is missing", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const content = "---\ncontent_type: boss_guide\n# No closing delimiter";
      const result = parseFrontmatter(content, "unclosed.md");
      expect(result.frontmatter).toEqual({});
      expect(result.body).toBe(content);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("unclosed frontmatter"));
    });
  });
});
