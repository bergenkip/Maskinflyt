import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getCurrentMembership } from "@/lib/membership";
import { getCustomerAccount } from "@/lib/customer-account-server";
import { CUSTOMER_PATH } from "@/lib/customer-account";
import { countryOptions } from "@/lib/countries";
import { OnboardingForm } from "./onboarding-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Onboarding");
  return { title: `${t("title")} · MaskinGo` };
}

export default async function OnboardingPage() {
  if (await getCurrentMembership()) redirect("/app");
  // A customer account (stage 16a) has no company: its home is the customer page.
  if (await getCustomerAccount()) redirect(CUSTOMER_PATH);

  const countries = countryOptions(await getLocale());

  return (
    <div className="mx-auto grid w-full max-w-md">
      <OnboardingForm countries={countries} />
    </div>
  );
}
