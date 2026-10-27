import "server-only";
import { cache } from "react";
import { createClient, getUserId } from "@/lib/supabase/server";
import type { Role } from "./roles";

export type { Role } from "./roles";

export type CurrentMembership = {
  role: Role;
  organization: { id: string; name: string; orgNumber: string | null; currency: string };
};

// RLS lets a member read every membership of their company (for the team list),
// so the query must pick the signed-in user's own row explicitly.
// Once per request: the layout and the page both need it.
export const getCurrentMembership = cache(async (): Promise<CurrentMembership | null> => {
  const userId = await getUserId();
  if (!userId) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("role, organizations(id, name, org_number, currency)")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const org = data.organizations as unknown as {
    id: string;
    name: string;
    org_number: string | null;
    currency: string;
  } | null;
  if (!org) return null;
  return {
    role: data.role as Role,
    organization: { id: org.id, name: org.name, orgNumber: org.org_number, currency: org.currency },
  };
});
