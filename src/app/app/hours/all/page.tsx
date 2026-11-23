import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { jobsInSheet, monthRange } from "@/lib/hour-jobs";
import { loadDoneJobs, sheetColumns, type SheetRow } from "@/lib/hours-server";
import { allPages } from "@/lib/invoice-export-server";
import { monthPeriod } from "@/lib/invoice-export";
import { getCurrentMembership } from "@/lib/membership";
import { canSeeAllHourSheets } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { AllSheetsView, type SheetSummary } from "./all-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("HourSheetsAll");
  return { title: `${t("title")} · MaskinGo` };
}

type MemberRow = { user_id: string; email: string; full_name: string | null };

// Stage 13b: every employee's hours sheets for a month, with the finished
// jobs in each sheet's period. Owners, admins and the accountant (RLS decides).
export default async function AllHourSheetsPage({ searchParams }: PageProps<"/app/hours/all">) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  if (!canSeeAllHourSheets(membership)) redirect("/app/hours");
  const { organization } = membership;

  const { month: asked } = await searchParams;
  const month = typeof asked === "string" && monthRange(asked) ? asked : monthPeriod(organization.timeZone).from.slice(0, 7);
  const range = monthRange(month)!;

  const supabase = await createClient();
  const [sheets, members] = await Promise.all([
    allPages<SheetRow>((from, to) =>
      supabase
        .from("hour_sheets")
        .select(sheetColumns)
        .eq("organization_id", organization.id)
        .lte("period_from", range.to)
        .gte("period_to", range.from)
        .order("period_from")
        .order("id")
        .range(from, to),
    ),
    supabase.rpc("list_members", { org: organization.id }),
  ]);
  const rows = sheets ?? [];
  const names = new Map(((members.data ?? []) as MemberRow[]).map((m) => [m.user_id, m.full_name ?? m.email]));

  // A sheet still being filled in has no totals yet: its days are added up here.
  const drafts = rows.filter((sheet) => sheet.status === "draft").map((sheet) => sheet.id);
  const firstDay = rows.reduce((min, sheet) => (sheet.period_from < min ? sheet.period_from : min), range.from);
  const lastDay = rows.reduce((max, sheet) => (sheet.period_to > max ? sheet.period_to : max), range.to);
  const [days, jobs] = await Promise.all([
    drafts.length
      ? allPages<{ sheet_id: string; worked_minutes: number }>((from, to) =>
          supabase.from("hour_sheet_days").select("sheet_id, worked_minutes").in("sheet_id", drafts).order("sheet_id").order("day").range(from, to),
        )
      : Promise.resolve([]),
    loadDoneJobs(organization.id, [...new Set(rows.map((sheet) => sheet.user_id))], firstDay, lastDay),
  ]);
  const draftMinutes = new Map<string, number>();
  for (const day of days ?? []) draftMinutes.set(day.sheet_id, (draftMinutes.get(day.sheet_id) ?? 0) + day.worked_minutes);

  const summaries: SheetSummary[] = rows
    .map((sheet) => ({
      id: sheet.id,
      name: sheet.employee_name ?? names.get(sheet.user_id) ?? "",
      periodFrom: sheet.period_from,
      periodTo: sheet.period_to,
      status: sheet.status,
      workedMinutes: sheet.status === "submitted" ? (sheet.worked_minutes ?? 0) : (draftMinutes.get(sheet.id) ?? 0),
      jobCount: jobs ? jobsInSheet(jobs, sheet, organization.timeZone).length : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "nb") || a.periodFrom.localeCompare(b.periodFrom));

  return <AllSheetsView month={month} sheets={summaries} failed={sheets === null} />;
}
