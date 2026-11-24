// Stage 16a: a customer's own account (no company). Form rules shared by the
// server action and its tests; save_customer_account checks the same again.
import { normalizePhone } from "./customers";

export const CUSTOMER_PATH = "/kunde";
export const MAX_ACCOUNT_PLACE_LENGTH = 200;

export type CustomerAccountValues = { phone: string; place: string };
export type CustomerAccountFieldError = "phoneInvalid" | "placeTooLong";

export function validateCustomerAccount(formData: FormData): {
  values: CustomerAccountValues;
  fieldErrors: Partial<Record<keyof CustomerAccountValues, CustomerAccountFieldError>>;
  fields?: { account_phone: string | null; account_place: string | null };
} {
  const values = {
    phone: String(formData.get("phone") ?? "").trim(),
    place: String(formData.get("place") ?? "").trim().replace(/\s+/g, " "),
  };
  const fieldErrors: Partial<Record<keyof CustomerAccountValues, CustomerAccountFieldError>> = {};
  const phone = normalizePhone(values.phone);
  if (phone === undefined) fieldErrors.phone = "phoneInvalid";
  if (values.place.length > MAX_ACCOUNT_PLACE_LENGTH) fieldErrors.place = "placeTooLong";
  if (Object.keys(fieldErrors).length > 0) return { values, fieldErrors };
  return { values, fieldErrors, fields: { account_phone: phone ?? null, account_place: values.place || null } };
}

// The address a request is sent again from: the company page, filled in from that request.
export const repeatPath = (slug: string, requestId: string) => `/firma/${slug}?${new URLSearchParams({ gjenta: requestId })}#request`;
