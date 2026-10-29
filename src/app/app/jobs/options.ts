import "server-only";
import type { Option } from "./job-forms";
import { createClient } from "@/lib/supabase/server";

type Named = { id: string; name: string; active: boolean };
type MemberRow = { user_id: string; email: string; full_name: string | null };

// The customers, machines and people a job can be given. Only active customers
// and machines are offered, except the ones the job already has.
export async function getJobOptions(organizationId: string, keep: { customerId?: string; vehicleId?: string | null } = {}) {
  const supabase = await createClient();
  const [customers, vehicles, members] = await Promise.all([
    supabase.from("customers").select("id, name, active").eq("organization_id", organizationId).order("name"),
    supabase.from("vehicles").select("id, name, active").eq("organization_id", organizationId).order("name"),
    supabase.rpc("list_members", { org: organizationId }),
  ]);
  const offered = (rows: Named[] | null, kept?: string | null): Option[] =>
    (rows ?? []).filter((row) => row.active || row.id === kept);

  return {
    customers: offered(customers.data as Named[] | null, keep.customerId),
    vehicles: offered(vehicles.data as Named[] | null, keep.vehicleId),
    // Anyone in the company can drive; small companies' owners often do.
    drivers: ((members.data ?? []) as MemberRow[]).map((m) => ({ id: m.user_id, name: m.full_name ?? m.email })),
    error: customers.error ?? vehicles.error ?? members.error,
  };
}
