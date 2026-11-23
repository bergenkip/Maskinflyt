// Stage 13b: the finished jobs behind an employee's hours sheet, for the
// owner and the accountant. Pure helpers; RLS decides which jobs are read.

import { toLocalParts } from "./jobs";

export type DoneJob = {
  id: string;
  number: number;
  starts_at: string;
  ends_at: string;
  address: string;
  driver_id: string | null;
  customers: { name: string } | null;
  job_times: { worked_minutes: number; created_at: string }[];
};

type SheetPeriod = { user_id: string; period_from: string; period_to: string };

// The company's local day a job starts on.
export const jobDay = (job: Pick<DoneJob, "starts_at">, timeZone: string) => toLocalParts(new Date(job.starts_at), timeZone).date;

// The finished jobs the sheet's employee drove in the sheet's period (both days included), in time order.
export function jobsInSheet<T extends Pick<DoneJob, "driver_id" | "starts_at">>(jobs: T[], sheet: SheetPeriod, timeZone: string): T[] {
  return jobs
    .filter((job) => {
      if (job.driver_id !== sheet.user_id) return false;
      const day = jobDay(job, timeZone);
      return day >= sheet.period_from && day <= sheet.period_to;
    })
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

// The approved working time of a job: the latest approval counts. Null when not approved.
export function approvedMinutes(job: Pick<DoneJob, "job_times">): number | null {
  const latest = [...job.job_times].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return latest ? latest.worked_minutes : null;
}

// Instants to search between for jobs on these local days: a day wider on
// each side, so every time zone is covered; jobsInSheet then picks by local day.
export function jobSearchRange(from: string, to: string) {
  const day = 24 * 60 * 60 * 1000;
  return {
    from: new Date(Date.parse(`${from}T00:00:00Z`) - day).toISOString(),
    to: new Date(Date.parse(`${to}T00:00:00Z`) + 2 * day).toISOString(),
  };
}

const monthPattern = /^(\d{4})-(0[1-9]|1[0-2])$/;

// "2026-11" → the first and last day of that month; null when not a month.
export function monthRange(month: string): { from: string; to: string } | null {
  const match = monthPattern.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const index = Number(match[2]) - 1;
  const last = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

// "2026-11", -1 → "2026-10"; 1 → "2026-12".
export function shiftMonth(month: string, by: number): string {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 1 + by, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
