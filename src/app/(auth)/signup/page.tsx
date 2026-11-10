import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { publicPageMetadata } from "@/lib/site";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { FormAlert } from "@/components/form";
import { signUp } from "../actions";
import { AuthForm } from "../auth-form";

export async function generateMetadata(): Promise<Metadata> {
  const [t, tMeta, locale] = await Promise.all([getTranslations("Nav"), getTranslations("Metadata"), getLocale()]);
  return publicPageMetadata({
    path: "/signup",
    title: `${t("signup")} · MaskinGo`,
    description: tMeta("description"),
    locale,
    imageAlt: tMeta("ogAlt"),
  });
}

export default async function SignupPage() {
  if (!getSupabaseEnv()) {
    const t = await getTranslations("Auth");
    return <FormAlert kind="error">{t("notConfigured")}</FormAlert>;
  }
  return <AuthForm mode="signUp" action={signUp} />;
}
