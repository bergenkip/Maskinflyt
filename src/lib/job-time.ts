// The working time form: the office approves or corrects a finished job's time.
// The database counts the minutes and the price again (see the job_time migration).

import { fromLocalParts, toLocalParts } from "./jobs";

export const MAX_REASON_LENGTH = 500;
const MAX_MINUTES = 24 * 60;

export type TimeFormValues = { date: string; start: string; end: string; breaks: string; reason: string };
export type TimeFieldError = "dateInvalid" | "startInvalid" | "endInvalid" | "tooLong" | "breaksInvalid" | "reasonTooLong";
export type TimeFields = { started_at: string; ended_at: string; break_minutes: number; reason: string | null };

// "07:00"–"16:00" on a date, with breaks in minutes. An end at or before the
// start is the next morning (work into the night).
export function validateTime(
  formData: FormData,
  timeZone: string,
): { values: TimeFormValues; fieldErrors?: Partial<Record<keyof TimeFormValues, TimeFieldError>>; fields?: TimeFields } {
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const values: TimeFormValues = {
    date: text("date"),
    start: text("start"),
    end: text("end"),
    breaks: text("breaks"),
    reason: text("reason"),
  };
  const fieldErrors: Partial<Record<keyof TimeFormValues, TimeFieldError>> = {};

  const started = fromLocalParts(values.date, values.start, timeZone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) fieldErrors.date = "dateInvalid";
  else if (!started) fieldErrors.start = "startInvalid";

  let ended: Date | undefined;
  if (started) {
    const sameDay = fromLocalParts(values.date, values.end, timeZone);
    if (sameDay && sameDay > started) ended = sameDay;
    else if (/^\d{2}:\d{2}$/.test(values.end)) {
      const next = new Date(`${values.date}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      ended = fromLocalParts(next.toISOString().slice(0, 10), values.end, timeZone);
    }
    if (!ended) fieldErrors.end = "endInvalid";
    else if (ended.getTime() - started.getTime() > MAX_MINUTES * 60_000) fieldErrors.end = "tooLong";
  } else if (!/^\d{2}:\d{2}$/.test(values.end)) {
    fieldErrors.end = "endInvalid";
  }

  const breaks = values.breaks === "" ? 0 : /^\d{1,4}$/.test(values.breaks) ? Number(values.breaks) : undefined;
  const span = started && ended ? Math.floor((ended.getTime() - started.getTime()) / 60_000) : undefined;
  if (breaks === undefined || (span !== undefined && breaks >= span)) fieldErrors.breaks = "breaksInvalid";
  if (values.reason.length > MAX_REASON_LENGTH) fieldErrors.reason = "reasonTooLong";

  if (Object.keys(fieldErrors).length > 0 || !started || !ended || breaks === undefined) return { values, fieldErrors };
  return {
    values,
    fields: {
      started_at: started.toISOString(),
      ended_at: ended.toISOString(),
      break_minutes: breaks,
      reason: values.reason || null,
    },
  };
}

// A stored time as the form's text.
export function toTimeFormValues(time: { started_at: string; ended_at: string; break_minutes: number }, timeZone: string) {
  const start = toLocalParts(new Date(time.started_at), timeZone);
  return {
    date: start.date,
    start: start.time,
    end: toLocalParts(new Date(time.ended_at), timeZone).time,
    breaks: String(time.break_minutes),
    reason: "",
  };
}

// 510 minutes → { hours: 8, minutes: 30 }, for "8 h 30 min".
export function splitMinutes(total: number) {
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}
