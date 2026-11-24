import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { isLocale } from "@/i18n/locale";

// Real screens of the app with made-up data (company "Fjordkran AS", .test
// addresses), one set per language: the office calendar in a browser window
// and the driver's phone in front of it. How they were made: docs/HANDOFF.md.
export function ProductShowcase() {
  const t = useTranslations("Home.showcase");
  const current = useLocale();
  const locale = isLocale(current) ? current : "nb";

  return (
    <figure className="mt-12 sm:mt-16">
      {/* Fixed proportions, so the phone that reaches below the window never covers the caption. */}
      <div className="relative aspect-[100/53]">
        {/* Browser window with the office calendar. */}
        <div className="absolute top-0 left-0 w-[80%] overflow-hidden rounded-lg border border-border bg-surface shadow-xl shadow-slate-900/10 sm:rounded-xl">
          <div aria-hidden="true" className="flex items-center gap-1 border-b border-border px-2 py-1.5 sm:gap-1.5 sm:px-4 sm:py-3">
            <span className="size-1.5 rounded-full bg-border sm:size-2.5" />
            <span className="size-1.5 rounded-full bg-border sm:size-2.5" />
            <span className="size-1.5 rounded-full bg-border sm:size-2.5" />
          </div>
          <Image
            src={`/screens/calendar-${locale}.webp`}
            alt={t("calendarAlt")}
            width={2048}
            height={1104}
            sizes="(min-width: 1024px) 820px, 80vw"
            priority
            className="h-auto w-full"
          />
        </div>

        {/* The driver's phone in front of the window's right edge, framed like the window. */}
        <div className="absolute top-[7%] right-0 w-[22%] rounded-[1rem] border border-border bg-surface p-[1.2%] shadow-2xl shadow-slate-900/20 sm:rounded-[2rem] sm:p-2">
          <Image
            src={`/screens/driver-${locale}.webp`}
            alt={t("driverAlt")}
            width={780}
            height={1688}
            sizes="(min-width: 1024px) 230px, 22vw"
            className="h-auto w-full rounded-[0.75rem] sm:rounded-[1.5rem]"
          />
        </div>
      </div>

      <figcaption className="mt-4 text-sm text-muted">{t("caption")}</figcaption>
    </figure>
  );
}
