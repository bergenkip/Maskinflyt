"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { noticeNeeded, type CustomerNotice } from "@/lib/job-notice";
import { getCurrentMembership } from "@/lib/membership";
import { canSeeJobs } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { sendJobNotice, type NoticeResult } from "./job-notice";

export type NoticeState = { result?: NoticeResult | "nothing"; at?: number };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Stage 16c: the office taps "send" on a job planned from a request. What is
// sent follows from the job as it is now and what the customer was told:
// the time, a new time or the cancellation. Never sent without the tap.
export async function tellCustomer(_prev: NoticeState, formData: FormData): Promise<NoticeState> {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  if (!canSeeJobs(membership)) redirect("/app");
  const id = String(formData.get("job") ?? "");
  if (!uuid.test(id)) return { result: "failed", at: Date.now() };

  const supabase = await createClient();
  const [{ data: job }, { data: notice }] = await Promise.all([
    supabase.from("jobs").select("id, request_id, address, starts_at, ends_at, status").eq("id", id).maybeSingle(),
    supabase.from("job_customer_notices").select("starts_at, ends_at, cancelled, sent_at").eq("job_id", id).maybeSingle(),
  ]);
  const found = job as { id: string; request_id: string | null; address: string; starts_at: string; ends_at: string; status: string } | null;
  if (!found?.request_id) return { result: "failed", at: Date.now() };
  const previous = notice as CustomerNotice | null;
  const kind = noticeNeeded(found, previous);
  if (!kind) return { result: "nothing", at: Date.now() };

  const result = await sendJobNotice(supabase, { ...found, request_id: found.request_id }, membership.organization, kind, previous);
  revalidatePath(`/app/jobs/${id}`);
  return { result, at: Date.now() };
}
