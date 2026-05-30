import { parseFrontmatter, type ParsedFrontmatter } from "./frontmatter.parser.js";

export interface LoadedDocument {
  content: string;
  filename: string;
  frontmatter: ParsedFrontmatter;
}

export function loadMarkdown(content: string, filename: string): LoadedDocument {
  if (!content.trim()) {
    throw new IngestionError("empty_content", "Markdown file is empty");
  }

  const { frontmatter, body } = parseFrontmatter(content, filename);

  // Require at least one heading for semantic chunking
  if (!/^#{1,6}\s+\S/m.test(body)) {
    throw new IngestionError(
      "no_heading_hierarchy",
      "Markdown must contain at least one heading (# , ## , etc.) for semantic chunking"
    );
  }

  return { content: body, filename, frontmatter };
}

export class IngestionError extends Error {
  constructor(
    public readonly code: string,
    message?: string
  ) {
    super(message ?? code);
    this.name = "IngestionError";
  }
}
