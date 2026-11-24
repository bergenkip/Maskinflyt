// Rules for a request sent from a company's public page (stage 15b), shared by
// the server action and its tests. public.submit_job_request checks the same
// limits again; the database is what decides.
import { addDays } from "./calendar";
import { isService, type Service } from "./company-page";
import { normalizeEmail, normalizePhone } from "./customers";

export const MAX_REQUEST_NAME_LENGTH = 100;
export const MAX_REQUEST_PLACE_LENGTH = 200;
export const MAX_REQUEST_DESCRIPTION_LENGTH = 2000;
// How far ahead a customer may ask for a day.
export const MAX_REQUEST_DAYS_AHEAD = 730;

export const jobRequestStatuses = ["new", "accepted", "declined"] as const;
export type JobRequestStatus = (typeof jobRequestStatuses)[number];

export type JobRequestFieldError =
  | "nameRequired"
  | "nameTooLong"
  | "phoneInvalid"
  | "emailInvalid"
  | "contactRequired"
  | "placeRequired"
  | "placeTooLong"
  | "descriptionRequired"
  | "descriptionTooLong"
  | "dateInvalid"
  | "serviceInvalid";

export type JobRequestValues = {
  name: string;
  phone: string;
  email: string;
  place: string;
  wantedDate: string;
  service: string;
  description: string;
};

export type JobRequestFields = {
  request_name: string;
  request_phone: string | null;
  request_email: string | null;
  request_place: string;
  request_description: string;
  request_wanted_date: string | null;
  request_service: Service | null;
};

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");
const oneLine = (value: string) => value.trim().replace(/\s+/g, " ");

// `today` is the company's local date (YYYY-MM-DD): a day before it cannot be asked for.
export function validateJobRequest(
  formData: FormData,
  today: string,
): {
  values: JobRequestValues;
  fieldErrors: Partial<Record<keyof JobRequestValues, JobRequestFieldError>>;
  fields?: JobRequestFields;
} {
  const values: JobRequestValues = {
    name: oneLine(text(formData, "name")),
    phone: text(formData, "phone").trim(),
    email: text(formData, "email").trim(),
    place: oneLine(text(formData, "place")),
    wantedDate: text(formData, "wantedDate").trim(),
    service: text(formData, "service").trim(),
    description: text(formData, "description").replace(/\r\n?/g, "\n").trim(),
  };
  const fieldErrors: Partial<Record<keyof JobRequestValues, JobRequestFieldError>> = {};

  if (!values.name) fieldErrors.name = "nameRequired";
  else if (values.name.length > MAX_REQUEST_NAME_LENGTH) fieldErrors.name = "nameTooLong";

  const phone = normalizePhone(values.phone);
  if (phone === undefined) fieldErrors.phone = "phoneInvalid";
  const email = normalizeEmail(values.email);
  if (email === undefined) fieldErrors.email = "emailInvalid";
  if (!phone && !email && !fieldErrors.phone && !fieldErrors.email) fieldErrors.phone = "contactRequired";

  if (!values.place) fieldErrors.place = "placeRequired";
  else if (values.place.length > MAX_REQUEST_PLACE_LENGTH) fieldErrors.place = "placeTooLong";

  if (!values.description) fieldErrors.description = "descriptionRequired";
  else if (values.description.length > MAX_REQUEST_DESCRIPTION_LENGTH) fieldErrors.description = "descriptionTooLong";

  // A real day (not 30 February), from today up to two years ahead; ISO dates compare as text.
  if (
    values.wantedDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(values.wantedDate) ||
      addDays(values.wantedDate, 0) !== values.wantedDate ||
      values.wantedDate < today ||
      values.wantedDate > addDays(today, MAX_REQUEST_DAYS_AHEAD))
  ) {
    fieldErrors.wantedDate = "dateInvalid";
  }

  if (values.service && !isService(values.service)) fieldErrors.service = "serviceInvalid";

  if (Object.keys(fieldErrors).length > 0) return { values, fieldErrors };
  return {
    values,
    fieldErrors,
    fields: {
      request_name: values.name,
      request_phone: phone ?? null,
      request_email: email ?? null,
      request_place: values.place,
      request_description: values.description,
      request_wanted_date: values.wantedDate || null,
      request_service: isService(values.service) ? values.service : null,
    },
  };
}
