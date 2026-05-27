import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import GuideWriterClient from "./GuideWriterClient";

export default async function NewDraftPage() {
  const session = await getSession();
  if (!session.userId) redirect("/login");
  if (session.role !== "admin" && session.role !== "author") redirect("/dashboard");

  return <GuideWriterClient />;
}
