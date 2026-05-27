import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { connectDB } from "@/lib/db";
import { RagSourceModel } from "@/models/rag-source.model";
import GuideWriterClient from "../GuideWriterClient";

interface Props {
  params: Promise<{ sourceId: string }>;
}

export default async function EditDraftPage({ params }: Props) {
  const session = await getSession();
  if (!session.userId) redirect("/login");
  if (session.role !== "admin" && session.role !== "author") redirect("/dashboard");

  const { sourceId } = await params;

  await connectDB();
  const source = await RagSourceModel.findById(sourceId).lean();

  if (!source) notFound();
  if (source.status !== "draft") {
    redirect(`/dashboard/ingest/${sourceId}`);
  }

  const meta = source.metadata as Record<string, unknown> | undefined;

  return (
    <GuideWriterClient
      initialSourceId={sourceId}
      initialTitle={source.title}
      initialGame={typeof meta?.game === "string" ? meta.game : ""}
      initialGuideType={typeof meta?.guideType === "string" ? meta.guideType : ""}
      initialAuthor={typeof meta?.author === "string" ? meta.author : ""}
      initialContent={source.content ?? ""}
    />
  );
}
