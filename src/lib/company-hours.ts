// Opening hours and free times (stage 15c), shared by the settings form, the
// public request form and their tests. public.save_company_hours and
// public.company_free_slots check and decide again in the database.

export const weekdays = [1, 2, 3, 4, 5, 6, 7] as const; // ISO: Monday 1 … Sunday 7
export type Weekday = (typeof weekdays)[number];

export const bookingLengths = [60, 120, 240, 480] as const;
export type BookingLength = (typeof bookingLengths)[number];

export const DEFAULT_OPENS = "07:00";
export const DEFAULT_CLOSES = "15:00";
export const MAX_DAY_OFF_NOTE_LENGTH = 100;

export type DayHours = { weekday: Weekday; open: boolean; opens: string; closes: string };
export type HoursValues = { freeTimes: boolean; bookingMinutes: string; week: DayHours[] };
export type HoursFieldError = "timesInvalid" | "noOpenDay" | "lengthInvalid";

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

// The settings form: on or off, the booking length, and opens/closes for each open day.
export function validateHours(formData: FormData): {
  values: HoursValues;
  dayErrors: Partial<Record<Weekday, HoursFieldError>>;
  fieldErrors: Partial<Record<"freeTimes" | "bookingMinutes", HoursFieldError>>;
  fields?: { show_free_times: boolean; booking_minutes: BookingLength; week: { weekday: Weekday; opens: string; closes: string }[] };
} {
  const values: HoursValues = {
    freeTimes: formData.get("freeTimes") === "on",
    bookingMinutes: String(formData.get("bookingMinutes") ?? ""),
    week: weekdays.map((weekday) => ({
      weekday,
      open: formData.get(`open-${weekday}`) === "on",
      opens: String(formData.get(`opens-${weekday}`) ?? "").trim(),
      closes: String(formData.get(`closes-${weekday}`) ?? "").trim(),
    })),
  };
  const dayErrors: Partial<Record<Weekday, HoursFieldError>> = {};
  const fieldErrors: Partial<Record<"freeTimes" | "bookingMinutes", HoursFieldError>> = {};

  const length = Number(values.bookingMinutes);
  if (!(bookingLengths as readonly number[]).includes(length)) fieldErrors.bookingMinutes = "lengthInvalid";
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
      week: open.map(({ weekday, opens, closes }) => ({ weekday, opens, closes })),
    },
  };
}

export type FreeSlot = { day: string; start_time: string; starts_at: string };

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
