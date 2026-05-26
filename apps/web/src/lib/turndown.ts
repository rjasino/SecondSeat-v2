import TurndownService from 'turndown';

const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

/**
 * Convert an HTML string to clean Markdown.
 * Used server-side for both file uploads (.html) and TipTap editor output.
 */
export function htmlToMarkdown(html: string): string {
  return td.turndown(html);
}
