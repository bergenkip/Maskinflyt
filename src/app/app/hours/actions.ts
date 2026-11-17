"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizeEmail } from "@/lib/customers";
import { hoursEmail } from "@/lib/email/hours-email";
import { invoiceEmailLive, TEST_INBOX } from "@/lib/email/invoice-email";
import { emailConfigured, sendEmail } from "@/lib/email/resend";
import { MAX_SHEET_DAYS, parseHours, validateDay, type DayFieldError, type OvertimeMode } from "@/lib/hours";
import { getSheetPdf } from "@/lib/hours-server";
import { parsePeriod } from "@/lib/invoice-export";
import { getCurrentMembership } from "@/lib/membership";
import { getUserEmail } from "@/lib/mfa";
import { createClient } from "@/lib/supabase/server";

// The employee's hours sheet. The database decides who may do what and checks
// every value again; these actions check the form first and translate its answers.

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function done(sheet?: string) {
  revalidatePath("/app/hours");
  if (sheet) revalidatePath(`/app/hours/${sheet}`);
}

export type NewSheetState = { from?: string; to?: string; error?: "invalid" | "order" | "tooLong" | "overlap" | "unknown" };

export async function createSheet(_prev: NewSheetState, formData: FormData): Promise<NewSheetState> {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  const parsed = parsePeriod(from, to);
  if ("error" in parsed) return { from, to, error: parsed.error };
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 + 1 > MAX_SHEET_DAYS) return { from, to, error: "tooLong" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_hour_sheet", { org: membership.organization.id, period_from: from, period_to: to });
  if (error) {
    if (error.hint === "invalid_period") return { from, to, error: "tooLong" };
    if (error.hint === "overlap") return { from, to, error: "overlap" };
    return { from, to, error: "unknown" };
  }
  done();
  redirect(`/app/hours/${data as string}`);
}

export type DayState = {
  values?: Record<string, string>;
  errors?: DayFieldError[];
  error?: "locked" | "unknown";
  savedAt?: number;
};

const dayHints: Record<string, DayFieldError> = {
  invalid_day: "day",
  invalid_time: "ends",
  invalid_break: "break",
  invalid_note: "note",
};

