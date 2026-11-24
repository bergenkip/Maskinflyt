"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Field, FieldError, FormAlert, SubmitButton } from "@/components/form";
import { CheckCircleIcon } from "@/components/icons";
import type { Service } from "@/lib/company-page";
import {
  MAX_REQUEST_DESCRIPTION_LENGTH,
  MAX_REQUEST_NAME_LENGTH,
  MAX_REQUEST_PLACE_LENGTH,
} from "@/lib/job-requests";
import { submitJobRequest, type RequestState } from "./request-actions";

const control =
  "min-h-11 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-invalid:border-danger";

// The customer's request to the company. No account: a phone or an e-mail is
// enough for the company to answer. Nothing is booked until the company says so.
export function RequestForm({
  slug,
  company,
  services,
  minDate,
  maxDate,
}: {
  slug: string;
  company: string;
  services: { value: Service; label: string }[];
  minDate: string;
  maxDate: string;
}) {
  const t = useTranslations("JobRequestForm");
  const [state, action] = useActionState<RequestState, FormData>(submitJobRequest, {});
  const values = state.values;
  const error = (field: keyof NonNullable<RequestState["fieldErrors"]>) => {
    const code = state.fieldErrors?.[field];
    return code ? t(`errors.${code}`) : undefined;
  };

  if (state.sent) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-xl border border-success/40 bg-success-soft p-4 text-success">
        <CheckCircleIcon className="mt-0.5 size-6 shrink-0" />
        <div className="grid gap-1">
          <p className="font-semibold">{t("sentTitle")}</p>
          <p className="text-foreground [overflow-wrap:anywhere]">{t("sentText", { company })}</p>
        </div>
      </div>
    );
  }

  const serviceError = error("service");
  const dateError = error("wantedDate");
  const descriptionError = error("description");
  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="slug" value={slug} />
      {state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}

      <Field
        name="name"
        id="request-name"
        label={t("name")}
        autoComplete="name"
        maxLength={MAX_REQUEST_NAME_LENGTH}
        defaultValue={values?.name}
        error={error("name")}
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="phone"
          id="request-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          label={t("phone")}
          defaultValue={values?.phone}
          error={error("phone")}
        />
        <Field
          name="email"
          id="request-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          label={t("email")}
          defaultValue={values?.email}
          error={error("email")}
        />
      </div>
      <p className="-mt-2 text-sm text-muted">{t("contactHint")}</p>

      <Field
        name="place"
        id="request-place"
        label={t("place")}
        hint={t("placeHint")}
        autoComplete="street-address"
        maxLength={MAX_REQUEST_PLACE_LENGTH}
        defaultValue={values?.place}
        error={error("place")}
        required
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {services.length > 0 && (
          <div className="grid min-w-0 content-start gap-1.5">
            <label htmlFor="request-service" className="font-medium">
              {t("service")}
            </label>
            {/* A new key renders the select again with what the action sent back. */}
            <select
              key={values?.service ?? ""}
              id="request-service"
              name="service"
              defaultValue={values?.service ?? ""}
              aria-invalid={serviceError ? true : undefined}
              aria-describedby={serviceError ? "request-service-error" : undefined}
              className={control}
            >
              <option value="">{t("serviceAny")}</option>
              {services.map((service) => (
                <option key={service.value} value={service.value}>
                  {service.label}
                </option>
              ))}
            </select>
            {serviceError && <FieldError id="request-service-error">{serviceError}</FieldError>}
          </div>
        )}
        <div className="grid min-w-0 content-start gap-1.5">
          <label htmlFor="request-date" className="font-medium">
            {t("date")}
          </label>
          <input
            id="request-date"
            name="wantedDate"
            type="date"
            min={minDate}
            max={maxDate}
            defaultValue={values?.wantedDate}
            aria-invalid={dateError ? true : undefined}
            aria-describedby={`request-date-hint${dateError ? " request-date-error" : ""}`}
            className={`${control} [&::-webkit-date-and-time-value]:text-left`}
          />
          <p id="request-date-hint" className="text-sm text-muted">
            {t("dateHint")}
          </p>
          {dateError && <FieldError id="request-date-error">{dateError}</FieldError>}
        </div>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="request-description" className="font-medium">
          {t("description")}
        </label>
        <textarea
          id="request-description"
          name="description"
          rows={5}
          maxLength={MAX_REQUEST_DESCRIPTION_LENGTH}
          defaultValue={values?.description}
          required
          aria-invalid={descriptionError ? true : undefined}
          aria-describedby={`request-description-hint${descriptionError ? " request-description-error" : ""}`}
          className={`${control} py-2.5`}
        />
        <p id="request-description-hint" className="text-sm text-muted">
          {t("descriptionHint")}
        </p>
        {descriptionError && <FieldError id="request-description-error">{descriptionError}</FieldError>}
      </div>

      {/* For form robots only: people neither see nor reach this field. */}
      <div aria-hidden="true" className="invisible absolute size-0 overflow-hidden">
        <label htmlFor="request-company-website">{t("trap")}</label>
        <input id="request-company-website" name="company_website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <p className="text-sm text-muted [overflow-wrap:anywhere]">
        {t.rich("privacy", {
          company,
          link: (chunks) => (
            <Link href="/personvern" className="font-medium text-accent underline underline-offset-4">
              {chunks}
            </Link>
          ),
        })}
      </p>
      <div>
        <SubmitButton pendingLabel={t("sending")}>{t("send")}</SubmitButton>
      </div>
    </form>
  );
}
