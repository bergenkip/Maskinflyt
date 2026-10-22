import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ApprovePanel } from "./approve-panel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Approve");
  return { title: `${t("title")} · Maskinflyt` };
}

// Where the second-step e-mail link lands, in whatever browser opened it.
export default async function ApprovePage({ params }: PageProps<"/approve/[id]">) {
  const { id } = await params;
  const t = await getTranslations("Approve");

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{t("title")}</h1>
      <ApprovePanel requestId={id} />
    </div>
  );
}
