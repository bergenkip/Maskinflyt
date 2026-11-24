import type { Metadata } from "next";
import { IndustryPage, industryMetadata } from "../industry-page";

export function generateMetadata(): Promise<Metadata> {
  return industryMetadata("timeforing");
}

export default function Page() {
  return <IndustryPage industry="timeforing" />;
}
