"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { CheckRow } from "@/components/check-row";
import type { InvoiceSettingsValues } from "@/lib/invoice-settings";
import { saveInvoiceSettings, type InvoiceSettingsState } from "./actions";

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
      {/* One per row: the long "(optional)" labels would push one field below the other. */}
      <div className="grid gap-5">
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
