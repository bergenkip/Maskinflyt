import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Join");
  return { title: `${t("title")} · Maskinflyt` };
}

// Invitations now use personal links (/join/<token>). This address only
// explains that, for anyone who still has the old shared link.
export default async function JoinPage() {
  const t = await getTranslations("Join");

  return (
    <div className="grid gap-2">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{t("title")}</h1>
      <p className="text-muted">{t("personalLink")}</p>
    </div>
  );
}
