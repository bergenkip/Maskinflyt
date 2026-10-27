export type AuthErrorKey =
  | "emailInvalid"
  | "passwordShort"
  | "firstNameRequired"
  | "lastNameRequired"
  | "invalidCredentials"
  | "emailNotConfirmed"
  | "userExists"
  | "weakPassword"
  | "rateLimited"
  | "linkInvalid"
  | "unknown";

export type AuthFormValues = { email: string; firstName?: string; lastName?: string };

export type AuthFormState = {
  values?: AuthFormValues;
  fieldErrors?: { email?: AuthErrorKey; password?: AuthErrorKey; firstName?: AuthErrorKey; lastName?: AuthErrorKey };
  error?: AuthErrorKey;
  checkEmail?: boolean;
};

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_NAME_LENGTH = 100;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Trims and joins inner whitespace, so "  Ola   Nordmann " is stored as "Ola Nordmann".
export function cleanName(value: FormDataEntryValue | null) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function isValidName(value: string) {
  return value.length > 0 && value.length <= MAX_NAME_LENGTH;
}

export function validateCredentials(formData: FormData, mode: "signIn" | "signUp") {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const firstName = cleanName(formData.get("firstName"));
  const lastName = cleanName(formData.get("lastName"));
  const fieldErrors: NonNullable<AuthFormState["fieldErrors"]> = {};

  // Everyone who creates an account gives their name; colleagues see it in the team list.
  if (mode === "signUp") {
    if (!isValidName(firstName)) fieldErrors.firstName = "firstNameRequired";
    if (!isValidName(lastName)) fieldErrors.lastName = "lastNameRequired";
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 254) fieldErrors.email = "emailInvalid";
  // Sign-in only checks presence, so older shorter passwords are not locked out.
  if (mode === "signUp" ? password.length < MIN_PASSWORD_LENGTH : password.length === 0) {
    fieldErrors.password = "passwordShort";
  }

  return {
    values: mode === "signUp" ? { email, password, firstName, lastName } : { email, password },
    fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
  };
}

// Where to go after signing in: only paths on this site, never another host.
export function safeNextPath(value: FormDataEntryValue | string | null | undefined, fallback = "/app") {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}

// Invitation tokens are 64 lower-case hex characters (see the invitations migration).
export function isInviteToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}
