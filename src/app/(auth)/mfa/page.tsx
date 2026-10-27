import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { signOut } from "@/app/app/actions";
import { getCurrentMembership } from "@/lib/membership";
import { getUserEmail, hasSecondStep } from "@/lib/mfa";
import { needsMfa } from "@/lib/roles";
import { getUserId } from "@/lib/supabase/server";
import { MfaEmailLink } from "./mfa-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Mfa");
  return { title: `${t("verifyTitle")} · Maskinflyt` };
}

// Second step of signing in for owners and admins: a sign-in link e-mailed to them.
export default async function MfaPage() {
  if (!(await getUserId())) redirect("/login");
  const membership = await getCurrentMembership();
  if (!membership || !needsMfa(membership.role) || (await hasSecondStep())) redirect("/app");

  const t = await getTranslations("Mfa");
  const tNav = await getTranslations("Nav");
  const email = await getUserEmail();
  if (!email) redirect("/login");

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{t("verifyTitle")}</h1>
        <p className="text-muted">{t("verifyLead")}</p>
      </div>
      <MfaEmailLink email={email} />
      <form action={signOut}>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {tNav("signOut")}
        </button>
      </form>
    </div>
  );
}
