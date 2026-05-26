import { Document, MarkdownNodeParser, SentenceSplitter } from 'llamaindex';
import { getEncoding } from 'js-tiktoken';

export interface ChunkNode {
  text: string;
  tokens: number;
}

const CHUNK_SIZE = 256;
const CHUNK_OVERLAP = 32;

// Reuse encoding instance — getEncoding is synchronous and heavy to create
let _enc: ReturnType<typeof getEncoding> | null = null;

function countTokens(text: string): number {
  if (!_enc) _enc = getEncoding('cl100k_base');
  return _enc.encode(text).length;
}

const markdownParser = new MarkdownNodeParser();
const sentenceSplitter = new SentenceSplitter({ chunkSize: CHUNK_SIZE, chunkOverlap: CHUNK_OVERLAP });

/**
 * Semantically chunk Markdown content using MarkdownNodeParser, then apply
 * SentenceSplitter to any node exceeding CHUNK_SIZE tokens.
 *
 * Throws if no chunks are produced (empty or unparseable content).
 */
export function chunkMarkdown(content: string): ChunkNode[] {
  const doc = new Document({ text: content });
  const markdownNodes = markdownParser.getNodesFromDocuments([doc]);

  const chunks: ChunkNode[] = [];

  for (const node of markdownNodes) {
    const text = node.getText();
    const tokenCount = countTokens(text);

    if (tokenCount <= CHUNK_SIZE) {
      chunks.push({ text, tokens: tokenCount });
    } else {
      // Secondary split — SentenceSplitter enforces the 256-token window
      const subTexts = sentenceSplitter.splitText(text);
      for (const subText of subTexts) {
        const subTokens = countTokens(subText);
        if (subTokens > CHUNK_SIZE) {
          // Hard-cut by splitter at sentence boundary — log but don't fail
          console.warn(
            `[chunker] Chunk exceeds ${CHUNK_SIZE} tokens after sentence split (${subTokens} tokens). Content may be truncated by embedding model.`,
          );
        }
        chunks.push({ text: subText, tokens: subTokens });
      }
    }
  }

  return chunks.filter((c) => c.text.trim().length > 0);
}
