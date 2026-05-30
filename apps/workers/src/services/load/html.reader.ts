import * as cheerio from "cheerio";
import type { Element, AnyNode, Text } from "domhandler";
import { IngestionError, type LoadedDocument } from "./md.reader.js";

export function loadHtml(html: string, filename: string): LoadedDocument {
  if (!html.trim()) {
    throw new IngestionError("empty_content", "HTML file is empty");
  }

  const $ = cheerio.load(html);
  $("script, style, noscript, [hidden]").remove();

  // Strip inline event handlers
  $("*").each((_i, el) => {
    const elem = el as Element;
    if (elem.attribs) {
      for (const attr of Object.keys(elem.attribs)) {
        if (attr.startsWith("on")) $(elem).removeAttr(attr);
      }
    }
  });

  // Convert to normalised markdown-like text (headings as # prefix)
  const HEADING_MAP: Record<string, string> = {
    h1: "# ",
    h2: "## ",
    h3: "### ",
    h4: "#### ",
    h5: "##### ",
    h6: "###### ",
  };

  const lines: string[] = [];

  function walk(el: AnyNode): void {
    if (el.type === "text") {
      const t = (el as Text).data?.trim();
      if (t) lines.push(t);
      return;
    }
    if (el.type !== "tag") return;

    const elem = el as Element;
    const tag = elem.tagName.toLowerCase();

    if (HEADING_MAP[tag]) {
      const text = $(elem).text().trim();
      if (text) lines.push(`${HEADING_MAP[tag]}${text}`);
      return;
    }

    if (["p", "li", "td", "th", "dt", "dd"].includes(tag)) {
      const text = $(elem).text().trim();
      if (text) lines.push(text);
      return;
    }

    if (tag === "br") {
      lines.push("");
      return;
    }

    for (const child of elem.children ?? []) {
      walk(child);
    }
  }

  const body = $("body");
  const root = (body.length > 0 ? body[0] : $.root()[0]) as unknown as Element;
  for (const child of root.children ?? []) {
    walk(child);
  }

  const content = lines.join("\n").trim();
  if (!content) {
    throw new IngestionError("empty_content", "No extractable text found in HTML");
  }

  return { content, filename, frontmatter: {} };
}
