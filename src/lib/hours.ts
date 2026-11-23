// Stage 13a: the employee's hours sheet for the pay. Pure helpers shared by
// the screens, the PDF and the tests; the database counts the same way
// (public.save_hour_sheet_day and public.submit_hour_sheet) and decides.

export type OvertimeMode = "daily" | "clock";

// daily: overtime after a number of minutes worked in a day (and a later, higher level).
// clock: the minutes inside a time window ("15:00"–"19:00"; past midnight when the
// end is not after the start), and an optional second window that pays more.
export type HourRules = {
  overtime_mode: OvertimeMode;
  overtime_after: number;
  overtime_percent: number;
  overtime2_after: number | null;
  overtime2_percent: number | null;
  overtime_from: string | null;
  overtime_to: string | null;
  overtime2_from: string | null;
  overtime2_to: string | null;
};

// The columns of the rules, the same in hour_settings and in a confirmed hour_sheets row.
export const ruleColumns =
  "overtime_mode, overtime_after, overtime_percent, overtime2_after, overtime2_percent, overtime_from, overtime_to, overtime2_from, overtime2_to";

// Used until the company saves its own (the same as public.submit_hour_sheet).
export const defaultHourRules: HourRules = {
  overtime_mode: "daily",
  overtime_after: 480,
  overtime_percent: 50,
  overtime2_after: null,
  overtime2_percent: null,
  overtime_from: null,
  overtime_to: null,
  overtime2_from: null,
  overtime2_to: null,
};

const hhmm = (time: unknown) => (typeof time === "string" && time.length >= 5 ? time.slice(0, 5) : null);

// A row from the database ("15:00:00", nulls) as rules; the defaults where it is empty.
export function toHourRules(row: Partial<Record<keyof HourRules, unknown>> | null | undefined): HourRules {
  if (!row) return defaultHourRules;
  const num = (value: unknown) => (typeof value === "number" ? value : null);
  return {
    overtime_mode: row.overtime_mode === "clock" ? "clock" : "daily",
    overtime_after: num(row.overtime_after) ?? 480,
    overtime_percent: num(row.overtime_percent) ?? 50,
    overtime2_after: num(row.overtime2_after),
    overtime2_percent: num(row.overtime2_percent),
    overtime_from: hhmm(row.overtime_from),
    overtime_to: hhmm(row.overtime_to),
    overtime2_from: hhmm(row.overtime2_from),
    overtime2_to: hhmm(row.overtime2_to),
  };
}

// Whether the rules have a second level.
export const hasLevel2 = (rules: HourRules) =>
  rules.overtime2_percent !== null && (rules.overtime_mode === "clock" ? rules.overtime2_from !== null : rules.overtime2_after !== null);

export const MAX_SHEET_DAYS = 62;
export const MAX_HOUR_NOTE_LENGTH = 200;

export type SheetDay = {
  day: string;
  starts: string;
  ends: string;
  break_minutes: number;
  note: string | null;
  worked_minutes: number;
  normal_minutes?: number | null;
  overtime_minutes?: number | null;
  overtime2_minutes?: number | null;
};

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

// From start to end (the next morning when the end is not after the start), less the break.
export function dayMinutes(starts: string, ends: string, breakMinutes: number) {
  const span = minutesOf(ends) - minutesOf(starts);
  return (span <= 0 ? span + 24 * 60 : span) - breakMinutes;
}

const inWindow = (minute: number, from: string | null, to: string | null) => {
  if (!from || !to) return false;
  const start = minutesOf(from);
  const end = minutesOf(to);
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
};

type DayTimes = Pick<SheetDay, "starts" | "ends" | "break_minutes" | "worked_minutes">;

