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

// Browsers may send "no" or "nn" for Norwegian; we only ship Bokmål.
const aliases: Record<string, Locale> = {
  nb: "nb",
  no: "nb",
  nn: "nb",
  en: "en",
  lt: "lt",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function matchAcceptLanguage(header: string | null | undefined): Locale | undefined {
  if (!header) return undefined;

  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="));
      const quality = q ? Number(q.slice(2)) : 1;
      return { tag: tag.toLowerCase(), quality: Number.isNaN(quality) ? 0 : quality, index };
    })
    .filter((entry) => entry.tag && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  for (const { tag } of ranked) {
    const match = aliases[tag.split("-")[0]];
    if (match) return match;
  }
  return undefined;
}

export type LocaleSources = {
  // Saved in the user's profile (Settings → Language). Follows the user to every device.
  profile?: string | null;
  // Chosen on this device with the switcher before signing in.
  cookie?: string | null;
  // The company's default language.
  organization?: string | null;
  acceptLanguage?: string | null;
};

// Order: profile → this device's choice → company default → browser → nb.
export function resolveLocale(sources: LocaleSources): Locale {
  if (isLocale(sources.profile)) return sources.profile;
  if (isLocale(sources.cookie)) return sources.cookie;
  if (isLocale(sources.organization)) return sources.organization;
  return matchAcceptLanguage(sources.acceptLanguage) ?? defaultLocale;
}
