import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FormAlert } from "@/components/form";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "../password-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: `${t("resetTitle")} · Maskinflyt` };
}

// The e-mailed link (via /auth/callback) signs the person in and lands here.
// Without a session the link was not used, has expired or was opened elsewhere.
export default async function ResetPasswordPage() {
  const t = await getTranslations("Auth");
  if (!getSupabaseEnv()) return <FormAlert kind="error">{t("notConfigured")}</FormAlert>;

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user?.email) {
    return (
      <div className="grid gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{t("resetTitle")}</h1>
        <FormAlert kind="error">{t("resetNoSession")}</FormAlert>
        <p>
          <Link
            href="/forgot-password"
            className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {t("forgotSubmit")}
          </Link>
        </p>
      </div>
    );
  }
  return <ResetPasswordForm email={data.user.email} />;
}
