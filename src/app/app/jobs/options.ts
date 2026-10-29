import "server-only";
import type { Option } from "./job-forms";
import { createClient } from "@/lib/supabase/server";

type Named = { id: string; name: string; active: boolean };
type MemberRow = { user_id: string; email: string; full_name: string | null };
type MainMachineRow = { user_id: string; main_vehicle_id: string | null };
type PastJobRow = { driver_id: string; vehicle_id: string };

// The machine suggested when someone is chosen as a job's driver: the main
// machine set on the team page, or else the one they drove most often lately.
export type Suggestion = { vehicleId: string; reason: "main" | "usual" };

// The customers, machines and people a job can be given. Only active customers
// and machines are offered, except the ones the job already has.
export async function getJobOptions(organizationId: string, keep: { customerId?: string; vehicleId?: string | null } = {}) {
  const supabase = await createClient();
  const [customers, vehicles, members, mainMachines, pastJobs] = await Promise.all([
    supabase.from("customers").select("id, name, active").eq("organization_id", organizationId).order("name"),
    supabase.from("vehicles").select("id, name, active").eq("organization_id", organizationId).order("name"),
    supabase.rpc("list_members", { org: organizationId }),
    supabase.from("memberships").select("user_id, main_vehicle_id").eq("organization_id", organizationId),
    supabase
      .from("jobs")
      .select("driver_id, vehicle_id")
      .eq("organization_id", organizationId)
      .neq("status", "cancelled")
      .not("driver_id", "is", null)
      .not("vehicle_id", "is", null)
      .order("starts_at", { ascending: false })
      .limit(500),
  ]);
  const offered = (rows: Named[] | null, kept?: string | null): Option[] =>
    (rows ?? []).filter((row) => row.active || row.id === kept);
  const active = new Set(((vehicles.data ?? []) as Named[]).filter((v) => v.active).map((v) => v.id));

  // How often each person drove each machine in their latest jobs.
  const counts = new Map<string, Map<string, number>>();
  for (const job of (pastJobs.data ?? []) as PastJobRow[]) {
    if (!active.has(job.vehicle_id)) continue;
    const perDriver = counts.get(job.driver_id) ?? new Map<string, number>();
    perDriver.set(job.vehicle_id, (perDriver.get(job.vehicle_id) ?? 0) + 1);
    counts.set(job.driver_id, perDriver);
  }
  const suggestions: Record<string, Suggestion> = {};
  for (const row of (mainMachines.data ?? []) as MainMachineRow[]) {
    if (row.main_vehicle_id && active.has(row.main_vehicle_id)) {
      suggestions[row.user_id] = { vehicleId: row.main_vehicle_id, reason: "main" };
      continue;
    }
    const usual = [...(counts.get(row.user_id) ?? [])].sort((a, b) => b[1] - a[1])[0];
    if (usual) suggestions[row.user_id] = { vehicleId: usual[0], reason: "usual" };
  }

  return {
    customers: offered(customers.data as Named[] | null, keep.customerId),
    vehicles: offered(vehicles.data as Named[] | null, keep.vehicleId),
    // Anyone in the company can drive; small companies' owners often do.
    drivers: ((members.data ?? []) as MemberRow[]).map((m) => ({ id: m.user_id, name: m.full_name ?? m.email })),
    suggestions,
    error: customers.error ?? vehicles.error ?? members.error,
  };
}
