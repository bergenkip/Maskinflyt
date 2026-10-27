import { orgCountries, type OrgCountry } from "./org-number";

// Country names in the interface language, made on the server so the browser
// shows the same list. Norway (the default) stays first.
export function countryOptions(locale: string): { code: OrgCountry; name: string }[] {
  const names = new Intl.DisplayNames([locale], { type: "region" });
  const [norway, ...others] = orgCountries.map((code) => ({ code, name: names.of(code) ?? code }));
  return [norway, ...others.sort((a, b) => a.name.localeCompare(b.name, locale))];
}
