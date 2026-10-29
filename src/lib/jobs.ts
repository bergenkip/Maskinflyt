// Job form rules and the company's local time, shared by the server actions,
// the pages and their tests. The database checks the same limits again (see
// the jobs migration).

export const jobStatuses = ["new", "planned", "done", "cancelled"] as const;
export type JobStatus = (typeof jobStatuses)[number];

export function isJobStatus(value: unknown): value is JobStatus {
  return typeof value === "string" && (jobStatuses as readonly string[]).includes(value);
}

const MAX_ADDRESS_LENGTH = 200;
const MAX_SITE_CONTACT_LENGTH = 100;
const MAX_TIME_NOTE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 2000;
// The longest expected duration, as the database allows (24 hours).
export const MAX_DURATION_HOURS = 24;
// The quarter hours offered for the expected duration.
export const durationMinuteSteps = ["0", "15", "30", "45"] as const;
// Chosen in the customer list when the customer is new and added with the job.
export const NEW_CUSTOMER = "new";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Local time ---------------------------------------------------------------

// The wall-clock date and time ("2026-11-02", "07:30") of an instant in a time zone.
export function toLocalParts(instant: Date, timeZone: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

// The instant a wall-clock date and time ("2026-11-02", "07:30") means in a time
// zone, or undefined when that time does not exist (the hour skipped in spring).
export function fromLocalParts(date: string, time: string, timeZone: string): Date | undefined {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return undefined;
  const [year, month, day, hour, minute] = [d[1], d[2], d[3], t[1], t[2]].map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return undefined;
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  if (new Date(wall).getUTCDate() !== day) return undefined; // 31 February and the like

  // The zone's offset at a guess, then once more in case the guess crossed a change.
  const offset = (at: number) => {
    const local = toLocalParts(new Date(at), timeZone);
    const [y, mo, da] = local.date.split("-").map(Number);
    const [h, mi] = local.time.split(":").map(Number);
    return Date.UTC(y, mo - 1, da, h, mi) - at;
  };
  let instant = wall - offset(wall);
  instant = wall - offset(instant);
  const check = toLocalParts(new Date(instant), timeZone);
  return check.date === date && check.time === time ? new Date(instant) : undefined;
}

// The form ---------------------------------------------------------------------

export type JobFormValues = {
  customerId: string;
  vehicleId: string;
  driverId: string;
  address: string;
  siteContact: string;
  date: string;
  startTime: string;
  durationHours: string;
  durationMinutes: string;
  timeNote: string;
  description: string;
};

export type JobFieldError =
  | "customerRequired"
  | "choiceInvalid"
  | "addressRequired"
  | "siteContactInvalid"
  | "dateInvalid"
  | "timeInvalid"
  | "durationInvalid"
  | "timeNoteTooLong"
  | "descriptionTooLong";

export type JobFields = {
  customer_id: string;
  vehicle_id: string | null;
  driver_id: string | null;
  address: string;
  site_contact: string | null;
  starts_at: string;
  ends_at: string;
  time_note: string | null;
  description: string | null;
};

// The customer may be NEW_CUSTOMER; the action then adds the customer first
// and puts its id in customer_id.
export function validateJob(
  formData: FormData,
  timeZone: string,
): { values: JobFormValues; fieldErrors?: Partial<Record<keyof JobFormValues, JobFieldError>>; fields?: JobFields } {
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const values: JobFormValues = {
    customerId: text("customerId"),
    vehicleId: text("vehicleId"),
    driverId: text("driverId"),
    address: text("address").replace(/\s+/g, " "),
    siteContact: text("siteContact").replace(/\s+/g, " "),
    date: text("date"),
    startTime: text("startTime"),
    durationHours: text("durationHours"),
    durationMinutes: text("durationMinutes"),
    timeNote: text("timeNote").replace(/\s+/g, " "),
    // Line breaks in the description are kept; only the ends are trimmed.
    description: String(formData.get("description") ?? "").trim(),
  };
  const fieldErrors: Partial<Record<keyof JobFormValues, JobFieldError>> = {};

  if (!uuid.test(values.customerId) && values.customerId !== NEW_CUSTOMER) fieldErrors.customerId = "customerRequired";
  if (values.vehicleId && !uuid.test(values.vehicleId)) fieldErrors.vehicleId = "choiceInvalid";
  if (values.driverId && !uuid.test(values.driverId)) fieldErrors.driverId = "choiceInvalid";
  if (values.address.length < 1 || values.address.length > MAX_ADDRESS_LENGTH) fieldErrors.address = "addressRequired";
  if (values.siteContact.length > MAX_SITE_CONTACT_LENGTH) fieldErrors.siteContact = "siteContactInvalid";
  if (values.timeNote.length > MAX_TIME_NOTE_LENGTH) fieldErrors.timeNote = "timeNoteTooLong";
  if (values.description.length > MAX_DESCRIPTION_LENGTH) fieldErrors.description = "descriptionTooLong";

  const validDate = fromLocalParts(values.date, "12:00", timeZone) !== undefined;
  if (!validDate) fieldErrors.date = "dateInvalid";
  const startsAt = validDate ? fromLocalParts(values.date, values.startTime, timeZone) : undefined;
  if (validDate && !startsAt) fieldErrors.startTime = "timeInvalid";
  const minutes = durationToMinutes(values.durationHours, values.durationMinutes);
  if (minutes === undefined) fieldErrors.durationHours = "durationInvalid";
  // Counted in real time, so a job over the night the clocks change lasts as long as it says.
  const endsAt = startsAt && minutes !== undefined ? new Date(startsAt.getTime() + minutes * 60_000) : undefined;

  if (Object.keys(fieldErrors).length > 0 || !startsAt || !endsAt) return { values, fieldErrors };
  return {
    values,
    fields: {
      customer_id: values.customerId,
      vehicle_id: values.vehicleId || null,
      driver_id: values.driverId || null,
      address: values.address,
      site_contact: values.siteContact || null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      time_note: values.timeNote || null,
      description: values.description || null,
    },
  };
}

// The expected duration in minutes from the form's whole hours and minutes, or
// undefined when it is not between a quarter hour and 24 hours.
export function durationToMinutes(hours: string, minutes: string): number | undefined {
  const h = hours === "" ? "0" : hours;
  const m = minutes === "" ? "0" : minutes;
  if (!/^\d{1,2}$/.test(h) || !/^\d{1,2}$/.test(m) || Number(m) > 59) return undefined;
  const total = Number(h) * 60 + Number(m);
  return total >= 15 && total <= MAX_DURATION_HOURS * 60 ? total : undefined;
}

// A row as the pages read it.
export type Job = JobFields & {
  id: string;
  number: number;
  status: JobStatus;
  hourly_rate: number | null;
  customer_rate: boolean;
  created_by: string | null;
  created_at: string;
};
export const jobColumns =
  "id, number, customer_id, vehicle_id, driver_id, address, site_contact, starts_at, ends_at, time_note, description, status, hourly_rate, customer_rate, created_by, created_at";

// A stored job as form text, in the company's local time.
export function toJobFormValues(job: Job, timeZone: string): JobFormValues {
  const start = toLocalParts(new Date(job.starts_at), timeZone);
  const minutes = Math.round((Date.parse(job.ends_at) - Date.parse(job.starts_at)) / 60_000);
  return {
    customerId: job.customer_id,
    vehicleId: job.vehicle_id ?? "",
    driverId: job.driver_id ?? "",
    address: job.address,
    siteContact: job.site_contact ?? "",
    date: start.date,
    startTime: start.time,
    durationHours: String(Math.floor(minutes / 60)),
    durationMinutes: String(minutes % 60),
    timeNote: job.time_note ?? "",
    description: job.description ?? "",
  };
}

// Whether two time spans share any time (one ending as the other starts does not count).
export function overlaps(a: { starts_at: string; ends_at: string }, b: { starts_at: string; ends_at: string }) {
  return Date.parse(a.starts_at) < Date.parse(b.ends_at) && Date.parse(b.starts_at) < Date.parse(a.ends_at);
}