// One day's minutes: normal, at the first overtime level, at the second (the
// same as private.split_day). By the clock, each minute goes to the window it
// is in (the second wins where they overlap), and the break comes off the
// normal minutes first, then the first level, then the second.
export function splitDay(day: DayTimes, rules: HourRules) {
  const worked = day.worked_minutes;
  if (rules.overtime_mode === "clock") {
    const start = minutesOf(day.starts);
    let end = minutesOf(day.ends);
    if (end <= start) end += 24 * 60;
    const count = [0, 0, 0];
    for (let m = start; m < end; m++) {
      const clock = m % (24 * 60);
      count[inWindow(clock, rules.overtime2_from, rules.overtime2_to) ? 2 : inWindow(clock, rules.overtime_from, rules.overtime_to) ? 1 : 0]++;
    }
    let rest = day.break_minutes;
    for (const level of [0, 1, 2]) {
      const take = level === 2 ? rest : Math.min(rest, count[level]);
      count[level] -= take;
      rest -= take;
    }
    return { normal: count[0], overtime: count[1], overtime2: count[2] };
  }
  const normal = Math.min(worked, rules.overtime_after);
  const upTo2 = rules.overtime2_after === null ? worked : Math.min(worked, rules.overtime2_after);
  return {
    normal,
    overtime: Math.max(0, upTo2 - rules.overtime_after),
    overtime2: rules.overtime2_after === null ? 0 : Math.max(0, worked - rules.overtime2_after),
  };
}

export function sheetTotals(days: DayTimes[], rules: HourRules) {
  return days.reduce(
    (sum, day) => {
      const split = splitDay(day, rules);
      return {
        worked: sum.worked + day.worked_minutes,
        normal: sum.normal + split.normal,
        overtime: sum.overtime + split.overtime,
        overtime2: sum.overtime2 + split.overtime2,
      };
    },
    { worked: 0, normal: 0, overtime: 0, overtime2: 0 },
  );
}

// 450 minutes → 7.5 (hours, as pay is counted), at most two decimals.
export const decimalHours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;

// "7.5" or "7,5" (hours, from a form) → 450 minutes; null when not a number of hours and quarters.
export function parseHours(value: string, min = 1, max = 24): number | null {
  const text = value.trim().replace(",", ".");
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(text)) return null;
  const minutes = Math.round(Number(text) * 60);
  return minutes >= min * 60 && minutes <= max * 60 ? minutes : null;
}

export type DayFieldError = "day" | "starts" | "ends" | "break" | "note";

const time = /^([01]\d|2[0-3]):[0-5]\d$/;

// A day from the form, checked as the database checks it.
export function validateDay(
  formData: FormData,
  period: { from: string; to: string },
): { day: { day: string; starts: string; ends: string; break_minutes: number; note: string | null } } | { errors: DayFieldError[] } {
  const day = String(formData.get("day") ?? "");
  const starts = String(formData.get("starts") ?? "").slice(0, 5);
  const ends = String(formData.get("ends") ?? "").slice(0, 5);
  const breakText = String(formData.get("break") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim().replace(/\s+/g, " ");
  const breakMinutes = breakText === "" ? 0 : /^\d{1,3}$/.test(breakText) ? Number(breakText) : -1;

  const errors: DayFieldError[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < period.from || day > period.to) errors.push("day");
  if (!time.test(starts)) errors.push("starts");
  if (!time.test(ends) || ends === starts) errors.push("ends");
  if (breakMinutes < 0 || breakMinutes > 600 || (time.test(starts) && time.test(ends) && ends !== starts && dayMinutes(starts, ends, breakMinutes) < 1))
    errors.push("break");
  if (note.length > MAX_HOUR_NOTE_LENGTH) errors.push("note");
  if (errors.length) return { errors };
  return { day: { day, starts, ends, break_minutes: breakMinutes, note: note || null } };
}

// "Timeliste-Sander-Lie-2026-11-01-2026-11-30.pdf": the name kept to letters, digits and dashes.
export function sheetFileName(name: string, from: string, to: string) {
  const safe = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "Ae")
    .replace(/ø/g, "o")
    .replace(/Ø/g, "O")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `Timeliste-${safe ? `${safe}-` : ""}${from}-${to}.pdf`;
}
