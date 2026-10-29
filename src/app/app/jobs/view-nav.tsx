import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarIcon, ListIcon } from "@/components/icons";

export const segmentClass =
  "flex min-h-11 items-center gap-2 rounded-lg px-4 font-medium text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-[current=page]:bg-surface aria-[current=page]:text-foreground aria-[current=page]:shadow-sm";

// The two ways to see the jobs: as a list by day, or on the calendar.
export async function JobsViewNav({ current }: { current: "list" | "calendar" }) {
  const t = await getTranslations("Jobs");
  return (
    <nav aria-label={t("viewLabel")} className="flex w-full rounded-xl bg-accent-soft/60 p-1 sm:w-fit">
      <Link href="/app/jobs" aria-current={current === "list" ? "page" : undefined} className={`${segmentClass} flex-1 justify-center`}>
        <ListIcon className="size-5" />
        {t("viewList")}
      </Link>
      <Link
        href="/app/jobs/calendar"
        aria-current={current === "calendar" ? "page" : undefined}
        className={`${segmentClass} flex-1 justify-center`}
      >
        <CalendarIcon className="size-5" />
        {t("viewCalendar")}
      </Link>
    </nav>
  );
}
