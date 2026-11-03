"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  contentTypeFor,
  extensionFor,
  isJobFileKind,
  JOB_FILES_BUCKET,
  jobFilePath,
  MAX_FILE_BYTES,
  normalizeSigner,
  sniffImage,
} from "@/lib/job-files";
import { getCurrentMembership } from "@/lib/membership";
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

export type FileState = {
  error?: "notAllowed" | "tooBig" | "wrongType" | "signerRequired" | "tooMany" | "alreadySigned" | "unknown";
  savedAt?: number;
};

// A photo or the customer's signature: checked here by its bytes, stored in
// the private bucket (Storage policies check the job's folder), then listed
// with the job (add_job_file checks again and keeps one signature per job).
export async function addJobFile(_prev: FileState, formData: FormData): Promise<FileState> {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");

  const job = String(formData.get("job") ?? "");
  const kind = formData.get("kind");
  const file = formData.get("file");
  if (!uuid.test(job) || !isJobFileKind(kind) || !(file instanceof File)) return { error: "unknown" };
  if (file.size === 0 || file.size > MAX_FILE_BYTES) return { error: "tooBig" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = sniffImage(bytes);
  if (extension !== extensionFor[kind]) return { error: "wrongType" };
  const signer = kind === "signature" ? normalizeSigner(String(formData.get("signedBy") ?? "")) : null;
  if (signer === undefined) return { error: "signerRequired" };

  const supabase = await createClient();
  const path = jobFilePath(membership.organization.id, job, randomUUID(), extension);
  const bucket = supabase.storage.from(JOB_FILES_BUCKET);
  const upload = await bucket.upload(path, bytes, { contentType: contentTypeFor[extension], upsert: false });
  if (upload.error) return { error: /row-level security|unauthorized|403/i.test(upload.error.message) ? "notAllowed" : "unknown" };

  const { error } = await supabase.rpc("add_job_file", { job, kind, path, signed_by: signer });
  if (error) {
    // Not listed, so not kept: the uploader may remove it.
    await bucket.remove([path]);
    if (error.code === "23505") return { error: "alreadySigned" };
    if (error.code === "54000") return { error: "tooMany" };
    if (error.code === "42501") return { error: "notAllowed" };
    return { error: "unknown" };
  }
  revalidatePath("/app", "layout");
  return { savedAt: Date.now() };
}
