export interface LoadedDocument {
  content: string;
  filename: string;
}

export function loadMarkdown(content: string, filename: string): LoadedDocument {
  if (!content.trim()) {
    throw new IngestionError("empty_content", "Markdown file is empty");
  }

  // Require at least one heading for semantic chunking
  if (!/^#{1,6}\s+\S/m.test(content)) {
    throw new IngestionError(
      "no_heading_hierarchy",
      "Markdown must contain at least one heading (# , ## , etc.) for semantic chunking"
    );
  }

  return { content, filename };
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
