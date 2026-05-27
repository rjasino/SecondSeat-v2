import * as cheerio from "cheerio";
import type { Element, AnyNode, Text } from "domhandler";

export interface ExtractResult {
  text: string;
  title: string;
}

export function extractMarkdown(
  source: string,
  filename: string
): ExtractResult {
  const title = filename
    .replace(/\.(md|markdown)$/i, "")
    .replace(/[-_]/g, " ");
  return { text: source.trim(), title };
}

export function extractHtml(html: string, filename: string): ExtractResult {
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

  const pageTitle =
    $("title").text().trim() ||
    $("h1").first().text().trim() ||
    filename.replace(/\.(html|htm)$/i, "").replace(/[-_]/g, " ");

  const lines: string[] = [];

  const HEADING_MAP: Record<string, string> = {
    h1: "# ",
    h2: "## ",
    h3: "### ",
    h4: "#### ",
    h5: "##### ",
    h6: "###### ",
  };

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
  const root = body.length > 0 ? body[0]! : $.root()[0]!;
  for (const child of (root as Element).children ?? []) {
    walk(child);
  }

  return { text: lines.join("\n").trim(), title: pageTitle };
}

export function extractContent(
  source: string,
  filename: string,
  mimeType: string
): ExtractResult {
  const isHtml =
    mimeType === "text/html" || /\.(html|htm)$/i.test(filename);
  return isHtml
    ? extractHtml(source, filename)
    : extractMarkdown(source, filename);
}
