import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getCurrentMembership } from "@/lib/membership";
import { countryOptions } from "@/lib/countries";
import { OnboardingForm } from "./onboarding-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Onboarding");
  return { title: `${t("title")} · Maskinflyt` };
}

export default async function OnboardingPage() {
  if (await getCurrentMembership()) redirect("/app");

  const countries = countryOptions(await getLocale());

  return (
    <div className="mx-auto grid w-full max-w-md">
      <OnboardingForm countries={countries} />
    </div>
  );
}
