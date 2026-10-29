import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FormAlert } from "@/components/form";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { ForgotPasswordForm } from "../password-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: `${t("forgotTitle")} · Maskinflyt` };
}

export default async function ForgotPasswordPage() {
  if (!getSupabaseEnv()) {
    const t = await getTranslations("Auth");
    return <FormAlert kind="error">{t("notConfigured")}</FormAlert>;
  }
  return <ForgotPasswordForm />;
}
