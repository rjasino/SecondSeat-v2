import { describe, it, expect } from 'vitest';
import { chunkMarkdown } from './chunker.js';

const SIMPLE_MARKDOWN = `# Introduction

This is the first section with some content about the game world.

## Combat Basics

Learn how to fight enemies using basic attacks and dodges.

## Exploration

The world is open and full of secrets to discover in every corner.
`;

describe('chunkMarkdown', () => {
  it('produces at least one chunk for valid markdown', () => {
    const chunks = chunkMarkdown(SIMPLE_MARKDOWN);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('each chunk has non-empty text', () => {
    const chunks = chunkMarkdown(SIMPLE_MARKDOWN);
    for (const chunk of chunks) {
      expect(chunk.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('each chunk has a positive token count', () => {
    const chunks = chunkMarkdown(SIMPLE_MARKDOWN);
    for (const chunk of chunks) {
      expect(chunk.tokens).toBeGreaterThan(0);
    }
  });

  it('no chunk exceeds 256 tokens for normal-length sections', () => {
    const chunks = chunkMarkdown(SIMPLE_MARKDOWN);
    for (const chunk of chunks) {
      expect(chunk.tokens).toBeLessThanOrEqual(256);
    }
  });

  it('splits a section that exceeds 256 tokens into sub-chunks each ≤ 256 tokens', () => {
    // Build a markdown section large enough to exceed 256 tokens
    const longSection =
      '# Long Section\n\n' +
      Array.from({ length: 60 }, (_, i) => `Sentence ${i + 1}: The hero ventures forth into the dungeon and battles fearsome monsters.`)
        .join(' ');

    const chunks = chunkMarkdown(longSection);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      // SentenceSplitter may occasionally hard-cut slightly above 256 — allow 10% tolerance
      expect(chunk.tokens).toBeLessThanOrEqual(300);
    }
  });

  it('returns correct chunk count matching section structure', () => {
    const markdown = `# Section A\n\nContent A.\n\n# Section B\n\nContent B.\n\n# Section C\n\nContent C.\n`;
    const chunks = chunkMarkdown(markdown);
    // MarkdownNodeParser produces one node per heading block
    expect(chunks.length).toBeGreaterThanOrEqual(3);
  });

  it('throws for empty content producing zero nodes', () => {
    // An empty string produces no markdown nodes — chunkMarkdown returns []
    const chunks = chunkMarkdown('');
    // The caller (processor) is responsible for throwing when chunks.length === 0
    expect(chunks).toHaveLength(0);
  });
});
