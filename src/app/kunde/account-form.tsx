"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { MAX_ACCOUNT_PLACE_LENGTH } from "@/lib/customer-account";
import { saveCustomerAccount, type AccountState } from "./actions";

// Phone and usual place: filled into every new request, so ordering again is quick.
export function AccountForm({ initial, create = false }: { initial: { phone: string; place: string }; create?: boolean }) {
  const t = useTranslations("CustomerAccount");
  const [state, action] = useActionState<AccountState, FormData>(saveCustomerAccount, {});
  const values = state.values ?? initial;
  const error = (field: "phone" | "place") => {
    const code = state.fieldErrors?.[field];
    return code ? t(`errors.${code}`) : undefined;
  };
  return (
    <form action={action} noValidate className="grid gap-4">
      {state.error && <FormAlert kind="error">{t("errors.unknown")}</FormAlert>}
      {state.saved && !create && (
        <div key={state.at} aria-live="polite">
          <FormAlert kind="success">{t("saved")}</FormAlert>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="phone"
          id="account-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          label={t("phone")}
          defaultValue={values.phone}
          error={error("phone")}
        />
        <Field
          name="place"
          id="account-place"
          autoComplete="street-address"
          maxLength={MAX_ACCOUNT_PLACE_LENGTH}
          label={t("place")}
          hint={t("placeHint")}
          defaultValue={values.place}
          error={error("place")}
        />
      </div>
      <div className="sm:w-fit">
        <SubmitButton pendingLabel={t("saving")}>{create ? t("create") : t("save")}</SubmitButton>
      </div>
    </form>
  );
}
