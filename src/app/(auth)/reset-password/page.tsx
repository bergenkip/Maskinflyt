import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FormAlert } from "@/components/form";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordPanel } from "../password-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: `${t("resetTitle")} · Maskinflyt` };
}

// The e-mailed link (via /auth/callback) lands here with the link's tokens in
// the URL fragment, which only the browser sees; the panel takes it from there.
export default async function ResetPasswordPage() {
  const t = await getTranslations("Auth");
  if (!getSupabaseEnv()) return <FormAlert kind="error">{t("notConfigured")}</FormAlert>;

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return <ResetPasswordPanel email={data.user?.email ?? null} />;
}
