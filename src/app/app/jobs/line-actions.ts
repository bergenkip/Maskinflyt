"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validateLine, type LineFieldError, type LineFormValues } from "@/lib/invoice";
import { getCurrentMembership } from "@/lib/membership";
import { createClient } from "@/lib/supabase/server";

// Extra lines of a job for the invoice draft. The database decides who may
// change them (the office, owners and admins with the second step) and counts
// each line's amount; these actions check the form and translate errors.

export type LineState = {
  values?: LineFormValues;
  fieldErrors?: Partial<Record<keyof LineFormValues, LineFieldError>>;
  error?: "notAllowed" | "cancelled" | "locked" | "unknown";
  savedAt?: number;
};

function failure(error: { code?: string } | null): LineState["error"] {
  if (!error) return undefined;
  if (error.code === "42501") return "notAllowed";
  if (error.code === "55000") return "cancelled";
  if (error.code === "55006") return "locked";
  return "unknown";
}

export async function saveLine(_prev: LineState, formData: FormData): Promise<LineState> {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");

  const job = String(formData.get("job") ?? "");
  const line = String(formData.get("line") ?? "");
  const { values, fieldErrors, fields } = validateLine(formData);
  if (!fields) return { values, fieldErrors };

  const supabase = await createClient();
  // RLS limits both to the office of the job's company; a line of another job
  // or company matches nothing, which is reported as not allowed.
  const result = line
    ? await supabase.from("job_lines").update(fields).eq("id", line).eq("job_id", job).select("id")
    : await supabase
        .from("job_lines")
        .insert({ ...fields, organization_id: membership.organization.id, job_id: job })
        .select("id");
  const error = failure(result.error) ?? (result.data?.length ? undefined : "notAllowed");
  if (error) return { values, error };

  revalidatePath(`/app/jobs/${job}`);
  return { savedAt: Date.now() };
}

export async function removeLine(_prev: LineState, formData: FormData): Promise<LineState> {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");

  const job = String(formData.get("job") ?? "");
  const line = String(formData.get("line") ?? "");
  const supabase = await createClient();
  const result = await supabase.from("job_lines").delete().eq("id", line).eq("job_id", job).select("id");
  const error = failure(result.error) ?? (result.data?.length ? undefined : "notAllowed");
  if (error) return { error };

  revalidatePath(`/app/jobs/${job}`);
  return { savedAt: Date.now() };
}
