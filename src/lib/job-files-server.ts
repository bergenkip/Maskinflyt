import "server-only";
import { JOB_FILES_BUCKET, type JobFileKind } from "@/lib/job-files";
import { createClient } from "@/lib/supabase/server";

export type JobFile = {
  id: string;
  job_id: string;
  kind: JobFileKind;
  signed_by: string | null;
  created_at: string;
  // A link that works for an hour; null when it could not be made.
  url: string | null;
};

// The photos and signatures of these jobs that the person may see (RLS and
// the bucket's policies decide), oldest first, with short-lived links.
export async function getJobFiles(jobIds: string[]): Promise<JobFile[]> {
  if (jobIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("job_files")
    .select("id, job_id, kind, path, signed_by, created_at")
    .in("job_id", jobIds)
    .order("created_at");
  const rows = (data ?? []) as (Omit<JobFile, "url"> & { path: string })[];
  if (rows.length === 0) return [];
  const { data: links } = await supabase.storage.from(JOB_FILES_BUCKET).createSignedUrls(
    rows.map((row) => row.path),
    60 * 60,
  );
  const urls = new Map((links ?? []).map((link) => [link.path, link.signedUrl]));
  return rows.map(({ path, ...row }) => ({ ...row, url: urls.get(path) ?? null }));
}
