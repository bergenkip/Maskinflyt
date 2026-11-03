"use server";

import { revalidatePath } from "next/cache";
import { isJobStep, MAX_NOTE_LENGTH } from "@/lib/progress";
import { createClient } from "@/lib/supabase/server";

// The database checks that it is the person's own job, that it is open and
// that the step comes next (record_job_step, add_job_note); these actions only
// pass the press on and translate errors.

export type StepState = { error?: "notAllowed" | "notNow" | "unknown"; savedAt?: number };
export type NoteState = { error?: "notAllowed" | "noteInvalid" | "unknown"; savedAt?: number; note?: string };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapError(code?: string): "notAllowed" | "notNow" | "unknown" {
  if (code === "42501") return "notAllowed";
  if (code === "55000") return "notNow";
  return "unknown";
}

export async function recordStep(_prev: StepState, formData: FormData): Promise<StepState> {
  const job = String(formData.get("job") ?? "");
  const step = formData.get("step");
  if (!uuid.test(job) || !isJobStep(step)) return { error: "unknown" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_job_step", { job, step });
  if (error) return { error: mapError(error.code) };
  revalidatePath("/app", "layout");
  return { savedAt: Date.now() };
}

export async function addNote(_prev: NoteState, formData: FormData): Promise<NoteState> {
  const job = String(formData.get("job") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!uuid.test(job)) return { error: "unknown" };
  if (note.length === 0 || note.length > MAX_NOTE_LENGTH) return { error: "noteInvalid", note };

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_job_note", { job, note });
  if (error) {
    const code = mapError(error.code);
    return { error: code === "notNow" ? "notAllowed" : code, note };
  }
  revalidatePath("/app", "layout");
  return { savedAt: Date.now() };
}
