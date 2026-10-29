// Date arithmetic and layout for the job calendar, in the company's local time.
// Dates are wall-clock "YYYY-MM-DD" strings, so a day is a day even when the
// clocks change; instants come from fromLocalParts (see jobs.ts).

import { fromLocalParts, toLocalParts } from "./jobs";

export const calendarViews = ["day", "week"] as const;
export type CalendarView = (typeof calendarViews)[number];
export const calendarGroups = ["vehicle", "driver"] as const;
export type CalendarGroup = (typeof calendarGroups)[number];

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

// The date n days after (or before) a date.
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// The Monday of the date's week (Norwegian weeks start on Monday).
export function weekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Monday 0 … Sunday 6
  return addDays(date, -weekday);
}

// The ISO week number (Norwegians say "uke 44").
export function weekNumber(date: string): number {
  const thursday = addDays(weekStart(date), 3);
  const [y] = thursday.split("-").map(Number);
  const firstThursday = addDays(weekStart(`${y}-01-04`), 3);
  return 1 + Math.round((Date.parse(thursday) - Date.parse(firstThursday)) / (7 * 86_400_000));
}

// A date from the address bar, or the fallback when it is missing or not a real day.
export function parseDate(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !isoDate.test(value)) return fallback;
  return addDays(value, 0) === value ? value : fallback;
}

// The days a view shows, and the instants from the first midnight to the one after the last day.
export function calendarRange(date: string, view: CalendarView, timeZone: string) {
  const first = view === "week" ? weekStart(date) : date;
  const days = Array.from({ length: view === "week" ? 7 : 1 }, (_, i) => addDays(first, i));
  const after = addDays(days[days.length - 1], 1);
  return {
    days,
    // Midnight always exists in Norway; 01:00 is the fallback for zones that skip it.
    from: fromLocalParts(first, "00:00", timeZone) ?? fromLocalParts(first, "01:00", timeZone)!,
    to: fromLocalParts(after, "00:00", timeZone) ?? fromLocalParts(after, "01:00", timeZone)!,
  };
}

// Where a job sits on a day's timeline, in minutes from that day's midnight by
// the clock, clipped to the day (a job over midnight shows on both days).
export function minutesOnDay(job: { starts_at: string; ends_at: string }, date: string, timeZone: string) {
  const at = (iso: string) => {
    const local = toLocalParts(new Date(iso), timeZone);
    if (local.date < date) return 0;
    if (local.date > date) return 24 * 60;
    const [h, m] = local.time.split(":").map(Number);
    return h * 60 + m;
  };
  return { start: at(job.starts_at), end: Math.max(at(job.ends_at), at(job.starts_at) + 15) };
}

// The hours a day's timeline shows: 06–20, widened to fit every job.
export function visibleHours(spans: { start: number; end: number }[]): { from: number; to: number } {
  let from = 6;
  let to = 20;
  for (const span of spans) {
    from = Math.min(from, Math.floor(span.start / 60));
    to = Math.max(to, Math.ceil(span.end / 60));
  }
  return { from, to: Math.min(to, 24) };
}
