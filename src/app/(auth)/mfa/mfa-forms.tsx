"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect } from "react";
import { FormAlert, SubmitButton } from "@/components/form";
import { checkSecondStep, type SendState, sendMfaLink } from "./actions";

const secondaryButtonClass =
  "flex min-h-11 items-center justify-center rounded-lg border border-border px-4 font-medium text-foreground hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";

// Step 1: send the link. Step 2: approve from the e-mail, in any browser,
// while this page checks every few seconds and then opens the app.
export function MfaEmailLink({ email }: { email: string }) {
  const t = useTranslations("Mfa");
  const tAuth = useTranslations("Auth");
  const [state, action, sending] = useActionState<SendState, FormData>(sendMfaLink, {});

  useEffect(() => {
    if (!state.sent) return;
    let stopped = false;
    async function check() {
      if (stopped) return;
      if (await checkSecondStep().catch(() => false)) {
        stopped = true;
        // A full page load: the router may hold a copy of /app from before
        // this step that still redirects to /mfa.
        window.location.replace("/app");
      }
    }
    const timer = window.setInterval(check, 3000);
    window.addEventListener("focus", check);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [state.sent]);
  const address = <strong className="font-semibold [overflow-wrap:anywhere]">{email}</strong>;
  const error = state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>;

  if (!state.sent) {
    return (
      <form action={action} className="grid gap-4">
        {error}
        <p className="text-muted">{t.rich("sendLead", { email: () => <span className="text-foreground">{address}</span> })}</p>
        <div>
          <SubmitButton pendingLabel={tAuth("pending")}>{t("send")}</SubmitButton>
        </div>
      </form>
    );
  }

  return (
    <div className="grid gap-4">
      <FormAlert kind="success">{t.rich("sent", { email: () => address })}</FormAlert>
      {error}
      <ol className="grid list-decimal gap-2 pl-5 text-muted">
        <li>{t("step1")}</li>
        <li>{t("step2")}</li>
      </ol>
      <p role="status" className="text-sm text-muted">{t("waiting")}</p>
      <form action={action}>
        <button type="submit" disabled={sending} className={secondaryButtonClass}>
          {sending ? tAuth("pending") : t("resend")}
        </button>
      </form>
    </div>
  );
}
