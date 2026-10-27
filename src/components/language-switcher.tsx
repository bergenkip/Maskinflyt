"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { setLocale } from "@/i18n/actions";
import { defaultLocale, isLocale, localeNames, locales } from "@/i18n/locale";
import { ChevronDownIcon, GlobeIcon } from "./icons";

export function LanguageSwitcher() {
  const t = useTranslations("LanguageSwitcher");
  const locale = useLocale();
  const current = isLocale(locale) ? locale : defaultLocale;
  const [isPending, startTransition] = useTransition();

  return (
    <form action={setLocale} className="flex items-center gap-2">
      {/* Phones: the label is read aloud but not shown, so the header fits one row. */}
      <label htmlFor="locale" className="max-sm:sr-only text-sm text-muted">
        {t("label")}
      </label>
      {/* The native select lies invisibly over a compact button face: phones show
          the language code (NB / EN / LT), wider screens the full name. Tapping
          still opens the system picker with the full names. */}
      <div className="relative flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-base text-foreground focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent has-disabled:opacity-60">
        <GlobeIcon className="size-4 text-muted sm:hidden" />
        <span aria-hidden="true" className="font-medium sm:hidden">
          {current.toUpperCase()}
        </span>
        <span aria-hidden="true" className="max-sm:hidden">
          {localeNames[current]}
        </span>
        <ChevronDownIcon className="size-4 text-muted" />
        <select
          id="locale"
          name="locale"
          defaultValue={locale}
          disabled={isPending}
          onChange={(event) => {
            const formData = new FormData(event.currentTarget.form ?? undefined);
            startTransition(() => setLocale(formData));
          }}
          // 16px text stops iPhone Safari from zooming in; it covers the whole face, border included, so the tap area is 44px.
          className="absolute -top-px -left-px h-11 w-[calc(100%+2px)] cursor-pointer appearance-none rounded-lg text-base opacity-0"
        >
          {locales.map((value) => (
            <option key={value} value={value} lang={value}>
              {localeNames[value]}
            </option>
          ))}
        </select>
      </div>
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
