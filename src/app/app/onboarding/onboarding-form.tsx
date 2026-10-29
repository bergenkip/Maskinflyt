"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { isOrgCountry, type OrgCountry } from "@/lib/org-number";
import { createOrganization, type OnboardingState } from "../actions";

export function OnboardingForm({ countries }: { countries: { code: OrgCountry; name: string }[] }) {
  const t = useTranslations("Onboarding");
  const tAuth = useTranslations("Auth");
  const [state, action] = useActionState<OnboardingState, FormData>(createOrganization, {});
  // Tracked, so the org number hint follows the country.
  const [country, setCountry] = useState<OrgCountry>("NO");

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>
      <form action={action} noValidate className="grid gap-5 rounded-xl border border-border bg-surface p-5 sm:p-6">
        {state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}
        <Field
          name="name"
          label={t("name")}
          autoComplete="organization"
          required
          maxLength={200}
          defaultValue={state.values?.name}
          error={state.fieldErrors?.name && t(`errors.${state.fieldErrors.name}`)}
        />
        <div className="grid gap-1.5">
          <label htmlFor="country" className="font-medium">
            {t("country")}
          </label>
          {/* React resets the form after a failed submit, which puts a select back
              to its default choice, so the choice sent back becomes that default
              (a new key renders the select afresh with it). */}
          <select
            key={state.values?.country ?? "NO"}
            id="country"
            name="country"
            defaultValue={state.values?.country ?? "NO"}
            onChange={(event) => isOrgCountry(event.target.value) && setCountry(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >
            {countries.map(({ code, name }) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <Field
          name="orgNumber"
          label={t("orgNumber")}
          // Only Norwegian numbers are digits only; others may contain letters.
          inputMode={country === "NO" ? "numeric" : "text"}
          autoComplete="off"
          maxLength={country === "NO" ? 11 : 30}
          hint={t(country === "NO" ? "orgNumberHint" : "orgNumberHintOther")}
          defaultValue={state.values?.orgNumber}
          error={state.fieldErrors?.orgNumber && t(`errors.${state.fieldErrors.orgNumber}`)}
        />
        <SubmitButton pendingLabel={tAuth("pending")}>{t("submit")}</SubmitButton>
      </form>
    </div>
  );
}
