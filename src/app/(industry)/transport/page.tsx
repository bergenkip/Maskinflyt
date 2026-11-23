import type { Metadata } from "next";
import { IndustryPage, industryMetadata } from "../industry-page";

export function generateMetadata(): Promise<Metadata> {
  return industryMetadata("transport");
}

export default function Page() {
  return <IndustryPage industry="transport" />;
}
