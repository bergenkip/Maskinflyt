import type { NoticeKind } from "./email/planned-email";

// Stage 16c: what the customer who requested a job was last told about it,
// and what (if anything) they should be told now.
export type CustomerNotice = { starts_at: string; ends_at: string; cancelled: boolean; sent_at: string };
type JobState = { status: string; starts_at: string; ends_at: string };

export function noticeNeeded(job: JobState, notice: CustomerNotice | null): NoticeKind | null {
  // A finished job needs no news.
  if (job.status === "done") return null;
  // Cancelled: tell a customer who was told a time, once.
  if (job.status === "cancelled") return notice && !notice.cancelled ? "cancelled" : null;
  // Never told, or told it was cancelled and the job is back: the time as planned.
  if (!notice || notice.cancelled) return "planned";
  const same = Date.parse(notice.starts_at) === Date.parse(job.starts_at) && Date.parse(notice.ends_at) === Date.parse(job.ends_at);
  return same ? null : "changed";
}
