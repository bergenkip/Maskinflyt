import "server-only";
import type { createClient } from "./supabase/server";
import { DEFAULT_WEEK, type OpeningHours } from "./workload";

type Client = Awaited<ReturnType<typeof createClient>>;

// The company's working week and its days off between two dates, for how busy the machines are.
// A company that never set its hours gets Monday to Friday, 07–15. RLS keeps both to the company.
export async function loadWorkingTime(supabase: Client, organizationId: string, first: string, last: string) {
  const [hours, daysOff] = await Promise.all([
    supabase.from("company_hours").select("weekday, opens, closes").eq("organization_id", organizationId),
    supabase
      .from("company_days_off")
      .select("day")
      .eq("organization_id", organizationId)
      .gte("day", first)
      .lte("day", last),
  ]);
  const rows = (hours.data ?? []) as OpeningHours;
  return {
    failed: !!(hours.error ?? daysOff.error),
    week: rows.length > 0 ? rows : DEFAULT_WEEK,
    daysOff: new Set(((daysOff.data ?? []) as { day: string }[]).map((row) => row.day)),
  };
}
