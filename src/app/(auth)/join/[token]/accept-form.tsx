"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormAlert, SubmitButton } from "@/components/form";
import { acceptInvitation, type AcceptState } from "@/app/app/actions";

// For someone who is already signed in (for example after confirming the
// e-mail address on another device) and has no company yet.
export function AcceptForm({ token }: { token: string }) {
  const t = useTranslations("Join");
  const tAuth = useTranslations("Auth");
  const [state, action] = useActionState<AcceptState, FormData>(acceptInvitation, {});

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      {state.error && <FormAlert kind="error">{t(`acceptErrors.${state.error}`)}</FormAlert>}
      <div>
        <SubmitButton pendingLabel={tAuth("pending")}>{t("accept")}</SubmitButton>
      </div>
    </form>
  );
}
