import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { FormAlert } from "@/components/form";
import { signUp } from "../actions";
import { AuthForm } from "../auth-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Nav");
  return { title: `${t("signup")} · Maskinflyt` };
}

export default async function SignupPage() {
  if (!getSupabaseEnv()) {
    const t = await getTranslations("Auth");
    return <FormAlert kind="error">{t("notConfigured")}</FormAlert>;
  }
  return <AuthForm mode="signUp" action={signUp} />;
}
