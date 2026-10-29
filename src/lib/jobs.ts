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
export const MAX_DESCRIPTION_LENGTH = 2000;
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
  endTime: string;
  description: string;
};

export type JobFieldError =
  | "customerRequired"
  | "choiceInvalid"
  | "addressRequired"
  | "siteContactInvalid"
  | "dateInvalid"
  | "timeInvalid"
  | "endBeforeStart"
  | "descriptionTooLong";

export type JobFields = {
  customer_id: string;
  vehicle_id: string | null;
  driver_id: string | null;
  address: string;
  site_contact: string | null;
  starts_at: string;
  ends_at: string;
  description: string | null;
};

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
    endTime: text("endTime"),
    // Line breaks in the description are kept; only the ends are trimmed.
    description: String(formData.get("description") ?? "").trim(),
  };
  const fieldErrors: Partial<Record<keyof JobFormValues, JobFieldError>> = {};

  if (!uuid.test(values.customerId)) fieldErrors.customerId = "customerRequired";
  if (values.vehicleId && !uuid.test(values.vehicleId)) fieldErrors.vehicleId = "choiceInvalid";
  if (values.driverId && !uuid.test(values.driverId)) fieldErrors.driverId = "choiceInvalid";
  if (values.address.length < 1 || values.address.length > MAX_ADDRESS_LENGTH) fieldErrors.address = "addressRequired";
  if (values.siteContact.length > MAX_SITE_CONTACT_LENGTH) fieldErrors.siteContact = "siteContactInvalid";
  if (values.description.length > MAX_DESCRIPTION_LENGTH) fieldErrors.description = "descriptionTooLong";

  const validDate = fromLocalParts(values.date, "12:00", timeZone) !== undefined;
  if (!validDate) fieldErrors.date = "dateInvalid";
  const startsAt = validDate ? fromLocalParts(values.date, values.startTime, timeZone) : undefined;
  const endsAt = validDate ? fromLocalParts(values.date, values.endTime, timeZone) : undefined;
  if (validDate && !startsAt) fieldErrors.startTime = "timeInvalid";
  if (validDate && !endsAt) fieldErrors.endTime = "timeInvalid";
  if (startsAt && endsAt && endsAt <= startsAt) fieldErrors.endTime = "endBeforeStart";

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
      description: values.description || null,
    },
  };
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
  "id, number, customer_id, vehicle_id, driver_id, address, site_contact, starts_at, ends_at, description, status, hourly_rate, customer_rate, created_by, created_at";

// A stored job as form text, in the company's local time.
export function toJobFormValues(job: Job, timeZone: string): JobFormValues {
  const start = toLocalParts(new Date(job.starts_at), timeZone);
  const end = toLocalParts(new Date(job.ends_at), timeZone);
  return {
    customerId: job.customer_id,
    vehicleId: job.vehicle_id ?? "",
    driverId: job.driver_id ?? "",
    address: job.address,
    siteContact: job.site_contact ?? "",
    date: start.date,
    startTime: start.time,
    // A job that ends after midnight cannot be shown as one day; the form asks again.
    endTime: end.date === start.date ? end.time : "",
    description: job.description ?? "",
  };
}

// Whether two time spans share any time (one ending as the other starts does not count).
export function overlaps(a: { starts_at: string; ends_at: string }, b: { starts_at: string; ends_at: string }) {
  return Date.parse(a.starts_at) < Date.parse(b.ends_at) && Date.parse(b.starts_at) < Date.parse(a.ends_at);
}
