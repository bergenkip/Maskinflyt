import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { FormAlert } from "@/components/form";
import { getCurrentMembership } from "@/lib/membership";
import { isRole } from "@/lib/roles";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient, getUserId } from "@/lib/supabase/server";
import { signUp } from "../../actions";
import { AuthForm } from "../../auth-form";
import { isInviteToken } from "../../validation";
import { AcceptForm } from "./accept-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Join");
  return { title: `${t("title")} · Maskinflyt` };
}

type Preview = { organization_name: string; role: string; expires_at: string };

// A personal invitation link. The token is the key: whoever opens the link can
// create an account and join, once, until it expires or is cancelled.
export default async function InvitationPage({ params }: PageProps<"/join/[token]">) {
  const { token } = await params;
  const t = await getTranslations("Join");
  if (!getSupabaseEnv()) {
    const tAuth = await getTranslations("Auth");
    return <FormAlert kind="error">{tAuth("notConfigured")}</FormAlert>;
  }

  const supabase = await createClient();
  const { data } = isInviteToken(token)
    ? await supabase.rpc("invitation_preview", { token })
    : { data: null };
  const preview = ((data ?? []) as Preview[])[0];

  if (!preview) {
    return (
      <div className="grid gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{t("invalidTitle")}</h1>
        <p className="text-muted">{t("invalidBody")}</p>
      </div>
    );
  }

  const tRoles = await getTranslations("Roles");
  const format = await getFormatter();
  const intro = (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{t("title")}</h1>
      <div className="grid gap-1 rounded-xl border border-border bg-surface p-4">
        {/* Company names are data and are shown exactly as entered. */}
        <p className="text-lg font-semibold [overflow-wrap:anywhere]">{preview.organization_name}</p>
        <p className="text-muted">
          {t("role", { role: isRole(preview.role) ? tRoles(preview.role) : preview.role })}
        </p>
        <p className="text-sm text-muted">
          {t("validUntil", { date: format.dateTime(new Date(preview.expires_at), { dateStyle: "medium" }) })}
        </p>
      </div>
    </div>
  );

  if (!(await getUserId())) {
    return (
      <div className="grid gap-6">
        <AuthForm
          mode="signUp"
          action={signUp}
          invite={token}
          intro={
            <div className="grid gap-4">
              {intro}
              <p className="text-muted">{t("signupLead")}</p>
            </div>
          }
          switchHref={`/login?next=/join/${token}`}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {intro}
      {(await getCurrentMembership()) ? (
        <div className="grid gap-3">
          <FormAlert kind="error">{t("alreadyMember")}</FormAlert>
          <Link
            href="/app"
            className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {t("toApp")}
          </Link>
        </div>
      ) : (
        <AcceptForm token={token} />
      )}
    </div>
  );
}
