import { NextResponse } from 'next/server';
import { z } from 'zod';

import { RagSource } from '@secondseat/db';
import { ensureDb } from '@/lib/db';
import { getSession } from '@/lib/session';
import { htmlToMarkdown } from '@/lib/turndown';

// ─── Schema ───────────────────────────────────────────────────────────────────

const createDraftSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(1, 'Content is required'),
  game: z.string().min(1, 'Game is required'),
  area: z.string().min(1, 'Area is required'),
  spoilerLevel: z.enum(['none', 'low', 'medium', 'high']).default('low'),
});

// ─── POST /api/ingest/drafts ──────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!['author', 'admin'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Insufficient role' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 422 });
  }

  const parsed = createDraftSchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => ({
      field: String(i.path[0] ?? 'body'),
      message: i.message,
    }));
    return NextResponse.json({ errors }, { status: 422 });
  }

  const { title, content, game, area, spoilerLevel } = parsed.data;
  const markdown = content.startsWith('<') ? htmlToMarkdown(content) : content;

  await ensureDb();

  const source = await RagSource.create({
    title,
    content: markdown,
    sourceType: 'text',
    createdBy: session.user.userId,
    metadata: { game, area, spoilerLevel },
    status: 'draft',
  });

  return NextResponse.json({ sourceId: source._id.toString() }, { status: 201 });
}
