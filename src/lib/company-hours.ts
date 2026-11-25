// Opening hours and free times (stage 15c), shared by the settings form, the
// public request form and their tests. public.save_company_hours and
// public.company_free_slots check and decide again in the database.

export const weekdays = [1, 2, 3, 4, 5, 6, 7] as const; // ISO: Monday 1 … Sunday 7
export type Weekday = (typeof weekdays)[number];

// Minutes: 30 min … a full day (8 h) or 10 h (Li, 2026-11-25: "more varied lengths").
export const bookingLengths = [30, 60, 90, 120, 180, 240, 300, 360, 480, 600] as const;
export type BookingLength = (typeof bookingLengths)[number];

// How often a start time is offered (07:00, 07:30, …); a booking still lasts its length.
export const slotSteps = [15, 30, 60] as const;
export type SlotStep = (typeof slotSteps)[number];
export const DEFAULT_SLOT_STEP: SlotStep = 30;

export const DEFAULT_OPENS = "07:00";
export const DEFAULT_CLOSES = "15:00";
export const MAX_DAY_OFF_NOTE_LENGTH = 100;

export type DayHours = { weekday: Weekday; open: boolean; opens: string; closes: string };
export type HoursValues = { freeTimes: boolean; bookingMinutes: string; stepMinutes: string; week: DayHours[] };
export type HoursFieldError = "timesInvalid" | "noOpenDay" | "lengthInvalid" | "stepInvalid";

const time = /^([01]\d|2[0-3]):[0-5]\d$/;

// The week as stored rows, with defaults for closed days so the form has something to show.
export function weekFromRows(rows: { weekday: number; opens: string; closes: string }[]): DayHours[] {
  return weekdays.map((weekday) => {
    const row = rows.find((r) => r.weekday === weekday);
    return row
      ? { weekday, open: true, opens: row.opens.slice(0, 5), closes: row.closes.slice(0, 5) }
      : { weekday, open: false, opens: DEFAULT_OPENS, closes: DEFAULT_CLOSES };
  });
}

// The settings form: on or off, the booking length, the start time step, and opens/closes for each open day.
export function validateHours(formData: FormData): {
  values: HoursValues;
  dayErrors: Partial<Record<Weekday, HoursFieldError>>;
  fieldErrors: Partial<Record<"freeTimes" | "bookingMinutes" | "stepMinutes", HoursFieldError>>;
  fields?: { show_free_times: boolean; booking_minutes: BookingLength; step_minutes: SlotStep; week: { weekday: Weekday; opens: string; closes: string }[] };
} {
  const values: HoursValues = {
    freeTimes: formData.get("freeTimes") === "on",
    bookingMinutes: String(formData.get("bookingMinutes") ?? ""),
    stepMinutes: String(formData.get("stepMinutes") ?? ""),
    week: weekdays.map((weekday) => ({
      weekday,
      open: formData.get(`open-${weekday}`) === "on",
      opens: String(formData.get(`opens-${weekday}`) ?? "").trim(),
      closes: String(formData.get(`closes-${weekday}`) ?? "").trim(),
    })),
  };
  const dayErrors: Partial<Record<Weekday, HoursFieldError>> = {};
  const fieldErrors: Partial<Record<"freeTimes" | "bookingMinutes" | "stepMinutes", HoursFieldError>> = {};

  const length = Number(values.bookingMinutes);
  if (!(bookingLengths as readonly number[]).includes(length)) fieldErrors.bookingMinutes = "lengthInvalid";
  const step = Number(values.stepMinutes);
  if (!(slotSteps as readonly number[]).includes(step)) fieldErrors.stepMinutes = "stepInvalid";
  for (const day of values.week) {
    // "HH:MM" strings compare in time order.
    if (day.open && (!time.test(day.opens) || !time.test(day.closes) || day.closes <= day.opens)) {
      dayErrors[day.weekday] = "timesInvalid";
    }
  }
  const open = values.week.filter((day) => day.open);
  if (values.freeTimes && open.length === 0) fieldErrors.freeTimes = "noOpenDay";

  if (Object.keys(dayErrors).length > 0 || Object.keys(fieldErrors).length > 0) return { values, dayErrors, fieldErrors };
  return {
    values,
    dayErrors,
    fieldErrors,
    fields: {
      show_free_times: values.freeTimes,
      booking_minutes: length as BookingLength,
      step_minutes: step as SlotStep,
      week: open.map(({ weekday, opens, closes }) => ({ weekday, opens, closes })),
    },
  };
}

// `free` is false for a time that is already taken (company_time_slots); company_free_slots leaves it out.
export type FreeSlot = { day: string; start_time: string; starts_at: string; free?: boolean };

// Free times by day, in the order they come.
export function groupSlots(slots: FreeSlot[]): { day: string; slots: FreeSlot[] }[] {
  const days: { day: string; slots: FreeSlot[] }[] = [];
  for (const slot of slots) {
    const last = days.at(-1);
    if (last?.day === slot.day) last.slots.push(slot);
    else days.push({ day: slot.day, slots: [slot] });
  }
  return days;
}
