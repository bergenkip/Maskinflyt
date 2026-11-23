import "server-only";
import { createClient } from "@/lib/supabase/server";
import { jobSearchRange, type DoneJob } from "./hour-jobs";
import { allPages } from "./invoice-export-server";
import { ruleColumns, sheetFileName, toHourRules, type SheetDay } from "./hours";
import { hoursPdf, type ConfirmedSheet } from "./pdf/hours-pdf";

export const sheetColumns =
  `id, organization_id, user_id, period_from, period_to, status, employee_name, ${ruleColumns}, worked_minutes, normal_minutes, overtime_minutes, overtime2_minutes, submitted_at, email_to, email_status, emailed_at, created_at`;
export const dayColumns = "day, starts, ends, break_minutes, note, worked_minutes, normal_minutes, overtime_minutes, overtime2_minutes";

export type SheetRow = {
  id: string;
  organization_id: string;
  user_id: string;
  period_from: string;
  period_to: string;
  status: "draft" | "submitted";
  employee_name: string | null;
  overtime_after: number | null;
  overtime_percent: number | null;
  overtime2_after: number | null;
  overtime2_percent: number | null;
  overtime_mode: string | null;
  overtime_from: string | null;
  overtime_to: string | null;
  overtime2_from: string | null;
  overtime2_to: string | null;
  worked_minutes: number | null;
  normal_minutes: number | null;
  overtime_minutes: number | null;
  overtime2_minutes: number | null;
  submitted_at: string | null;
  email_to: string | null;
  email_status: "sent" | "failed" | "none" | null;
  emailed_at: string | null;
  created_at: string;
};

// The PDF of a confirmed sheet, made from the sheet in the database (RLS
// decides who may read it). Null when it is not there or not confirmed.
export async function getSheetPdf(sheetId: string): Promise<{ sheet: ConfirmedSheet; pdf: Uint8Array; filename: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("hour_sheets").select(sheetColumns).eq("id", sheetId).maybeSingle();
  const row = data as SheetRow | null;
  if (!row || row.status !== "submitted" || !row.submitted_at) return null;
  const [{ data: company }, { data: days }] = await Promise.all([
    supabase.from("organizations").select("name, timezone").eq("id", row.organization_id).maybeSingle(),
    supabase.from("hour_sheet_days").select(dayColumns).eq("sheet_id", row.id).order("day"),
  ]);
  if (!company) return null;
  const sheet: ConfirmedSheet = {
    company: company.name,
    employee_name: row.employee_name ?? "",
    period_from: row.period_from,
    period_to: row.period_to,
    submitted_at: row.submitted_at,
    timezone: company.timezone,
    ...toHourRules(row),
    worked_minutes: row.worked_minutes ?? 0,
    normal_minutes: row.normal_minutes ?? 0,
    overtime_minutes: row.overtime_minutes ?? 0,
    overtime2_minutes: row.overtime2_minutes ?? 0,
  };
  const pdf = await hoursPdf(sheet, (days ?? []) as SheetDay[]);
  return { sheet, pdf, filename: sheetFileName(sheet.employee_name, row.period_from, row.period_to) };
}

// The finished jobs these people drove on the local days from–to (RLS: the
// office reads all jobs, the accountant the finished ones). Null when they
// could not be loaded.
export async function loadDoneJobs(organizationId: string, users: string[], from: string, to: string): Promise<DoneJob[] | null> {
  if (users.length === 0) return [];
  const supabase = await createClient();
  const range = jobSearchRange(from, to);
  return allPages<DoneJob>((first, last) =>
    supabase
      .from("jobs")
      .select("id, number, starts_at, ends_at, address, driver_id, customers(name), job_times(worked_minutes, created_at)")
      .eq("organization_id", organizationId)
      .eq("status", "done")
      .in("driver_id", users)
      .gte("starts_at", range.from)
      .lt("starts_at", range.to)
      .order("starts_at")
      .order("id")
      .range(first, last),
  );
}
