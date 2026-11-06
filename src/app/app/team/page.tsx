import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { getCurrentMembership } from "@/lib/membership";
import {
  assignableRoles,
  canChooseMainMachines,
  canGrantPermissions,
  canManage,
  grantablePermissions,
  invitableRoles,
  isPermission,
  isRole,
  permissions,
  type Role,
} from "@/lib/roles";
import { createClient, getUserId } from "@/lib/supabase/server";
import { InviteForm, MainMachineForm, PermissionsForm, RemoveMemberForm, RevokeInvitationForm, RoleForm } from "./team-forms";

type Member = { membership_id: string; user_id: string; email: string; full_name: string | null; role: Role };
type Invitation = { id: string; role: string; created_at: string; expires_at: string; invited_by: string | null };
type MembershipRow = { id: string; main_vehicle_id: string | null; permissions: string[] | null };
type Vehicle = { id: string; name: string; active: boolean };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Team");
  return { title: `${t("title")} · MaskinGo` };
}

export default async function TeamPage() {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");

  const t = await getTranslations("Team");
  const tRoles = await getTranslations("Roles");
  const tPermissions = await getTranslations("Permissions");
  const format = await getFormatter();
  const { organization, role: myRole } = membership;
  const supabase = await createClient();
  const userId = await getUserId();
  const mayInvite = invitableRoles(membership).length > 0;
  // Owners and admins manage roles; others may only invite (with the invite right).
  const managesPeople = assignableRoles(myRole).length > 0;
  const mayChooseMachines = canChooseMainMachines(membership);

  const [members, invitations, memberships, vehicles] = await Promise.all([
    supabase.rpc("list_members", { org: organization.id }),
    mayInvite
      ? supabase
          .from("invitations")
          .select("id, role, created_at, expires_at, invited_by")
          .eq("organization_id", organization.id)
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Invitation[] }),
    // Each person's main machine (suggested when they get a job) and extra rights.
    supabase.from("memberships").select("id, main_vehicle_id, permissions").eq("organization_id", organization.id),
    mayChooseMachines
      ? supabase.from("vehicles").select("id, name, active").eq("organization_id", organization.id).order("name")
      : Promise.resolve({ data: [] as Vehicle[] }),
  ]);
  const rows = (memberships.data ?? []) as MembershipRow[];
  const mainMachine = new Map(rows.map((row) => [row.id, row.main_vehicle_id ?? ""]));
  // In a fixed order, whatever order they were saved in.
  const extraRights = new Map(
    rows.map((row) => [row.id, permissions.filter((p) => (row.permissions ?? []).filter(isPermission).includes(p))]),
  );
  const vehicleRows = (vehicles.data ?? []) as Vehicle[];
  // Active machines, and the one someone already has even if it was switched off.
  const machineOptions = (current: string) => vehicleRows.filter((vehicle) => vehicle.active || vehicle.id === current);

  const roleOptions = (list: string[]) => list.filter(isRole).map((value) => ({ value, label: tRoles(value) }));

  return (
    <div className="grid max-w-3xl gap-8">
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        {/* Company names are data and are shown exactly as entered. */}
        <p className="text-muted [overflow-wrap:anywhere]">{t("lead", { company: organization.name })}</p>
      </div>

      {mayInvite ? (
        <section aria-labelledby="invite-title" className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:p-6">
          <div className="grid gap-1">
            <h2 id="invite-title" className="text-lg font-semibold">
              {t("inviteTitle")}
            </h2>
            <p className="text-muted">{t("inviteLead")}</p>
          </div>
          {!managesPeople && <p className="text-sm text-muted">{t("readOnlyInvite")}</p>}
          <InviteForm roles={roleOptions(invitableRoles(membership))} />
        </section>
      ) : (
        <p className="rounded-xl border border-border bg-surface p-4 text-muted">{t("readOnly")}</p>
      )}

      <section aria-labelledby="members-title" className="grid gap-3">
        <h2 id="members-title" className="text-lg font-semibold">
          {t("membersTitle")}
        </h2>
        {members.error ? (
          <p className="text-danger">{t("errors.unknown")}</p>
        ) : (
          <ul className="grid gap-3">
            {((members.data ?? []) as Member[]).map((member) => {
              const isMe = member.user_id === userId;
              const manageable = !isMe && canManage(myRole, member.role);
              const extras = extraRights.get(member.membership_id) ?? [];
              const grantable = !isMe && canGrantPermissions(myRole, member.role) ? grantablePermissions(member.role) : [];
              // Names and e-mail addresses are data and are shown exactly as entered.
              const name = member.full_name ?? member.email;
              return (
                <li key={member.membership_id} className="grid gap-3 rounded-xl border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <div className="grid min-w-0 gap-0.5">
                      <p className="font-medium [overflow-wrap:anywhere]">
                        {name}
                        {isMe && <span className="ml-2 text-sm font-normal text-muted">({t("you")})</span>}
                      </p>
                      {member.full_name && (
                        <p className="text-sm text-muted [overflow-wrap:anywhere]">{member.email}</p>
                      )}
                    </div>
                    <div className="grid gap-0.5 sm:justify-items-end sm:text-right">
                      <p className="text-sm text-muted">{tRoles(member.role)}</p>
                      {extras.length > 0 && (
                        <p className="text-sm text-muted">
                          {t("permissionsShown", { list: extras.map((p) => tPermissions(p)).join(", ") })}
                        </p>
                      )}
                    </div>
                  </div>
                  {manageable && (
                    <div className="flex flex-wrap items-end gap-3">
                      <RoleForm
                        membershipId={member.membership_id}
                        name={name}
                        current={member.role}
                        roles={roleOptions(assignableRoles(myRole))}
                      />
                      <RemoveMemberForm membershipId={member.membership_id} name={name} />
                    </div>
                  )}
                  {grantable.length > 0 && (
                    <details className="rounded-lg border border-border" open={extras.length > 0 || undefined}>
                      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                        {t("permissionsTitle")}
                        {extras.length > 0 && <span className="text-sm font-normal text-muted">({extras.length})</span>}
                      </summary>
                      <div className="grid gap-3 border-t border-border p-3">
                        <p className="text-sm text-muted">{t("permissionsLead")}</p>
                        <PermissionsForm
                          membershipId={member.membership_id}
                          name={name}
                          current={extras}
                          options={grantable.map((p) => ({ value: p, label: tPermissions(p), hint: tPermissions(`${p}Hint`) }))}
                        />
                      </div>
                    </details>
                  )}
                  {mayChooseMachines && vehicleRows.length > 0 && (
                    <MainMachineForm
                      membershipId={member.membership_id}
                      name={name}
                      current={mainMachine.get(member.membership_id) ?? ""}
                      vehicles={machineOptions(mainMachine.get(member.membership_id) ?? "")}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {mayInvite && (
        <section aria-labelledby="invitations-title" className="grid gap-3">
          <h2 id="invitations-title" className="text-lg font-semibold">
            {t("invitationsTitle")}
          </h2>
          {(invitations.data ?? []).length === 0 ? (
            <p className="text-muted">{t("invitationsEmpty")}</p>
          ) : (
            <ul className="grid gap-3">
              {((invitations.data ?? []) as Invitation[]).map((invitation) => {
                const role = isRole(invitation.role) ? tRoles(invitation.role) : invitation.role;
                const created = format.dateTime(new Date(invitation.created_at), { dateStyle: "medium", timeStyle: "short" });
                return (
                  <li
                    key={invitation.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4"
                  >
                    <div className="grid gap-0.5">
                      <p className="font-medium">{t("invitationFor", { role })}</p>
                      <p className="text-sm text-muted">
                        {t("created", { date: created })} ·{" "}
                        {t("expires", {
                          date: format.dateTime(new Date(invitation.expires_at), { dateStyle: "medium" }),
                        })}
                      </p>
                    </div>
                    {(managesPeople || invitation.invited_by === userId) && (
                      <RevokeInvitationForm invitationId={invitation.id} label={`${role}, ${created}`} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
