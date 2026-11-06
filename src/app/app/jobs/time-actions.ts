"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validateTime, type TimeFieldError, type TimeFormValues } from "@/lib/job-time";
import { getCurrentMembership } from "@/lib/membership";
import { createClient } from "@/lib/supabase/server";

// The database decides who may approve (the office, owners and admins with the
// second step), when a reason is needed, and counts the minutes and the price;
// this action checks the form and translates errors.

export type TimeState = {
  values?: TimeFormValues;
  fieldErrors?: Partial<Record<keyof TimeFormValues, TimeFieldError | "reasonRequired">>;
  error?: "notAllowed" | "notDone" | "locked" | "unknown";
  savedAt?: number;
};

export async function approveTime(_prev: TimeState, formData: FormData): Promise<TimeState> {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");

  const job = String(formData.get("job") ?? "");
  const { values, fieldErrors, fields } = validateTime(formData, membership.organization.timeZone);
  if (!fields) return { values, fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_job_time", {
    job,
    started_at: fields.started_at,
    ended_at: fields.ended_at,
    break_minutes: fields.break_minutes,
    reason: fields.reason,
  });
  if (error) {
    if (error.hint === "reason_required") return { values, fieldErrors: { reason: "reasonRequired" } };
    if (error.code === "42501") return { values, error: "notAllowed" };
    if (error.code === "55000") return { values, error: "notDone" };
    if (error.code === "55006") return { values, error: "locked" };
    if (error.code === "22023") return { values, fieldErrors: { breaks: "breaksInvalid" } };
    return { values, error: "unknown" };
  }

  revalidatePath("/app", "layout");
  return { savedAt: Date.now() };
}
