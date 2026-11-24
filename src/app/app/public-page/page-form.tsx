"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { CheckRow } from "@/components/check-row";
import { Field, FieldError, FormAlert, SubmitButton } from "@/components/form";
import { CheckIcon } from "@/components/icons";
import { MAX_DESCRIPTION_LENGTH, services, type CompanyPageValues } from "@/lib/company-page";
import { saveCompanyPage, type CompanyPageState } from "./actions";

const focusWithin = "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-accent";

export function CompanyPageForm({ initial, host }: { initial: CompanyPageValues; host: string }) {
  const t = useTranslations("CompanyPage");
  const tServices = useTranslations("Services");
  const tAuth = useTranslations("Auth");
  const [state, action] = useActionState<CompanyPageState, FormData>(saveCompanyPage, {});
  const values = state.values ?? initial;
  const error = (field: keyof CompanyPageValues) => {
    const code = state.fieldErrors?.[field];
    return code && t(`errors.${code}`);
  };
  const descriptionError = error("description");
  const servicesError = error("services");

  return (
    // The key renders the fields afresh after each answer (React resets forms after an action).
    <form key={state.savedAt ?? JSON.stringify(state.fieldErrors ?? {})} action={action} noValidate className="grid gap-5">
      <Field
        name="slug"
        label={t("slug")}
        hint={t("slugHint", { address: `${host}/firma/…` })}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={60}
        required
        defaultValue={values.slug}
        error={error("slug")}
      />

      <div className="grid gap-1.5">
        <label htmlFor="description" className="font-medium">
          {t("description")}
        </label>
        <textarea
          id="description"
          name="description"
          rows={5}
          maxLength={MAX_DESCRIPTION_LENGTH}
          defaultValue={values.description}
          aria-invalid={descriptionError ? true : undefined}
          aria-describedby={`description-hint${descriptionError ? " description-error" : ""}`}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-invalid:border-danger"
        />
        <p id="description-hint" className="text-sm text-muted">
          {t("descriptionHint")}
        </p>
        {descriptionError && <FieldError id="description-error">{descriptionError}</FieldError>}
      </div>

      <fieldset className="grid gap-2" aria-describedby={servicesError ? "services-error" : undefined}>
        <legend className="mb-1.5 font-medium">{t("services")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {services.map((service) => (
            <label
              key={service}
              className={`relative flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 has-[:checked]:border-accent has-[:checked]:bg-accent-soft ${focusWithin}`}
            >
              <input
                type="checkbox"
                name="services"
                value={service}
                defaultChecked={values.services.includes(service)}
                className="peer absolute -inset-px m-0 cursor-pointer appearance-none rounded-lg opacity-0"
              />
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-md border-2 border-muted bg-surface text-transparent peer-checked:border-accent peer-checked:bg-accent peer-checked:text-on-accent"
              >
                <CheckIcon className="size-4" />
              </span>
              <span className="min-w-0 font-medium">{tServices(service)}</span>
            </label>
          ))}
        </div>
        {servicesError && <FieldError id="services-error">{servicesError}</FieldError>}
      </fieldset>

      <Field
        name="city"
        label={t("city")}
        autoComplete="address-level2"
        maxLength={100}
        defaultValue={values.city}
        error={error("city")}
      />
      <Field name="area" label={t("area")} hint={t("areaHint")} maxLength={200} defaultValue={values.area} error={error("area")} />
      <Field name="phone" type="tel" label={t("phone")} autoComplete="tel" maxLength={20} defaultValue={values.phone} error={error("phone")} />
      <Field
        name="email"
        type="email"
        label={t("email")}
        autoComplete="email"
        maxLength={254}
        defaultValue={values.email}
        error={error("email")}
      />
      <Field
        name="website"
        type="url"
        inputMode="url"
        label={t("website")}
        autoComplete="url"
        autoCapitalize="none"
        maxLength={200}
        defaultValue={values.website}
        error={error("website")}
      />

      <CheckRow name="published" label={t("published")} hint={t("publishedHint")} defaultChecked={values.published} />

      {state.savedAt && <FormAlert kind="success">{values.published ? t("savedPublished") : t("savedHidden")}</FormAlert>}
      {state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}
      <div>
        <SubmitButton pendingLabel={tAuth("pending")}>{t("save")}</SubmitButton>
      </div>
    </form>
  );
}
