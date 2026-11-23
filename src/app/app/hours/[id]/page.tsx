import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ruleColumns, toHourRules, type HourRules, type SheetDay } from "@/lib/hours";
import { jobsInSheet } from "@/lib/hour-jobs";
import { dayColumns, loadDoneJobs, sheetColumns, type SheetRow } from "@/lib/hours-server";
import { getCurrentMembership } from "@/lib/membership";
import { canSeeAllHourSheets } from "@/lib/roles";
import { createClient, getUserId } from "@/lib/supabase/server";
import { HourSheetView } from "./sheet-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Hours");
  return { title: `${t("title")} · MaskinGo` };
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One hours sheet: filled in day by day, then confirmed and e-mailed.
export default async function HourSheetPage({ params }: PageProps<"/app/hours/[id]">) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  const { id } = await params;
  if (!uuid.test(id)) notFound();

  const supabase = await createClient();
  const [{ data }, { data: days }, { data: settings }, userId] = await Promise.all([
    supabase.from("hour_sheets").select(sheetColumns).eq("id", id).maybeSingle(),
    supabase.from("hour_sheet_days").select(dayColumns).eq("sheet_id", id).order("day"),
    supabase
      .from("hour_settings")
      .select(`${ruleColumns}, accountant_email`)
      .eq("organization_id", membership.organization.id)
      .maybeSingle(),
    getUserId(),
  ]);
  const sheet = data as SheetRow | null;
  if (!sheet || sheet.organization_id !== membership.organization.id) notFound();
  const own = sheet.user_id === userId;
  const submitted = sheet.status === "submitted";
  const rows = (days ?? []) as SheetDay[];

  // A confirmed sheet keeps the rules it was confirmed with.
  const rules: HourRules = toHourRules(submitted ? sheet : (settings as Partial<HourRules> | null));
  // Those who read every sheet see the finished jobs behind it.
  const jobs = canSeeAllHourSheets(membership)
    ? await loadDoneJobs(sheet.organization_id, [sheet.user_id], sheet.period_from, sheet.period_to).then((all) =>
        all === null ? null : jobsInSheet(all, sheet, membership.organization.timeZone),
      )
    : undefined;
  const accountantEmail = (settings as { accountant_email: string | null } | null)?.accountant_email ?? null;
  return (
    <HourSheetView sheet={sheet} rows={rows} rules={rules} own={own} accountantEmail={accountantEmail} timeZone={membership.organization.timeZone} jobs={jobs} />
  );
}
