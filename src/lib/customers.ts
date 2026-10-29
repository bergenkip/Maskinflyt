// Customer form rules, shared by the server actions and their tests. The
// database checks the same limits again (see the customers migration).
import { formatOrgNumber, isValidOrgNumber, normalizeOrgNumber } from "./org-number";

export const customerKinds = ["company", "private"] as const;
export type CustomerKind = (typeof customerKinds)[number];

export function isCustomerKind(value: unknown): value is CustomerKind {
  return typeof value === "string" && (customerKinds as readonly string[]).includes(value);
}

export const MAX_CUSTOMER_NAME_LENGTH = 120;
const MAX_CONTACT_LENGTH = 100;
const MAX_STREET_LENGTH = 200;
const MAX_CITY_LENGTH = 100;
export const MAX_NOTE_LENGTH = 1000;
const MAX_EMAIL_LENGTH = 254;

// "+47 912 34 567", "0047 91234567" and "(+47) 912-34-567" are the same number:
// stored as "+4791234567". A Norwegian number without a country code stays "91234567".
export function normalizePhone(input: string): string | null | undefined {
  let value = input.replace(/[\s  ().-]/g, "");
  if (value === "") return null;
  if (value.startsWith("00")) value = `+${value.slice(2)}`;
  return /^\+?[0-9]{5,15}$/.test(value) ? value : undefined;
}

// Norwegian numbers in the usual groups ("912 34 567", "+47 912 34 567"); others as stored.
export function formatPhone(stored: string) {
  const match = /^(\+47)?(\d{3})(\d{2})(\d{3})$/.exec(stored);
  if (!match) return stored;
  return `${match[1] ? "+47 " : ""}${match[2]} ${match[3]} ${match[4]}`;
}

// A simple shape check; the address is really proven only when mail arrives.
export function normalizeEmail(input: string): string | null | undefined {
  const value = input.trim().toLowerCase();
  if (value === "") return null;
  return value.length <= MAX_EMAIL_LENGTH && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? value : undefined;
}

// Norwegian postal codes have four digits ("0155").
export function normalizePostalCode(input: string): string | null | undefined {
  const value = input.replace(/\s/g, "");
  if (value === "") return null;
  return /^\d{4}$/.test(value) ? value : undefined;
}

// Optional free text: empty is null, too long is invalid.
function optionalText(value: string, max: number): string | null | undefined {
  if (value === "") return null;
  return value.length <= max ? value : undefined;
}

export type CustomerFieldError =
  | "kindInvalid"
  | "nameRequired"
  | "orgNumberInvalid"
  | "contactInvalid"
  | "phoneInvalid"
  | "emailInvalid"
  | "streetInvalid"
  | "postalCodeInvalid"
  | "cityInvalid"
  | "noteInvalid";

export type CustomerFormValues = {
  kind: string;
  name: string;
  orgNumber: string;
  contactName: string;
  phone: string;
  email: string;
  invoiceEmail: string;
  street: string;
  postalCode: string;
  city: string;
  note: string;
};

export type CustomerFields = {
  kind: CustomerKind;
  name: string;
  org_number: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  invoice_email: string | null;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  note: string | null;
};

// A row as the pages read it.
export type Customer = CustomerFields & { id: string; active: boolean };
export const customerColumns =
  "id, kind, name, org_number, contact_name, phone, email, invoice_email, street, postal_code, city, note, active";

