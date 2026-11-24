"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MAX_DAY_OFF_NOTE_LENGTH, validateHours, type HoursFieldError, type HoursValues, type Weekday } from "@/lib/company-hours";
import { getCurrentMembership } from "@/lib/membership";
import { createClient } from "@/lib/supabase/server";

// public.save_company_hours and the day-off functions decide who may change
// them (owners and admins with the second step) and check everything again.

export type HoursState = {
  values?: HoursValues;
  dayErrors?: Partial<Record<Weekday, HoursFieldError>>;
  fieldErrors?: Partial<Record<"freeTimes" | "bookingMinutes", HoursFieldError>>;
  error?: "noPage" | "notAllowed" | "readOnly" | "unknown";
  savedAt?: number;
};

export type DayOffState = { error?: "dateInvalid" | "noteTooLong" | "noPage" | "unknown"; savedAt?: number };

const date = /^\d{4}-\d{2}-\d{2}$/;

function failure(error: { hint?: string; code?: string }): "noPage" | "notAllowed" | "readOnly" | "unknown" {
  if (error.hint === "mfa_required") redirect("/mfa");
  if (error.hint === "no_page") return "noPage";
  if (error.hint === "read_only") return "readOnly";
  if (error.code === "42501") return "notAllowed";
  return "unknown";
}

function done() {
  revalidatePath("/app/public-page");
  revalidatePath("/app");
}

export async function saveCompanyHours(_prev: HoursState, formData: FormData): Promise<HoursState> {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  const { values, dayErrors, fieldErrors, fields } = validateHours(formData);
  if (!fields) return { values, dayErrors, fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_company_hours", {
    org: membership.organization.id,
    show_free_times: fields.show_free_times,
    booking_minutes: fields.booking_minutes,
    week: fields.week,
  });
  if (error) {
    if (error.hint === "no_hours") return { values, fieldErrors: { freeTimes: "noOpenDay" } };
    if (error.hint === "invalid_hours") return { values, error: "unknown" };
    return { values, error: failure(error) };
  }
  done();
  return { values, savedAt: Date.now() };
}

export async function addDayOff(_prev: DayOffState, formData: FormData): Promise<DayOffState> {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  const day = String(formData.get("day") ?? "");
  const note = String(formData.get("note") ?? "").trim().replace(/\s+/g, " ");
  if (!date.test(day)) return { error: "dateInvalid" };
  if (note.length > MAX_DAY_OFF_NOTE_LENGTH) return { error: "noteTooLong" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_company_day_off", { org: membership.organization.id, off_day: day, off_note: note || null });
  if (error) {
    if (error.hint === "invalid_date") return { error: "dateInvalid" };
    if (error.hint === "invalid_note") return { error: "noteTooLong" };
    const reason = failure(error);
    return { error: reason === "noPage" ? "noPage" : "unknown" };
  }
  done();
  return { savedAt: Date.now() };
}

export async function removeDayOff(_prev: DayOffState, formData: FormData): Promise<DayOffState> {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  const day = String(formData.get("day") ?? "");
  if (!date.test(day)) return { error: "unknown" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_company_day_off", { org: membership.organization.id, off_day: day });
  if (error) {
    failure(error);
    return { error: "unknown" };
  }
  done();
  return { savedAt: Date.now() };
}
