import type { Metadata } from "next";
import { IndustryPage, industryMetadata } from "../industry-page";

export function generateMetadata(): Promise<Metadata> {
  return industryMetadata("maskinentreprenor");
}

export default function Page() {
  return <IndustryPage industry="maskinentreprenor" />;
}
