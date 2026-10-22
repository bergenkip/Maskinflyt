"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { setLocale } from "@/i18n/actions";
import { localeNames, locales } from "@/i18n/locale";

export function LanguageSwitcher() {
  const t = useTranslations("LanguageSwitcher");
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();

  return (
    <form action={setLocale} className="flex items-center gap-2">
      <label htmlFor="locale" className="text-sm text-muted">
        {t("label")}
      </label>
      <select
        id="locale"
        name="locale"
        defaultValue={locale}
        disabled={isPending}
        onChange={(event) => {
          const formData = new FormData(event.currentTarget.form ?? undefined);
          startTransition(() => setLocale(formData));
        }}
        // 16px text stops iPhone Safari from zooming in; 44px is the minimum tap size.
        className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
      >
        {locales.map((value) => (
          <option key={value} value={value} lang={value}>
            {localeNames[value]}
          </option>
        ))}
      </select>
      {/* Without JavaScript the form still works through this button. */}
      <noscript>
        <button
          type="submit"
          className="min-h-11 rounded-lg bg-accent px-3 text-base text-surface"
        >
          {t("submit")}
        </button>
      </noscript>
    </form>
  );
}
