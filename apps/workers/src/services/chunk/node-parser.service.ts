import { createHash } from "crypto";

// Equivalent to LlamaIndex MarkdownNodeParser with heading-based chunking
// per Epic I-B spec.
// Split strategy for oversized sections:
//   1. Paragraph boundaries (blank lines) — natural for step-by-step game guides
//   2. Sentence boundaries — secondary fallback for dense paragraphs

const MAX_TOKENS = 220; // all-MiniLM-L6-v2 limit is 256; leave headroom for prefix
// Rough approximation: 4 chars ≈ 1 token (sufficient for chunk-boundary decisions)
const CHARS_PER_TOKEN = 4;

export interface Chunk {
  /** Body text only — no heading prefix. Stored in RagDocument.content and
   *  Chroma's `documents`, returned to inference, formatted into the prompt. */
  content: string;
  /** `[<headingPath>]\n<body>` — passed to embedText() for retrieval semantics.
   *  NOT persisted; the prefix is reconstructed at embed-time from headingPath
   *  + content so retrieval recall is preserved without duplicating the heading
   *  into the prompt (SPEC-profile-aware-prompt, Story 3). */
  embeddingInput: string;
  headingPath: string;  // e.g. "Water Temple > First Floor > Block Puzzle"
  chunkIndex: number;
  tokens: number;
  hash: string;
}

interface Section {
  headingPath: string;
  body: string;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function hashContent(text: string): string {
  return createHash("sha256").update(text.normalize("NFC")).digest("hex");
}

// Paragraph split: preserves the structure of step-by-step game guide sections.
// Each blank-line-delimited paragraph becomes a candidate chunk.
function paragraphSplit(body: string, prefix: string, maxTokens: number): string[] {
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buffer = "";

  for (const para of paragraphs) {
    const candidate = buffer ? `${buffer}\n\n${para}` : para;
    const withPrefix = prefix ? `${prefix}\n${candidate}` : candidate;
    if (estimateTokens(withPrefix) > maxTokens && buffer) {
      chunks.push(buffer);
      buffer = para;
    } else {
      buffer = candidate;
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks.filter(Boolean);
}

// Sentence split: secondary fallback for dense paragraphs that exceed MAX_TOKENS.
function sentenceSplit(text: string, maxTokens: number): string[] {
  // Split on sentence-ending punctuation followed by whitespace + capital
  const raw = text.split(/(?<=[.!?])\s+(?=[A-Z"’’"])/);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of raw) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (estimateTokens(candidate) > maxTokens && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

function extractSections(text: string): Section[] {
  const lines = text.split("\n");
  const sections: Section[] = [];
  let headingStack: string[] = [];
  let bodyLines: string[] = [];
  let currentPath = "";
  let hasHeadings = false;

  function flush(): void {
    const body = bodyLines.join("\n").trim();
    if (body) {
      sections.push({ headingPath: currentPath, body });
    }
    bodyLines = [];
  }

  for (const line of lines) {
    const m = /^(#{1,6})\s+(.+)$/.exec(line);
    if (m) {
      flush();
      hasHeadings = true;
      const level = m[1]!.length;
      const heading = m[2]!.trim();
      headingStack = headingStack.slice(0, level - 1);
      headingStack.push(heading);
      currentPath = headingStack.join(" > ");
    } else {
      bodyLines.push(line);
    }
  }
  flush();

  // If no headings existed, the single accumulated section has an empty path —
  // give it a generic label so downstream chunk formatting is consistent.
  if (!hasHeadings && sections.length === 1 && sections[0]!.headingPath === "") {
    sections[0]!.headingPath = "Document";
  }

  return sections;
}

export function chunkText(text: string): Chunk[] {
  const sections = extractSections(text);
  const chunks: Chunk[] = [];

  for (const section of sections) {
    const prefix = `[${section.headingPath}]`;
    const fullContent = `${prefix}\n${section.body}`;

    if (estimateTokens(fullContent) <= MAX_TOKENS) {
      chunks.push({
        content: section.body,
        embeddingInput: fullContent,
        headingPath: section.headingPath,
        chunkIndex: chunks.length,
        tokens: estimateTokens(fullContent),
        hash: hashContent(fullContent),
      });
      continue;
    }

    // Primary split: paragraph boundaries (blank lines).
    // Natural for game guide content where each paragraph is a step or note.
    const paragraphBodies = paragraphSplit(section.body, prefix, MAX_TOKENS);
    for (const body of paragraphBodies) {
      const partContent = `${prefix}\n${body}`;
      if (estimateTokens(partContent) <= MAX_TOKENS) {
        chunks.push({
          content: body,
          embeddingInput: partContent,
          headingPath: section.headingPath,
          chunkIndex: chunks.length,
          tokens: estimateTokens(partContent),
          hash: hashContent(partContent),
        });
      } else {
        // Secondary fallback: sentence-split dense paragraphs that still exceed budget
        const budget = MAX_TOKENS - estimateTokens(`${prefix}\n`);
        const sentences = sentenceSplit(body, budget);
        for (const sentence of sentences) {
          const sentContent = `${prefix}\n${sentence}`;
          chunks.push({
            content: sentence,
            embeddingInput: sentContent,
            headingPath: section.headingPath,
            chunkIndex: chunks.length,
            tokens: estimateTokens(sentContent),
            hash: hashContent(sentContent),
          });
        }
      }
    }
  }

  return chunks;
}
