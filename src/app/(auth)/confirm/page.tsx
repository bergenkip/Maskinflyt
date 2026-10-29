import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FormAlert } from "@/components/form";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { ConfirmPanel } from "./confirm-panel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: `${t("confirmTitle")} · Maskinflyt` };
}

// The sign-up confirmation link lands here with the link's tokens in the URL
// fragment, which only the browser sees; the panel takes it from there.
export default async function ConfirmPage() {
  const t = await getTranslations("Auth");
  if (!getSupabaseEnv()) return <FormAlert kind="error">{t("notConfigured")}</FormAlert>;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return <ConfirmPanel signedIn={Boolean(data?.claims?.sub)} />;
}
