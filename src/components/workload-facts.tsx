import { getFormatter, getTranslations } from "next-intl/server";
import { CalendarIcon, ClockIcon, TruckIcon } from "@/components/icons";
import type { Load } from "@/lib/workload";

type Formatter = Awaited<ReturnType<typeof getFormatter>>;

// "21,5" hours from minutes, in the reader's language.
export function hoursNumber(format: Formatter, minutes: number) {
  return format.number(minutes / 60, { maximumFractionDigits: 1 });
}

export function busyPercent(format: Formatter, busy: number) {
  return format.number(busy, { style: "percent", maximumFractionDigits: 0 });
}

// The work of a day as one line: jobs · hours · machines · busy. Each fact has an icon and words.
export async function WorkloadFacts({ load, label, className = "" }: { load: Load; label: string; className?: string }) {
  const [t, format] = await Promise.all([getTranslations("Workload"), getFormatter()]);
  const item = "flex items-center gap-1.5 whitespace-nowrap";
  return (
    <ul aria-label={label} className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium ${className}`}>
      <li className={item}>
        <CalendarIcon className="size-4 text-muted" />
        {t("jobs", { count: load.jobs })}
      </li>
      <li className={item}>
        <ClockIcon className="size-4 text-muted" />
        {t("hours", { hours: hoursNumber(format, load.minutes) })}
      </li>
      <li className={item}>
        <TruckIcon className="size-4 text-muted" />
        {t("machines", { count: load.machines })}
      </li>
      {load.busy !== null && (
        <li className={item}>
          <BusyMeter busy={load.busy} />
          {t("busy", { percent: busyPercent(format, load.busy) })}
        </li>
      )}
    </ul>
  );
}

// A small bar that fills up as the machines get busy; the words beside it say the number.
export function BusyMeter({ busy, className = "w-10" }: { busy: number; className?: string }) {
  return (
    <span aria-hidden="true" className={`relative h-1.5 overflow-hidden rounded-full bg-border ${className}`}>
      <span
        className={`absolute inset-y-0 left-0 rounded-full ${busy > 1 ? "bg-warning" : "bg-accent"}`}
        style={{ width: `${Math.min(busy, 1) * 100}%` }}
      />
    </span>
  );
}
