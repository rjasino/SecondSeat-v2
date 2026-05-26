import { describe, it, expect } from 'vitest';
import { fileIngestSchema, textIngestSchema, formatZodErrors } from './ingest';

describe('fileIngestSchema', () => {
  const valid = {
    title: 'Water Temple Guide',
    sourceType: 'file' as const,
    game: 'Zelda OoT',
    area: 'Water Temple',
    spoilerLevel: 'low' as const,
  };

  it('accepts a valid file payload', () => {
    const result = fileIngestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects when title is empty', () => {
    const result = fileIngestSchema.safeParse({ ...valid, title: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain('title');
    }
  });

  it('rejects when game is missing', () => {
    const { game: _g, ...rest } = valid;
    const result = fileIngestSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects an invalid spoilerLevel', () => {
    const result = fileIngestSchema.safeParse({ ...valid, spoilerLevel: 'extreme' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain('spoilerLevel');
    }
  });

  it('accepts all valid spoiler levels', () => {
    for (const level of ['none', 'low', 'medium', 'high'] as const) {
      const result = fileIngestSchema.safeParse({ ...valid, spoilerLevel: level });
      expect(result.success).toBe(true);
    }
  });
});

describe('textIngestSchema', () => {
  const valid = {
    title: 'Water Temple Guide',
    sourceType: 'text' as const,
    content: '<p>Some guide content</p>',
    game: 'Zelda OoT',
    area: 'Water Temple',
    spoilerLevel: 'medium' as const,
  };

  it('accepts a valid text payload', () => {
    const result = textIngestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects when content is empty', () => {
    const result = textIngestSchema.safeParse({ ...valid, content: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain('content');
    }
  });

  it('rejects when area is missing', () => {
    const { area: _a, ...rest } = valid;
    const result = textIngestSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe('formatZodErrors', () => {
  it('maps zod issues to { field, message } pairs', () => {
    const result = fileIngestSchema.safeParse({ sourceType: 'file', title: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const formatted = formatZodErrors(result.error);
      expect(formatted).toBeInstanceOf(Array);
      expect(formatted[0]).toHaveProperty('field');
      expect(formatted[0]).toHaveProperty('message');
    }
  });
});
