"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import {
  requestPasswordReset,
  startPasswordReset,
  updatePassword,
  type ForgotPasswordState,
  type ResetPasswordState,
} from "./password-actions";
import { MIN_PASSWORD_LENGTH } from "./validation";

const linkClass =
  "inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function ForgotPasswordForm() {
  const t = useTranslations("Auth");
  const [state, action] = useActionState<ForgotPasswordState, FormData>(requestPasswordReset, {});

  if (state.sent) {
    return (
      <div className="grid gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{t("checkEmailTitle")}</h1>
        <FormAlert kind="success">{t("resetSent", { email: state.email ?? "" })}</FormAlert>
        <p>
          <Link href="/login" className={linkClass}>
            {t("backToLogin")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{t("forgotTitle")}</h1>
        <p className="text-muted">{t("forgotLead")}</p>
      </div>
      <form action={action} noValidate className="grid gap-5 rounded-xl border border-border bg-surface p-5 sm:p-6">
        {state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}
        <Field
          name="email"
          type="email"
          label={t("email")}
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={state.email}
          error={state.fieldError && t(`errors.${state.fieldError}`)}
        />
        <SubmitButton pendingLabel={t("pending")}>{t("forgotSubmit")}</SubmitButton>
      </form>
      <p>
        <Link href="/login" className={linkClass}>
          {t("backToLogin")}
        </Link>
      </p>
    </div>
  );
}

// Where the e-mailed link lands, in whatever browser or device opened it.
// `email` is the account already signed in here (say, after a reload), if any.
export function ResetPasswordPanel({ email }: { email: string | null }) {
  const t = useTranslations("Auth");
  const started = useRef(false);
  // undefined: still checking the link; null: no valid link or session.
  const [account, setAccount] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // The link's tokens arrive in the URL fragment. Take them and remove them
    // from the address bar and history right away.
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = fragment.get("access_token");
    const refreshToken = fragment.get("refresh_token");
    const failed = fragment.has("error");
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    // Without tokens: a used or expired link says so in the fragment; otherwise a session from earlier may do.
    const result = accessToken && refreshToken ? startPasswordReset(accessToken, refreshToken) : Promise.resolve(failed ? null : email);
    result.then(setAccount, () => setAccount(null));
  }, [email]);

  if (account === undefined) return <p role="status" className="text-muted">{t("resetChecking")}</p>;
  if (account) return <ResetPasswordForm email={account} />;
  return (
    <div className="grid gap-3">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{t("resetTitle")}</h1>
      <FormAlert kind="error">{t("resetNoSession")}</FormAlert>
      <p>
        <Link href="/forgot-password" className={linkClass}>
          {t("forgotSubmit")}
        </Link>
      </p>
    </div>
  );
}

function ResetPasswordForm({ email }: { email: string }) {
  const t = useTranslations("Auth");
  const [state, action] = useActionState<ResetPasswordState, FormData>(updatePassword, {});

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{t("resetTitle")}</h1>
        {/* The address is the signed-in person's own, shown so they know which account changes. */}
        <p className="text-muted [overflow-wrap:anywhere]">{t.rich("resetLead", { email, strong: (chunks) => <strong>{chunks}</strong> })}</p>
      </div>
      <form action={action} noValidate className="grid gap-5 rounded-xl border border-border bg-surface p-5 sm:p-6">
        {state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}
        {/* Lets password managers store the new password under the right account. */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <Field
          name="password"
          type="password"
          label={t("newPassword")}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          hint={t("passwordHint")}
          error={state.fieldError && t(`errors.${state.fieldError}`)}
        />
        <SubmitButton pendingLabel={t("pending")}>{t("resetSubmit")}</SubmitButton>
      </form>
    </div>
  );
}
