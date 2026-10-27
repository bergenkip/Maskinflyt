const WEIGHTS = [3, 2, 7, 6, 5, 4, 3, 2];

// Countries a company can be registered in (ISO 3166-1 alpha-2). Norway first:
// it is the default and the only one with a check-digit rule today.
export const orgCountries = ["NO", "SE", "DK", "FI", "IS", "LT", "LV", "EE", "PL", "DE", "GB"] as const;
export type OrgCountry = (typeof orgCountries)[number];

export function isOrgCountry(value: unknown): value is OrgCountry {
  return typeof value === "string" && (orgCountries as readonly string[]).includes(value);
}

// Registers write numbers with spaces, dots or dashes (e.g. 556677-8899);
// we store only the letters and digits. The database does the same.
export function normalizeOrgNumber(value: string): string {
  return value.replace(/[\s.-]/g, "").toUpperCase();
}

// Norwegian organisasjonsnummer: 9 digits, the last one a MOD11 check digit.
// Other countries: 2–20 letters or digits, no check digit.
// The database checks the same rules (public.create_organization).
export function isValidOrgNumber(value: string, country: string = "NO"): boolean {
  const digits = normalizeOrgNumber(value);
  if (country !== "NO") return /^[A-Z0-9]{2,20}$/.test(digits);
  if (!/^\d{9}$/.test(digits)) return false;
  const total = WEIGHTS.reduce((sum, weight, i) => sum + Number(digits[i]) * weight, 0);
  const remainder = total % 11;
  const checkDigit = remainder === 0 ? 0 : 11 - remainder;
  return checkDigit !== 10 && checkDigit === Number(digits[8]);
}

// "123456785" → "123 456 785" for Norwegian numbers; others as stored.
export function formatOrgNumber(value: string, country: string = "NO") {
  return country === "NO" ? value.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3") : value;
}
