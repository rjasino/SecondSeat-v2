import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { RagSource, RagIngestionJob } from '@secondseat/db';
import { ensureDb } from '@/lib/db';
import { getSession } from '@/lib/session';
import { getIngestionQueue } from '@/lib/queue';
import { htmlToMarkdown } from '@/lib/turndown';
import { loadConfig } from '@/lib/config';
import {
  fileIngestSchema,
  textIngestSchema,
  formatZodErrors,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
} from '@/schemas/ingest';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAllowedExtension(filename: string): boolean {
  return ALLOWED_EXTENSIONS.some((ext) => filename.toLowerCase().endsWith(ext));
}

function isAllowedMimeType(mimeType: string): boolean {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

function getExtension(filename: string): string {
  return filename.toLowerCase().slice(filename.lastIndexOf('.'));
}

// ─── POST /api/ingest ─────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Auth check
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!['author', 'admin'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Insufficient role' }, { status: 403 });
  }

  const config = loadConfig();
  const contentType = request.headers.get('content-type') ?? '';

  // ── 2a. File upload (multipart/form-data) ────────────────────────────────
  if (contentType.includes('multipart/form-data')) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ errors: [{ field: 'body', message: 'Invalid form data' }] }, { status: 422 });
    }

    // Validate metadata fields
    const parsed = fileIngestSchema.safeParse({
      title: formData.get('title'),
      sourceType: formData.get('sourceType'),
      game: formData.get('game'),
      area: formData.get('area'),
      spoilerLevel: formData.get('spoilerLevel'),
    });
    if (!parsed.success) {
      return NextResponse.json({ errors: formatZodErrors(parsed.error) }, { status: 422 });
    }

    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ errors: [{ field: 'file', message: 'File is required' }] }, { status: 422 });
    }

    // Validate extension + MIME type
    if (!isAllowedExtension(file.name)) {
      return NextResponse.json(
        { errors: [{ field: 'file', message: 'Only .md and .html files are accepted' }] },
        { status: 422 },
      );
    }
    if (!isAllowedMimeType(file.type) && file.type !== '') {
      return NextResponse.json(
        { errors: [{ field: 'file', message: 'Unsupported file MIME type' }] },
        { status: 422 },
      );
    }

    // Validate size
    if (file.size > config.INGEST_MAX_FILE_BYTES) {
      return NextResponse.json(
        { errors: [{ field: 'file', message: `File exceeds maximum size of ${config.INGEST_MAX_FILE_BYTES} bytes` }] },
        { status: 422 },
      );
    }

    const rawText = await file.text();
    const ext = getExtension(file.name);
    const content = ext === '.html' ? htmlToMarkdown(rawText) : rawText;

    if (!content.trim()) {
      return NextResponse.json(
        { errors: [{ field: 'file', message: 'No content extracted from file' }] },
        { status: 422 },
      );
    }

    return createSourceAndJob({
      title: parsed.data.title,
      sourceType: 'file',
      sourceUri: file.name,
      content,
      createdBy: session.user.id,
      metadata: { game: parsed.data.game, area: parsed.data.area, spoilerLevel: parsed.data.spoilerLevel },
      config,
    });
  }

  // ── 2b. Text mode (application/json) ─────────────────────────────────────
  if (contentType.includes('application/json')) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ errors: [{ field: 'body', message: 'Invalid JSON' }] }, { status: 422 });
    }

    const parsed = textIngestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ errors: formatZodErrors(parsed.error) }, { status: 422 });
    }

    // Convert TipTap HTML to Markdown server-side
    const content = htmlToMarkdown(parsed.data.content);
    if (!content.trim()) {
      return NextResponse.json(
        { errors: [{ field: 'content', message: 'Content is empty after conversion' }] },
        { status: 422 },
      );
    }

    return createSourceAndJob({
      title: parsed.data.title,
      sourceType: 'text',
      sourceUri: undefined,
      content,
      createdBy: session.user.id,
      metadata: { game: parsed.data.game, area: parsed.data.area, spoilerLevel: parsed.data.spoilerLevel },
      config,
    });
  }

  return NextResponse.json(
    { errors: [{ field: 'body', message: 'Content-Type must be multipart/form-data or application/json' }] },
    { status: 422 },
  );
}

// ─── Core ingestion logic ─────────────────────────────────────────────────────

interface CreateSourceAndJobParams {
  title: string;
  sourceType: 'file' | 'text';
  sourceUri?: string;
  content: string;
  createdBy: string;
  metadata: { game: string; area: string; spoilerLevel: string };
  config: ReturnType<typeof loadConfig>;
}

async function createSourceAndJob(params: CreateSourceAndJobParams): Promise<NextResponse> {
  const { title, sourceType, sourceUri, content, createdBy, metadata, config } = params;

  await ensureDb();

  // 3. Write RagSource
  const source = await RagSource.create({
    title,
    sourceType,
    sourceUri,
    content,
    createdBy: new mongoose.Types.ObjectId(createdBy),
    metadata,
    status: 'queued',
  });

  // 4. Pre-generate the MongoDB job ID so the worker can reference it
  const jobMongoId = new mongoose.Types.ObjectId();

  // 5. Enqueue BullMQ job
  let bullJob;
  try {
    const queue = getIngestionQueue(config.REDIS_URL);
    bullJob = await queue.add(
      'ingest',
      { sourceId: source._id.toString(), jobMongoId: jobMongoId.toString() },
      {
        attempts: config.INGEST_MAX_FILE_BYTES > 0 ? 3 : 3, // uses env-driven default
        backoff: { type: 'exponential', delay: 5_000 },
      },
    );
  } catch {
    // Rollback: mark source as failed so it's not orphaned
    await RagSource.findByIdAndUpdate(source._id, { status: 'failed' });
    return NextResponse.json({ error: 'Failed to enqueue ingestion job' }, { status: 500 });
  }

  // 6. Write RagIngestionJob with the pre-generated _id
  await RagIngestionJob.create({
    _id: jobMongoId,
    sourceId: source._id,
    queueJobUuid: bullJob.id ?? '',
    status: 'queued',
    processedChunks: 0,
  });

  return NextResponse.json({ jobId: jobMongoId.toString() }, { status: 201 });
}
