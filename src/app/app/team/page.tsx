import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { getCurrentMembership } from "@/lib/membership";
import { assignableRoles, canManage, invitableRoles, isRole, type Role } from "@/lib/roles";
import { createClient, getUserId } from "@/lib/supabase/server";
import { InviteForm, RemoveMemberForm, RevokeInvitationForm, RoleForm } from "./team-forms";

type Member = { membership_id: string; user_id: string; email: string; full_name: string | null; role: Role };
type Invitation = { id: string; role: string; created_at: string; expires_at: string };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Team");
  return { title: `${t("title")} · Maskinflyt` };
}

export default async function TeamPage() {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");

  const t = await getTranslations("Team");
  const tRoles = await getTranslations("Roles");
  const format = await getFormatter();
  const { organization, role: myRole } = membership;
  const supabase = await createClient();
  const userId = await getUserId();
  const mayInvite = invitableRoles(myRole).length > 0;

  const [members, invitations] = await Promise.all([
    supabase.rpc("list_members", { org: organization.id }),
    mayInvite
      ? supabase
          .from("invitations")
          .select("id, role, created_at, expires_at")
          .eq("organization_id", organization.id)
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Invitation[] }),
  ]);

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
          <InviteForm roles={roleOptions(invitableRoles(myRole))} />
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
                    <p className="text-sm text-muted">{tRoles(member.role)}</p>
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
                    <RevokeInvitationForm invitationId={invitation.id} label={`${role}, ${created}`} />
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
