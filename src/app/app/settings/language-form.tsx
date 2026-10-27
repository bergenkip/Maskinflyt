"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormAlert, SubmitButton } from "@/components/form";
import { localeNames, locales } from "@/i18n/locale";
import { saveLanguage, type LanguageState } from "../actions";

export function LanguageForm({ current }: { current: string }) {
  const t = useTranslations("Settings");
  const tAuth = useTranslations("Auth");
  const [state, action] = useActionState<LanguageState, FormData>(saveLanguage, {});

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-1.5">
        <label htmlFor="settings-locale" className="font-medium">
          {t("language")}
        </label>
        <select
          id="settings-locale"
          name="locale"
          defaultValue={current}
          className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent sm:max-w-xs"
        >
          {locales.map((value) => (
            <option key={value} value={value} lang={value}>
              {localeNames[value]}
            </option>
          ))}
        </select>
      </div>
      {state.status === "saved" && <FormAlert kind="success">{t("saved")}</FormAlert>}
      {state.status === "error" && <FormAlert kind="error">{t("error")}</FormAlert>}
      <div>
        <SubmitButton pendingLabel={tAuth("pending")}>{t("save")}</SubmitButton>
      </div>
    </form>
  );
}
