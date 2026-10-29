"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { customerKinds, isCustomerKind, MAX_NOTE_LENGTH, type CustomerFormValues, type CustomerKind } from "@/lib/customers";
import {
  addCustomer,
  setCustomerActive,
  setCustomerRate,
  updateCustomer,
  type CustomerFormState,
  type CustomerRateState,
  type CustomerStatusState,
} from "./actions";

const secondaryButtonClass =
  "min-h-11 w-full rounded-lg border border-border px-4 font-medium text-foreground hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-70 sm:w-auto";

// Editing: the customer's id and its stored values as text.
type Props = { customer?: { id: string; values: CustomerFormValues } };

export function CustomerForm({ customer }: Props) {
  const t = useTranslations("Customers");
  const tAuth = useTranslations("Auth");
  const [state, action] = useActionState<CustomerFormState, FormData>(customer ? updateCustomer : addCustomer, {});
  const values = state.values ?? customer?.values;
  // Controlled, so the organization number appears and disappears with the kind.
  const [kind, setKind] = useState<CustomerKind>(values && isCustomerKind(values.kind) ? values.kind : "company");
  const error = (key: keyof CustomerFormValues) => {
    const code = state.fieldErrors?.[key];
    return code && t(`errors.${code}`);
  };
  const noteError = error("note");

  return (
    <form action={action} noValidate className="grid gap-6">
      {state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}
      {state.savedAt && <FormAlert kind="success">{t("saved")}</FormAlert>}
      {customer && <input type="hidden" name="id" value={customer.id} />}

      <fieldset className="grid gap-2">
        <legend className="mb-2 font-medium">{t("kind")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {customerKinds.map((value) => (
            <label
              key={value}
              className="relative flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-accent"
            >
              {/* The real radio covers the whole option, so all of it is the tap target. */}
              <input
                type="radio"
                name="kind"
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
                className="peer absolute inset-0 m-0 size-full cursor-pointer appearance-none rounded-lg opacity-0"
              />
              {/* The chosen option shows a filled dot as well as the colour. */}
              <span
                aria-hidden="true"
                className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-muted peer-checked:border-accent peer-checked:[&>span]:block"
              >
                <span className="hidden size-2.5 rounded-full bg-accent" />
              </span>
              <span className="font-medium">{t(`kinds.${value}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          name="name"
          id="customer-name"
          label={kind === "company" ? t("companyName") : t("personName")}
          required
          maxLength={120}
          autoComplete="off"
          defaultValue={values?.name}
          error={error("name")}
        />
        {kind === "company" && (
          <Field
            name="orgNumber"
            id="customer-org-number"
            label={t("orgNumber")}
            hint={t("orgNumberHint")}
            inputMode="numeric"
            maxLength={11}
            autoComplete="off"
            defaultValue={values?.orgNumber}
            error={error("orgNumber")}
          />
        )}
        <Field
          name="contactName"
          id="customer-contact"
          label={t("contactName")}
          maxLength={100}
          autoComplete="off"
          defaultValue={values?.contactName}
          error={error("contactName")}
        />
        <Field
          name="phone"
          id="customer-phone"
          type="tel"
          label={t("phone")}
          maxLength={20}
          autoComplete="off"
          defaultValue={values?.phone}
          error={error("phone")}
        />
        <Field
          name="email"
          id="customer-email"
          type="email"
          label={t("email")}
          maxLength={254}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={values?.email}
          error={error("email")}
        />
        <Field
          name="invoiceEmail"
          id="customer-invoice-email"
          type="email"
          label={t("invoiceEmail")}
          hint={t("invoiceEmailHint")}
          maxLength={254}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={values?.invoiceEmail}
          error={error("invoiceEmail")}
        />
        <div className="sm:col-span-2">
          <Field
            name="street"
            id="customer-street"
            label={t("street")}
            maxLength={200}
            autoComplete="off"
            defaultValue={values?.street}
            error={error("street")}
          />
        </div>
        <Field
          name="postalCode"
          id="customer-postal-code"
          label={t("postalCode")}
          inputMode="numeric"
          maxLength={4}
          autoComplete="off"
          defaultValue={values?.postalCode}
          error={error("postalCode")}
        />
        <Field
          name="city"
          id="customer-city"
          label={t("city")}
          maxLength={100}
          autoComplete="off"
          defaultValue={values?.city}
          error={error("city")}
        />
        <div className="grid content-start gap-1.5 sm:col-span-2">
          <label htmlFor="customer-note" className="font-medium">
            {t("note")}
          </label>
          <textarea
            id="customer-note"
            name="note"
            rows={3}
            maxLength={MAX_NOTE_LENGTH}
            defaultValue={values?.note}
            aria-invalid={noteError ? true : undefined}
            aria-describedby={`customer-note-hint${noteError ? " customer-note-error" : ""}`}
            className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-invalid:border-danger"
          />
          <p id="customer-note-hint" className="text-sm text-muted">
            {t("noteHint")}
          </p>
          {noteError && (
            <p id="customer-note-error" className="text-sm font-medium text-danger">
              {noteError}
            </p>
          )}
        </div>
      </div>

      <div>
        <SubmitButton pendingLabel={tAuth("pending")}>{customer ? t("save") : t("addSubmit")}</SubmitButton>
      </div>
    </form>
  );
}

export function CustomerStatusForm({ id, active }: { id: string; active: boolean }) {
  const t = useTranslations("Customers");
  const tAuth = useTranslations("Auth");
  const [state, action, pending] = useActionState<CustomerStatusState, FormData>(setCustomerActive, {});

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      {state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}
      <div>
        <button type="submit" disabled={pending} className={secondaryButtonClass}>
          {pending ? tAuth("pending") : active ? t("deactivate") : t("activate")}
        </button>
      </div>
    </form>
  );
}

type RateProps = {
  customerId: string;
  vehicleId: string;
  vehicleName: string;
  // The machine's usual rate as a sentence ("Usual: NOK 1,450.00 per hour"), or the "no rate" text.
  hint: string;
  // The customer's own price as editable text ("1300" or "1300,50"); empty when there is none.
  value: string;
  currency: string;
};

// One row of the price list: the customer's own price for one machine.
export function CustomerRateForm({ customerId, vehicleId, vehicleName, hint, value, currency }: RateProps) {
  const t = useTranslations("Customers");
  const tAuth = useTranslations("Auth");
  const [state, action, pending] = useActionState<CustomerRateState, FormData>(setCustomerRate, {});
  const inputId = `rate-${vehicleId}`;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  return (
    <form action={action} className="grid gap-2 py-4 first:pt-0 last:pb-0">
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="vehicleId" value={vehicleId} />
      {/* Vehicle names are data and are shown exactly as entered. */}
      <label htmlFor={inputId} className="font-medium [overflow-wrap:anywhere]">
        {vehicleName}
      </label>
      <p id={hintId} className="text-sm text-muted">
        {hint}
      </p>
      <div className="grid gap-2 sm:flex sm:items-center sm:gap-3">
        <div className="flex items-center gap-2">
          <input
            id={inputId}
            name="rate"
            inputMode="decimal"
            autoComplete="off"
            maxLength={12}
            defaultValue={state.value ?? value}
            placeholder={t("ratePlaceholder")}
            aria-invalid={state.error === "rateInvalid" ? true : undefined}
            aria-describedby={`${hintId}${state.error ? ` ${errorId}` : ""}`}
            className="min-h-11 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-base text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-invalid:border-danger sm:w-48"
          />
          <span className="shrink-0 text-sm text-muted">{t("perHourUnit", { currency })}</span>
        </div>
        <button type="submit" disabled={pending} className={secondaryButtonClass}>
          {pending ? tAuth("pending") : t("saveRate")}
        </button>
      </div>
      {state.error && (
        <p id={errorId} className="text-sm font-medium text-danger">
          {t(`errors.${state.error}`)}
        </p>
      )}
      {state.savedAt && !pending && (
        <p role="status" className="text-sm font-medium text-success">
          {state.value ? t("rateSaved") : t("rateRemoved")}
        </p>
      )}
    </form>
  );
}
