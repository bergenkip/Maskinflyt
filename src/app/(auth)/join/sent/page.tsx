import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FormAlert } from "@/components/form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: `${t("checkEmailTitle")} · Maskinflyt` };
}

// After signing up from an invitation while e-mail confirmation is on. The
// invitation is already used (the account joined the company), so its own
// page can no longer be shown.
export default async function InvitationSentPage() {
  const [t, tJoin, tNav] = await Promise.all([
    getTranslations("Auth"),
    getTranslations("Join"),
    getTranslations("Nav"),
  ]);

  return (
    <div className="grid gap-3">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{t("checkEmailTitle")}</h1>
      <FormAlert kind="success">{tJoin("sentBody")}</FormAlert>
      <Link
        href="/login"
        className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {tNav("login")}
      </Link>
    </div>
  );
}
