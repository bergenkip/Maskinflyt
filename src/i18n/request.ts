import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { cache } from "react";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient, getClaims } from "@/lib/supabase/server";
import { LOCALE_COOKIE, resolveLocale } from "./locale";

// next-intl asks for the config several times while one page renders, so the
// two lookups run once per request.
const getSavedLocales = cache(async (): Promise<{ profile: string | null; organization: string | null }> => {
  const none = { profile: null, organization: null };
  if (!getSupabaseEnv()) return none;

  const userId = (await getClaims())?.sub;
  if (!userId) return none;
  const supabase = await createClient();

  // RLS limits both queries to the signed-in user's own rows.
  const [profile, membership] = await Promise.all([
    supabase.from("profiles").select("locale").eq("id", userId).maybeSingle(),
    supabase
      .from("memberships")
      .select("organizations(default_locale)")
      .eq("user_id", userId)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
  ]);

  const org = membership.data?.organizations as { default_locale?: string } | null | undefined;
  return { profile: profile.data?.locale ?? null, organization: org?.default_locale ?? null };
});

export default getRequestConfig(async () => {
  const [cookieStore, headerStore, saved] = await Promise.all([
    cookies(),
    headers(),
    getSavedLocales(),
  ]);

  const locale = resolveLocale({
    profile: saved.profile,
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    organization: saved.organization,
    acceptLanguage: headerStore.get("accept-language"),
  });

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: "Europe/Oslo",
  };
});
