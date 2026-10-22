import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { FormAlert } from "@/components/form";
import { signIn } from "../actions";
import { AuthForm } from "../auth-form";
import { safeNextPath } from "../validation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Nav");
  return { title: `${t("login")} · Maskinflyt` };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, next } = await searchParams;
  if (!getSupabaseEnv()) {
    const t = await getTranslations("Auth");
    return <FormAlert kind="error">{t("notConfigured")}</FormAlert>;
  }
  const nextPath = typeof next === "string" ? safeNextPath(next, "") : "";
  return (
    <AuthForm
      mode="signIn"
      action={signIn}
      initialError={error === "link" ? "linkInvalid" : undefined}
      next={nextPath || undefined}
      // Coming from an invitation link: signing up goes back to that link.
      switchHref={nextPath.startsWith("/join/") ? nextPath : undefined}
    />
  );
}
