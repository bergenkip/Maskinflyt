export const locales = ["nb", "en", "lt"] as const;

export type Locale = (typeof locales)[number];

// Norwegian companies are the main market, so Bokmål is the fallback.
export const defaultLocale: Locale = "nb";

export const LOCALE_COOKIE = "NEXT_LOCALE";

// Language names are shown in their own language, so a user can always
// find their language even when the interface is in another one.
export const localeNames: Record<Locale, string> = {
  nb: "Norsk bokmål",
  en: "English",
  lt: "Lietuvių",
};

// Languages everyone can pick. Lithuanian works everywhere but stays hidden
// until it is switched on with the link ?lang=lt (owner's decision 2026-11-25).
export const publicLocales: readonly Locale[] = ["nb", "en"];

// The choices to list: the public ones, plus the current one if it is hidden,
// so a person who switched it on can still see and keep it.
export function visibleLocales(current: string): Locale[] {
  const list = [...publicLocales];
  if (isLocale(current) && !list.includes(current)) list.push(current);
  return list;
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export type LocaleSources = {
  // Saved in the user's profile (Settings → Language). Follows the user to every device.
  profile?: string | null;
  // Chosen on this device with the switcher before signing in.
  cookie?: string | null;
  // The company's default language.
  organization?: string | null;
};

// Order: profile → this device's choice → company default → nb.
// The browser's language is not used: every new visitor sees Norwegian first.
export function resolveLocale(sources: LocaleSources): Locale {
  if (isLocale(sources.profile)) return sources.profile;
  if (isLocale(sources.cookie)) return sources.cookie;
  if (isLocale(sources.organization)) return sources.organization;
  return defaultLocale;
}
