import type { Metadata } from "next";
import IngestPageClient from "./IngestPageClient";

export const metadata: Metadata = {
  title: "Ingestion — SecondSeat Admin",
};

export default function IngestPage() {
  return <IngestPageClient />;
}
