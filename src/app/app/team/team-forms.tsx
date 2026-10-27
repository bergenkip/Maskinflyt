"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef, useState } from "react";
import { FormAlert, SubmitButton } from "@/components/form";
import {
  changeRole,
  inviteMember,
  removeMember,
  revokeInvitation,
  type InviteState,
  type TeamActionState,
} from "./actions";

type RoleOption = { value: string; label: string };

const selectClass =
  "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";
const secondaryButtonClass =
  "min-h-11 rounded-lg border border-border px-4 font-medium text-foreground hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-70";

export function InviteForm({ roles }: { roles: RoleOption[] }) {
  const t = useTranslations("Team");
  const tAuth = useTranslations("Auth");
  const [state, action] = useActionState<InviteState, FormData>(inviteMember, {});
  const linkRole = roles.find((role) => role.value === state.linkRole)?.label;

  return (
    <form action={action} noValidate className="grid gap-5">
      {state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}
      {state.link && (
        <div className="grid gap-3">
          <FormAlert kind="success">{t("linkCreated", { role: linkRole ?? "" })}</FormAlert>
          <CopyLink url={state.link} />
        </div>
      )}
      <div className="grid gap-1.5">
        <label htmlFor="invite-role" className="font-medium">
          {t("role")}
        </label>
        <select
          id="invite-role"
          name="role"
          defaultValue={state.values?.role || roles.at(-1)?.value}
          // Re-mount after each result so the default above is applied again.
          key={state.link ?? state.values?.role ?? "new"}
          aria-invalid={state.fieldErrors?.role ? true : undefined}
          className={`${selectClass} sm:max-w-xs`}
        >
          {roles.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted">{t("roleHint")}</p>
        {state.fieldErrors?.role && (
          <p role="alert" className="text-sm font-medium text-danger">
            {t(`errors.${state.fieldErrors.role}`)}
          </p>
        )}
      </div>
      <div>
        <SubmitButton pendingLabel={tAuth("pending")}>{t("inviteSubmit")}</SubmitButton>
      </div>
    </form>
  );
}

function CopyLink({ url }: { url: string }) {
  const t = useTranslations("Team");
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <div className="grid gap-2 rounded-lg border border-border p-3">
      <p className="text-sm text-muted">{t("linkLabel")}</p>
      {/* Selectable as text too, in case the clipboard is not available. */}
      <p className="font-medium select-all [overflow-wrap:anywhere]">{url}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={copy} className={secondaryButtonClass}>
          {t("copy")}
        </button>
        <p role="status" className="text-sm text-muted">
          {status === "copied" ? t("copied") : status === "failed" ? t("copyFailed") : ""}
        </p>
      </div>
    </div>
  );
}

export function RoleForm({
  membershipId,
  name,
  current,
  roles,
}: {
  membershipId: string;
  // The member's name, or e-mail address for older accounts without one.
  name: string;
  current: string;
  roles: RoleOption[];
}) {
  const t = useTranslations("Team");
  const tAuth = useTranslations("Auth");
  const [state, action, pending] = useActionState<TeamActionState, FormData>(changeRole, {});
  const selectId = `role-${membershipId}`;

  return (
    <form action={action} className="flex flex-1 flex-wrap items-end gap-3">
      <input type="hidden" name="membershipId" value={membershipId} />
      <div className="grid min-w-44 flex-1 gap-1.5 sm:flex-none">
        <label htmlFor={selectId} className="text-sm font-medium">
          {t("roleFor", { name })}
        </label>
        <select id={selectId} name="role" defaultValue={current} className={selectClass}>
          {roles.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        {pending ? tAuth("pending") : t("saveRole")}
      </button>
      {state.error && (
        <p role="alert" className="basis-full text-sm font-medium text-danger">
          {t(`errors.${state.error}`)}
        </p>
      )}
    </form>
  );
}

export function RemoveMemberForm({ membershipId, name }: { membershipId: string; name: string }) {
  const t = useTranslations("Team");
  const tAuth = useTranslations("Auth");
  const [state, action, pending] = useActionState<TeamActionState, FormData>(removeMember, {});
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="membershipId" value={membershipId} />
      <button
        type="button"
        onClick={() => {
          // Removing someone cannot be undone from here, so ask first.
          if (window.confirm(t("removeConfirm", { name }))) formRef.current?.requestSubmit();
        }}
        disabled={pending}
        aria-label={t("removeLabel", { name })}
        className="min-h-11 rounded-lg px-4 font-medium text-danger hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-70"
      >
        {pending ? tAuth("pending") : t("remove")}
      </button>
      {state.error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {t(`errors.${state.error}`)}
        </p>
      )}
    </form>
  );
}

export function RevokeInvitationForm({ invitationId, label }: { invitationId: string; label: string }) {
  const t = useTranslations("Team");
  const tAuth = useTranslations("Auth");
  const [state, action, pending] = useActionState<TeamActionState, FormData>(revokeInvitation, {});

  return (
    <form action={action}>
      <input type="hidden" name="invitationId" value={invitationId} />
      <button
        type="submit"
        disabled={pending}
        aria-label={t("revokeLabel", { invitation: label })}
        className={secondaryButtonClass}
      >
        {pending ? tAuth("pending") : t("revoke")}
      </button>
      {state.error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {t(`errors.${state.error}`)}
        </p>
      )}
    </form>
  );
}
