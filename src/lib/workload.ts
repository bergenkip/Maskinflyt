// How much work a day, a week or a month holds (Li, 2026-11-25): jobs, hours,
// machines in use and how busy the machines are. Counted from the jobs'
// times alone, so it works for every trade; a quantity such as m³ comes later.
//
// Busy ("belegg") = machine time booked / machine time available, where the
// time available is the active machines × the company's working hours that day
// (from the opening hours on the company page; days off have none).

import { addDays } from "./calendar";
import { fromLocalParts } from "./jobs";

export type LoadJob = {
  starts_at: string;
  ends_at: string;
  status: string;
  vehicle_id: string | null;
};
export type OpeningHours = { weekday: number; opens: string; closes: string }[];

// Used until the company sets its own hours: Monday to Friday, 07–15.
export const DEFAULT_WEEK: OpeningHours = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, opens: "07:00", closes: "15:00" }));

export type Load = {
  jobs: number;
  done: number;
  // Minutes of work on these days (a job over midnight counts on each day for its part).
  minutes: number;
  // Different machines with work.
  machines: number;
  // Machine minutes booked, and available; busy is null when nothing was available.
  bookedMinutes: number;
  availableMinutes: number;
  busy: number | null;
};

const midnight = (day: string, timeZone: string) =>
  (fromLocalParts(day, "00:00", timeZone) ?? fromLocalParts(day, "01:00", timeZone)!).getTime();

const toMinutes = (time: string) => {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
};

// ISO weekday of a "YYYY-MM-DD" date: Monday 1 … Sunday 7.
export function isoWeekday(day: string): number {
  return ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

// The company's working minutes on a day: none on a day off or a closed weekday.
export function openMinutes(day: string, week: OpeningHours, daysOff: ReadonlySet<string>): number {
  if (daysOff.has(day)) return 0;
  const row = week.find((r) => r.weekday === isoWeekday(day));
  return row ? Math.max(0, toMinutes(row.closes) - toMinutes(row.opens)) : 0;
}

// How many minutes of a job fall on a day, by the real clock (a day can have 23 or 25 hours).
export function minutesOn(job: { starts_at: string; ends_at: string }, day: string, timeZone: string): number {
  const from = Math.max(Date.parse(job.starts_at), midnight(day, timeZone));
  const to = Math.min(Date.parse(job.ends_at), midnight(addDays(day, 1), timeZone));
  return Math.max(0, Math.round((to - from) / 60_000));
}

// The load of some days (one for a day, seven for a week, …). Cancelled jobs do not count.
export function workload(
  jobs: LoadJob[],
  days: string[],
  options: { timeZone: string; activeMachines: number; week: OpeningHours; daysOff: ReadonlySet<string> },
): Load {
  const counted = new Set<LoadJob>();
  const machines = new Set<string>();
  let minutes = 0;
  let bookedMinutes = 0;
  let availableMinutes = 0;
  for (const day of days) {
    availableMinutes += options.activeMachines * openMinutes(day, options.week, options.daysOff);
    for (const job of jobs) {
      if (job.status === "cancelled") continue;
      const own = minutesOn(job, day, options.timeZone);
      if (own === 0) continue;
      counted.add(job);
      minutes += own;
      if (job.vehicle_id) {
        machines.add(job.vehicle_id);
        bookedMinutes += own;
      }
    }
  }
  return {
    jobs: counted.size,
    done: [...counted].filter((job) => job.status === "done").length,
    minutes,
    machines: machines.size,
    bookedMinutes,
    availableMinutes,
    busy: availableMinutes > 0 ? bookedMinutes / availableMinutes : null,
  };
}

// The days from a date to another, both included.
export function daysBetween(first: string, last: string): string[] {
  const days: string[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) days.push(day);
  return days;
}
