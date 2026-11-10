// The company's details on its own invoices (stage 12a). The form checks them
// here first; public.save_invoice_settings checks the same rules again.
import { normalizeEmail, normalizePhone } from "./customers";
import { isValidOrgNumber, normalizeOrgNumber } from "./org-number";

const ACCOUNT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

// "1234 56 78903" and "1234.56.78903" are the same kontonummer: stored as 11 digits.
export function normalizeBankAccount(value: string): string {
  return value.replace(/[\s.]/g, "");
}

// Norwegian kontonummer: 11 digits, the last one a MOD11 check digit.
export function isValidBankAccount(value: string): boolean {
  const digits = normalizeBankAccount(value);
  if (!/^\d{11}$/.test(digits)) return false;
  const remainder = ACCOUNT_WEIGHTS.reduce((sum, weight, i) => sum + Number(digits[i]) * weight, 0) % 11;
  if (remainder === 1) return false;
  return (remainder === 0 ? 0 : 11 - remainder) === Number(digits[10]);
}

// "12345678903" → "1234 56 78903", as banks print it.
export function formatBankAccount(value: string): string {
  return value.replace(/^(\d{4})(\d{2})(\d{5})$/, "$1 $2 $3");
}

export const MAX_PAYMENT_DAYS = 90;

export type InvoiceSettings = {
  street: string;
  postal_code: string;
  city: string;
  vat_registered: boolean;
  in_business_register: boolean;
  bank_account: string;
  payment_days: number;
  email: string | null;
  phone: string | null;
  first_number: number;
};

export const invoiceSettingsColumns =
  "street, postal_code, city, vat_registered, in_business_register, bank_account, payment_days, email, phone, first_number";

export type InvoiceSettingsValues = {
  orgNumber: string;
  street: string;
  postalCode: string;
  city: string;
  vatRegistered: boolean;
  inBusinessRegister: boolean;
  bankAccount: string;
  paymentDays: string;
  email: string;
  phone: string;
  firstNumber: string;
};

export type InvoiceSettingsFieldError =
  | "orgNumberInvalid"
  | "orgNumberTaken"
  | "streetInvalid"
  | "postalCodeInvalid"
  | "cityInvalid"
  | "bankAccountInvalid"
  | "paymentDaysInvalid"
  | "emailInvalid"
  | "phoneInvalid"
  | "firstNumberInvalid";

export type InvoiceSettingsFields = {
  org_number: string;
  street: string;
  postal_code: string;
  city: string;
  vat_registered: boolean;
  in_business_register: boolean;
  bank_account: string;
  payment_days: number;
  email: string | null;
  phone: string | null;
  first_number: number;
};

// A whole number in a range, written without signs or decimals.
function wholeNumber(value: string, min: number, max: number): number | undefined {
  if (!/^\d{1,9}$/.test(value)) return undefined;
  const number = Number(value);
  return number >= min && number <= max ? number : undefined;
}

export function validateInvoiceSettings(
  formData: FormData,
  country: string,
): {
  values: InvoiceSettingsValues;
  fieldErrors?: Partial<Record<keyof InvoiceSettingsValues, InvoiceSettingsFieldError>>;
  fields?: InvoiceSettingsFields;
} {
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const line = (key: string) => text(key).replace(/\s+/g, " ");
  const values: InvoiceSettingsValues = {
    orgNumber: text("orgNumber"),
    street: line("street"),
    postalCode: text("postalCode").toUpperCase(),
    city: line("city"),
    vatRegistered: formData.get("vatRegistered") === "on",
    inBusinessRegister: formData.get("inBusinessRegister") === "on",
    bankAccount: text("bankAccount"),
    paymentDays: text("paymentDays"),
    email: text("email"),
    phone: text("phone"),
    firstNumber: text("firstNumber"),
  };

  const fieldErrors: Partial<Record<keyof InvoiceSettingsValues, InvoiceSettingsFieldError>> = {};
  const orgNumber = normalizeOrgNumber(values.orgNumber);
  if (!orgNumber || !isValidOrgNumber(orgNumber, country)) fieldErrors.orgNumber = "orgNumberInvalid";
  if (values.street.length < 1 || values.street.length > 200) fieldErrors.street = "streetInvalid";
  const postalOk = country === "NO" ? /^\d{4}$/.test(values.postalCode) : /^[A-Z0-9 -]{2,10}$/.test(values.postalCode);
  if (!postalOk) fieldErrors.postalCode = "postalCodeInvalid";
  if (values.city.length < 1 || values.city.length > 100) fieldErrors.city = "cityInvalid";
  if (!isValidBankAccount(values.bankAccount)) fieldErrors.bankAccount = "bankAccountInvalid";
  const paymentDays = wholeNumber(values.paymentDays, 0, MAX_PAYMENT_DAYS);
  if (paymentDays === undefined) fieldErrors.paymentDays = "paymentDaysInvalid";
  const email = normalizeEmail(values.email);
  if (email === undefined) fieldErrors.email = "emailInvalid";
  const phone = normalizePhone(values.phone);
  if (phone === undefined) fieldErrors.phone = "phoneInvalid";
  const firstNumber = wholeNumber(values.firstNumber, 1, 999_999_999);
  if (firstNumber === undefined) fieldErrors.firstNumber = "firstNumberInvalid";

  if (Object.keys(fieldErrors).length > 0) return { values, fieldErrors };
  return {
    values,
    fields: {
      org_number: orgNumber,
      street: values.street,
      postal_code: values.postalCode,
      city: values.city,
      vat_registered: values.vatRegistered,
      in_business_register: values.inBusinessRegister,
      bank_account: normalizeBankAccount(values.bankAccount),
      payment_days: paymentDays!,
      email: email ?? null,
      phone: phone ?? null,
      first_number: firstNumber!,
    },
  };
}

// Who changes them: owners and admins (with the second step, which the app layout already asks of them).
export function canEditInvoiceSettings(role: string): boolean {
  return role === "owner" || role === "admin";
}
