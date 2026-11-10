"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { CheckIcon } from "@/components/icons";
import type { InvoiceSettingsValues } from "@/lib/invoice-settings";
import { saveInvoiceSettings, type InvoiceSettingsState } from "./actions";

// A yes/no row. The real checkbox covers the whole row (border included), so all of it is the tap target.
function CheckRow({ name, label, hint, defaultChecked }: { name: string; label: string; hint: string; defaultChecked: boolean }) {
  return (
    <label
      htmlFor={name}
      className="relative flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-accent"
    >
      <input
        id={name}
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        aria-labelledby={`${name}-label`}
        aria-describedby={`${name}-hint`}
        className="peer absolute -inset-px m-0 cursor-pointer appearance-none rounded-lg opacity-0"
      />
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border-2 border-muted bg-surface text-transparent peer-checked:border-accent peer-checked:bg-accent peer-checked:text-on-accent"
      >
        <CheckIcon className="size-4" />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span id={`${name}-label`} className="font-medium">
          {label}
        </span>
        <span id={`${name}-hint`} className="text-sm text-muted">
          {hint}
        </span>
      </span>
    </label>
  );
}

export function InvoiceSettingsForm({ initial }: { initial: InvoiceSettingsValues }) {
  const t = useTranslations("InvoiceSettings");
  const tAuth = useTranslations("Auth");
  const [state, action] = useActionState<InvoiceSettingsState, FormData>(saveInvoiceSettings, {});
  const values = state.values ?? initial;
  const error = (field: keyof InvoiceSettingsValues) => {
    const code = state.fieldErrors?.[field];
    return code && t(`errors.${code}`);
  };

  return (
    // The key renders the fields afresh after each answer (React resets forms after an action).
    <form key={state.savedAt ?? JSON.stringify(state.fieldErrors ?? {})} action={action} noValidate className="grid gap-5">
      <Field
        name="orgNumber"
        label={t("orgNumber")}
        hint={t("orgNumberHint")}
        inputMode="numeric"
        autoComplete="off"
        maxLength={24}
        required
        defaultValue={values.orgNumber}
        error={error("orgNumber")}
      />
      <Field
        name="street"
        label={t("street")}
        autoComplete="street-address"
        maxLength={200}
        required
        defaultValue={values.street}
        error={error("street")}
      />
      <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
        <Field
          name="postalCode"
          label={t("postalCode")}
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={10}
          required
          defaultValue={values.postalCode}
          error={error("postalCode")}
        />
        <Field
          name="city"
          label={t("city")}
          autoComplete="address-level2"
          maxLength={100}
          required
          defaultValue={values.city}
          error={error("city")}
        />
      </div>
      <div className="grid gap-2">
        <CheckRow name="vatRegistered" label={t("vatRegistered")} hint={t("vatRegisteredHint")} defaultChecked={values.vatRegistered} />
        <CheckRow
          name="inBusinessRegister"
          label={t("inBusinessRegister")}
          hint={t("inBusinessRegisterHint")}
          defaultChecked={values.inBusinessRegister}
        />
      </div>
      <Field
        name="bankAccount"
        label={t("bankAccount")}
        hint={t("bankAccountHint")}
        inputMode="numeric"
        autoComplete="off"
        maxLength={16}
        required
        defaultValue={values.bankAccount}
        error={error("bankAccount")}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          name="paymentDays"
          label={t("paymentDays")}
          hint={t("paymentDaysHint")}
          inputMode="numeric"
          maxLength={2}
          required
          defaultValue={values.paymentDays}
          error={error("paymentDays")}
        />
        <Field
          name="firstNumber"
          label={t("firstNumber")}
          hint={t("firstNumberHint")}
          inputMode="numeric"
          maxLength={9}
          required
          defaultValue={values.firstNumber}
          error={error("firstNumber")}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          name="email"
          type="email"
          label={t("email")}
          autoComplete="email"
          maxLength={254}
          defaultValue={values.email}
          error={error("email")}
        />
        <Field name="phone" type="tel" label={t("phone")} autoComplete="tel" maxLength={20} defaultValue={values.phone} error={error("phone")} />
      </div>
      {state.savedAt && <FormAlert kind="success">{t("saved")}</FormAlert>}
      {state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}
      <div>
        <SubmitButton pendingLabel={tAuth("pending")}>{t("save")}</SubmitButton>
      </div>
    </form>
  );
}
