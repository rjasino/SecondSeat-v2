import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { fileTypeFromBuffer } from "file-type";
import { connectDB } from "@/lib/db";
import { RagSourceModel } from "@/models/rag-source.model";
import { UserModel } from "@/models/user.model";
import { getSession } from "@/lib/session";
import { config } from "@/lib/config";
import {
  ALLOWED_EXTENSIONS,
  type AllowedExtension,
  uploadMetaSchema,
} from "@/lib/ingest/schemas";
import { extractContent } from "@/lib/ingest/extract";
export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin" && session.role !== "author") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form_data" }, { status: 400 });
  }

  // Validate metadata fields
  const metaParsed = uploadMetaSchema.safeParse({
    game: formData.get("game"),
    guideType: formData.get("guideType"),
  });
  if (!metaParsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: metaParsed.error.issues },
      { status: 422 },
    );
  }
  const { game, guideType } = metaParsed.data;

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 422 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "empty_file" }, { status: 422 });
  }

  if (file.size > config.INGEST_MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "file_too_large", maxBytes: config.INGEST_MAX_FILE_BYTES },
      { status: 422 },
    );
  }

  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext as AllowedExtension)) {
    return NextResponse.json(
      { error: "unsupported_file_type", allowed: [...ALLOWED_EXTENSIONS] },
      { status: 422 },
    );
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // MIME sniff — file-type returns undefined for plain text (md/html are text)
  const detected = await fileTypeFromBuffer(buffer);
  if (detected && !detected.mime.startsWith("text/")) {
    return NextResponse.json(
      { error: "unsupported_file_type", allowed: [...ALLOWED_EXTENSIONS] },
      { status: 422 },
    );
  }

  await connectDB();

  const user = await UserModel.findById(session.userId).lean();
  const author = user?.name ?? session.userId;

  const ragSource = await RagSourceModel.create({
    title: file.name.replace(/\.[^.]+$/, ""),
    sourceType: "file",
    status: "pending_review",
    createdBy: session.userId,
    metadata: {
      game,
      guideType,
      author,
      originalFilename: file.name,
      sizeBytes: file.size,
    },
  });

  const sourceId = ragSource._id.toString();

  const uploadDir = path.join(config.INGEST_UPLOAD_DIR, sourceId);
  await mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, file.name);
  await writeFile(filePath, buffer);

  const mimeType =
    ext === ".html" || ext === ".htm" ? "text/html" : "text/plain";
  const { text: content, title } = extractContent(
    buffer.toString("utf-8"),
    file.name,
    mimeType,
  );

  await RagSourceModel.findByIdAndUpdate(ragSource._id, {
    sourceUri: filePath,
    content,
    title,
  });

  return NextResponse.json({ sourceId }, { status: 201 });
}
