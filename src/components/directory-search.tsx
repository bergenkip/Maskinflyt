import { useTranslations } from "next-intl";
import { SearchIcon } from "@/components/icons";
import { services, type Service } from "@/lib/company-page";
import { DIRECTORY_PATH, MAX_PLACE_LENGTH, serviceSlugs } from "@/lib/directory";

const control =
  "min-h-11 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

// The catalog search: a service and a place, sent to /finn as a plain GET form,
// so it works without JavaScript. Used on the catalog and on the home page.
export function DirectorySearch({
  id,
  service = null,
  place = "",
  className = "",
}: {
  // Keeps the field ids unique when the page has more than one search.
  id: string;
  service?: Service | null;
  place?: string;
  className?: string;
}) {
  const t = useTranslations("Directory");
  const tServices = useTranslations("Services");
  return (
    <form
      action={DIRECTORY_PATH}
      method="get"
      role="search"
      aria-label={t("searchLabel")}
      className={`grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end ${className}`}
    >
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-service`} className="font-medium">
          {t("service")}
        </label>
        <select id={`${id}-service`} name="tjeneste" defaultValue={service ? serviceSlugs[service] : ""} className={control}>
          <option value="">{t("allServices")}</option>
          {services.map((value) => (
            <option key={value} value={serviceSlugs[value]}>
              {tServices(value)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-place`} className="font-medium">
          {t("place")}
        </label>
        <input
          id={`${id}-place`}
          name="sted"
          type="search"
          enterKeyHint="search"
          autoComplete="address-level2"
          maxLength={MAX_PLACE_LENGTH}
          defaultValue={place}
          placeholder={t("placePlaceholder")}
          className={control}
        />
      </div>
      <button
        type="submit"
        className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent px-5 font-semibold text-on-accent hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <SearchIcon className="size-5" />
        {t("search")}
      </button>
    </form>
  );
}
