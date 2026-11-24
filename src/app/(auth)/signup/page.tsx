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

// /signup?konto=kunde: a customer account for ordering from companies (stage 16a).
export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  if (!getSupabaseEnv()) {
    const t = await getTranslations("Auth");
    return <FormAlert kind="error">{t("notConfigured")}</FormAlert>;
  }
  const customer = (await searchParams).konto === "kunde";
  return <AuthForm mode="signUp" action={signUp} customer={customer} switchHref={customer ? "/login?next=/kunde" : undefined} />;
}
