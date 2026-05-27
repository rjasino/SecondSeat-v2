// Markdown cleaning pass — strips noise before semantic chunking.
// Runs on reviewed RagSource.content (post-admin-approval) before chunkText().

export function cleanMarkdown(raw: string): string {
  let text = raw;

  // Strip YAML frontmatter
  text = text.replace(/^---[\s\S]*?---\n?/, "");

  // Remove image syntax, preserve alt text (alt may describe game item/location)
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt: string) => alt.trim());

  // Inline links → text only (URLs add noise, no semantic value for embeddings)
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  // Reference-style links [text][id] → text; strip bare link definitions
  text = text.replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1");
  text = text.replace(/^\[[^\]]+\]:\s*.+$/gm, "");

  // HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, "");

  // Inline HTML tags (e.g. <br>, <span class="...">, etc.)
  text = text.replace(/<[^>]+>/g, " ");

  // Trailing whitespace per line
  text = text.replace(/[^\S\n]+$/gm, "");

  // Collapse 3+ consecutive blank lines → 2 (preserve paragraph breaks)
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}