export async function saveDay(_prev: DayState, formData: FormData): Promise<DayState> {
  if (!(await getCurrentMembership())) redirect("/app/onboarding");
  const sheet = String(formData.get("sheet") ?? "");
  const values = Object.fromEntries(["day", "starts", "ends", "break", "note"].map((key) => [key, String(formData.get(key) ?? "")]));
  if (!uuid.test(sheet)) return { values, error: "unknown" };
  const period = { from: String(formData.get("periodFrom") ?? ""), to: String(formData.get("periodTo") ?? "") };
  const checked = validateDay(formData, period);
  if ("errors" in checked) return { values, errors: checked.errors };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_hour_sheet_day", { sheet, ...checked.day });
  if (error) {
    const field = error.hint ? dayHints[error.hint] : undefined;
    if (field) return { values, errors: [field] };
    if (error.hint === "sheet_locked") return { values, error: "locked" };
    return { values, error: "unknown" };
  }
  done(sheet);
  // The next day is the one after; the times stay, as most days look alike.
  const next = new Date(`${checked.day.day}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextDay = next.toISOString().slice(0, 10);
  return {
    values: { ...values, day: nextDay <= period.to ? nextDay : checked.day.day, note: "" },
    savedAt: Date.now(),
  };
}

export async function removeDay(formData: FormData) {
  if (!(await getCurrentMembership())) redirect("/app/onboarding");
  const sheet = String(formData.get("sheet") ?? "");
  const day = String(formData.get("day") ?? "");
  if (!uuid.test(sheet) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
  const supabase = await createClient();
  await supabase.rpc("remove_hour_sheet_day", { sheet, day });
  done(sheet);
}

export async function deleteSheet(formData: FormData) {
  if (!(await getCurrentMembership())) redirect("/app/onboarding");
  const sheet = String(formData.get("sheet") ?? "");
  if (uuid.test(sheet)) {
    const supabase = await createClient();
    await supabase.rpc("delete_hour_sheet", { sheet });
  }
  done();
  redirect("/app/hours");
}

export type SubmitState = { error?: "empty" | "locked" | "unknown"; email?: "sent" | "failed" | "none"; at?: number };

// E-mail the confirmed sheet's PDF to the accountant and record how it went.
async function emailSheet(sheet: string, address: string | null): Promise<"sent" | "failed" | "none"> {
  const supabase = await createClient();
  const to = (address ? normalizeEmail(address) : null) ?? null;
  let status: "sent" | "failed" | "none" = "none";
  let providerId: string | null = null;
  if (to) {
    status = "failed";
    const testMode = !invoiceEmailLive();
    // In test mode (local development and CI) only .test addresses, and only to the test inbox.
    if (emailConfigured() && (!testMode || to.endsWith(".test"))) {
      try {
        const made = await getSheetPdf(sheet);
        if (made) {
          const email = hoursEmail(made.sheet, { to, replyTo: await getUserEmail(), testMode });
          const result = await sendEmail({
            ...email,
            to: testMode ? TEST_INBOX : to,
            attachments: [{ filename: made.filename, content: made.pdf }],
            idempotencyKey: `${sheet}-${Date.now()}`,
          });
          if (result.ok) {
            status = "sent";
            providerId = result.id;
          }
        }
      } catch {
        status = "failed";
      }
    }
  }
  await supabase.rpc("record_hour_sheet_email", { sheet, to_email: to, status, provider_id: providerId });
  return status;
}

export async function submitSheet(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  if (!(await getCurrentMembership())) redirect("/app/onboarding");
  const sheet = String(formData.get("sheet") ?? "");
  if (!uuid.test(sheet)) return { error: "unknown" };
  const supabase = await createClient();
  const { data: address, error } = await supabase.rpc("submit_hour_sheet", { sheet });
  if (error) {
    if (error.hint === "empty_sheet") return { error: "empty" };
    if (error.hint === "sheet_locked") return { error: "locked" };
    return { error: "unknown" };
  }
  const email = await emailSheet(sheet, (address as string | null) ?? null);
  done(sheet);
  return { email, at: Date.now() };
}

// Try the e-mail again (after a failure, or once an address is saved).
export async function resendSheet(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  const sheet = String(formData.get("sheet") ?? "");
  if (!uuid.test(sheet)) return { error: "unknown" };
  const supabase = await createClient();
  const { data } = await supabase.from("hour_settings").select("accountant_email").eq("organization_id", membership.organization.id).maybeSingle();
  const email = await emailSheet(sheet, data?.accountant_email ?? null);
  done(sheet);
  return { email, at: Date.now() };
}

export type HourSettingsValues = {
  mode: OvertimeMode;
  after: string;
  percent: string;
  after2: string;
  percent2: string;
  from: string;
  to: string;
  from2: string;
  to2: string;
  email: string;
};
export type HourSettingsField = Exclude<keyof HourSettingsValues, "mode">;
export type HourSettingsState = {
  values?: HourSettingsValues;
  errors?: HourSettingsField[];
  error?: "notAllowed" | "unknown";
  savedAt?: number;
};

const clockTime = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveHourSettings(_prev: HourSettingsState, formData: FormData): Promise<HourSettingsState> {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  const text = (name: string) => String(formData.get(name) ?? "").trim();
  const values: HourSettingsValues = {
    mode: text("mode") === "clock" ? "clock" : "daily",
    after: text("after"),
    percent: text("percent"),
    after2: text("after2"),
    percent2: text("percent2"),
    from: text("from").slice(0, 5),
    to: text("to").slice(0, 5),
    from2: text("from2").slice(0, 5),
    to2: text("to2").slice(0, 5),
    email: text("email"),
  };
  const clock = values.mode === "clock";
  const percentOf = (value: string) => (/^\d{1,3}$/.test(value) && Number(value) >= 1 && Number(value) <= 300 ? Number(value) : null);
  const percent = percentOf(values.percent);
  const after = clock ? null : parseHours(values.after);
  const second = clock ? values.from2 !== "" || values.to2 !== "" || values.percent2 !== "" : values.after2 !== "" || values.percent2 !== "";
  const after2 = second && !clock ? parseHours(values.after2) : null;
  const percent2 = second ? percentOf(values.percent2) : null;
  const email = values.email ? normalizeEmail(values.email) : null;

  const errors: HourSettingsField[] = [];
  if (percent === null) errors.push("percent");
  if (clock) {
    if (!clockTime.test(values.from)) errors.push("from");
    if (!clockTime.test(values.to) || values.to === values.from) errors.push("to");
    if (second) {
      if (!clockTime.test(values.from2)) errors.push("from2");
      if (!clockTime.test(values.to2) || values.to2 === values.from2) errors.push("to2");
    }
  } else {
    if (after === null) errors.push("after");
    if (second && (after2 === null || (after !== null && after2 <= after))) errors.push("after2");
  }
  if (second && (percent2 === null || (percent !== null && percent2 <= percent))) errors.push("percent2");
  if (values.email && !email) errors.push("email");
  if (errors.length) return { values, errors };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_hour_settings", {
    org: membership.organization.id,
    overtime_mode: values.mode,
    overtime_percent: percent,
    overtime_after: after,
    overtime2_after: after2,
    overtime2_percent: percent2,
    overtime_from: clock ? values.from : null,
    overtime_to: clock ? values.to : null,
    overtime2_from: clock && second ? values.from2 : null,
    overtime2_to: clock && second ? values.to2 : null,
    accountant_email: email,
  });
  if (error) {
    if (error.hint === "invalid_email") return { values, errors: ["email"] };
    if (error.hint === "invalid_overtime2") return { values, errors: ["after2", "percent2"] };
    if (error.hint === "invalid_overtime") return { values, errors: clock ? ["percent"] : ["after", "percent"] };
    if (error.hint === "invalid_window") return { values, errors: ["from", "to"] };
    if (error.hint === "invalid_window2") return { values, errors: ["from2", "to2", "percent2"] };
    if (error.code === "42501") return { values, error: "notAllowed" };
    return { values, error: "unknown" };
  }
  revalidatePath("/app/hours", "layout");
  return { values, savedAt: Date.now() };
}
