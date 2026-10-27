"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { inviteUrl } from "@/lib/invitations";
import { getCurrentMembership } from "@/lib/membership";
import { isRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

// Every action re-checks rights in the database (SECURITY DEFINER functions);
// these server actions only translate form data and error hints.

export type InviteState = {
  values?: { role: string };
  fieldErrors?: { role?: "roleInvalid" };
  error?: "notAllowed" | "unknown";
  // The personal link, shown once: only a hash of its token is stored.
  link?: string;
  linkRole?: string;
};

export async function inviteMember(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const role = formData.get("role");
  const values = { role: String(role ?? "") };
  if (!isRole(role) || role === "owner") return { values, fieldErrors: { role: "roleInvalid" } };

  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");

  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("create_invitation", {
    org: membership.organization.id,
    invitee_role: role,
  });

  if (error || typeof token !== "string") {
    if (error?.hint === "mfa_required") redirect("/mfa");
    if (error?.hint === "invalid_role") return { values, fieldErrors: { role: "roleInvalid" } };
    if (error?.code === "42501") return { values, error: "notAllowed" };
    return { values, error: "unknown" };
  }

  revalidatePath("/app/team");
  return { values, link: await inviteUrl(token), linkRole: role };
}

export type TeamActionState = { error?: "notAllowed" | "lastOwner" | "unknown"; done?: boolean };

function mapTeamError(error: { code?: string; hint?: string }): TeamActionState {
  // The session has no authenticator code yet (for example it expired): ask for it.
  if (error.hint === "mfa_required") redirect("/mfa");
  if (error.hint === "last_owner") return { error: "lastOwner" };
  if (error.code === "42501" || error.hint === "not_found" || error.hint === "not_allowed") {
    return { error: "notAllowed" };
  }
  return { error: "unknown" };
}

export async function changeRole(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const membershipId = String(formData.get("membershipId") ?? "");
  const role = formData.get("role");
  if (!membershipId || !isRole(role)) return { error: "unknown" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("change_member_role", { membership_id: membershipId, new_role: role });
  if (error) return mapTeamError(error);

  // Changing your own role may change what the whole app shows.
  revalidatePath("/app", "layout");
  return { done: true };
}

export async function removeMember(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const membershipId = String(formData.get("membershipId") ?? "");
  if (!membershipId) return { error: "unknown" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", { membership_id: membershipId });
  if (error) return mapTeamError(error);

  revalidatePath("/app/team");
  return { done: true };
}

export async function revokeInvitation(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const invitationId = String(formData.get("invitationId") ?? "");
  if (!invitationId) return { error: "unknown" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_invitation", { invitation_id: invitationId });
  if (error) return mapTeamError(error);

  revalidatePath("/app/team");
  return { done: true };
}
