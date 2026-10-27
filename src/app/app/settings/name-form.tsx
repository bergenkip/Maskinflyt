"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { saveName, type NameState } from "../actions";

export function NameForm({ firstName, lastName }: { firstName: string; lastName: string }) {
  const t = useTranslations("Settings");
  const tAuth = useTranslations("Auth");
  const [state, action] = useActionState<NameState, FormData>(saveName, {});

  return (
    <form action={action} noValidate className="grid gap-4">
      <Field
        name="firstName"
        label={tAuth("firstName")}
        autoComplete="given-name"
        autoCapitalize="words"
        maxLength={100}
        required
        defaultValue={state.values?.firstName ?? firstName}
        error={state.fieldErrors?.firstName && tAuth(`errors.${state.fieldErrors.firstName}`)}
      />
      <Field
        name="lastName"
        label={tAuth("lastName")}
        autoComplete="family-name"
        autoCapitalize="words"
        maxLength={100}
        required
        defaultValue={state.values?.lastName ?? lastName}
        error={state.fieldErrors?.lastName && tAuth(`errors.${state.fieldErrors.lastName}`)}
      />
      {state.status === "saved" && <FormAlert kind="success">{t("saved")}</FormAlert>}
      {state.status === "error" && <FormAlert kind="error">{t("error")}</FormAlert>}
      <div>
        <SubmitButton pendingLabel={tAuth("pending")}>{t("save")}</SubmitButton>
      </div>
    </form>
  );
}