export function validateCustomer(formData: FormData): {
  values: CustomerFormValues;
  fieldErrors?: Partial<Record<keyof CustomerFormValues, CustomerFieldError>>;
  fields?: CustomerFields;
} {
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  // One line: runs of spaces (and pasted line breaks) become one space.
  const line = (key: string) => text(key).replace(/\s+/g, " ");
  const values: CustomerFormValues = {
    kind: text("kind"),
    name: line("name"),
    orgNumber: text("orgNumber"),
    contactName: line("contactName"),
    phone: text("phone"),
    email: text("email"),
    invoiceEmail: text("invoiceEmail"),
    street: line("street"),
    postalCode: text("postalCode"),
    city: line("city"),
    // The note keeps its line breaks; Windows ones become plain ones.
    note: text("note").replace(/\r\n?/g, "\n"),
  };

  const kind = isCustomerKind(values.kind) ? values.kind : undefined;
  // The organization number field is shown for companies only; anything left in it is ignored.
  const orgNumberInput = kind === "company" ? normalizeOrgNumber(values.orgNumber) : "";
  const orgNumber = orgNumberInput === "" ? null : isValidOrgNumber(orgNumberInput) ? orgNumberInput : undefined;
  const contactName = optionalText(values.contactName, MAX_CONTACT_LENGTH);
  const phone = normalizePhone(values.phone);
  const email = normalizeEmail(values.email);
  const invoiceEmail = normalizeEmail(values.invoiceEmail);
  const street = optionalText(values.street, MAX_STREET_LENGTH);
  const postalCode = normalizePostalCode(values.postalCode);
  const city = optionalText(values.city, MAX_CITY_LENGTH);
  const note = optionalText(values.note, MAX_NOTE_LENGTH);

  const fieldErrors: Partial<Record<keyof CustomerFormValues, CustomerFieldError>> = {};
  if (!kind) fieldErrors.kind = "kindInvalid";
  if (values.name.length === 0 || values.name.length > MAX_CUSTOMER_NAME_LENGTH) fieldErrors.name = "nameRequired";
  if (orgNumber === undefined) fieldErrors.orgNumber = "orgNumberInvalid";
  if (contactName === undefined) fieldErrors.contactName = "contactInvalid";
  if (phone === undefined) fieldErrors.phone = "phoneInvalid";
  if (email === undefined) fieldErrors.email = "emailInvalid";
  if (invoiceEmail === undefined) fieldErrors.invoiceEmail = "emailInvalid";
  if (street === undefined) fieldErrors.street = "streetInvalid";
  if (postalCode === undefined) fieldErrors.postalCode = "postalCodeInvalid";
  if (city === undefined) fieldErrors.city = "cityInvalid";
  if (note === undefined) fieldErrors.note = "noteInvalid";

  if (
    !kind ||
    Object.keys(fieldErrors).length > 0 ||
    orgNumber === undefined ||
    contactName === undefined ||
    phone === undefined ||
    email === undefined ||
    invoiceEmail === undefined ||
    street === undefined ||
    postalCode === undefined ||
    city === undefined ||
    note === undefined
  ) {
    return { values, fieldErrors };
  }

  return {
    values,
    fields: {
      kind,
      name: values.name,
      org_number: orgNumber,
      contact_name: contactName,
      phone,
      email,
      invoice_email: invoiceEmail,
      street,
      postal_code: postalCode,
      city,
      note,
    },
  };
}

// A stored customer as editable text for the form.
export function toCustomerFormValues(customer: CustomerFields): CustomerFormValues {
  return {
    kind: customer.kind,
    name: customer.name,
    orgNumber: customer.org_number ? formatOrgNumber(customer.org_number) : "",
    contactName: customer.contact_name ?? "",
    phone: customer.phone ? formatPhone(customer.phone) : "",
    email: customer.email ?? "",
    invoiceEmail: customer.invoice_email ?? "",
    street: customer.street ?? "",
    postalCode: customer.postal_code ?? "",
    city: customer.city ?? "",
    note: customer.note ?? "",
  };
}

// The search box: what people type, as a safe ILIKE pattern on the search column.
// %, _ and \ are matched literally; an empty or blank query means no filter.
export function searchPattern(query: string): string | null {
  let value = query.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 100);
  // Numbers are stored without spaces: "912 34 567" and "123 456 785" find them.
  if (/^[\d\s+().-]+$/.test(value)) value = value.replace(/[\s().-]/g, "");
  if (value === "") return null;
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
