"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useActionState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import type { AuthFormState } from "./validation";

type Props = {
  mode: "signIn" | "signUp";
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  initialError?: AuthFormState["error"];
  // Signing up from a personal invitation link: the account joins that company.
  invite?: string;
  // Where to go after signing in (a path on this site).
  next?: string;
  // Replaces the default heading, for example on an invitation page.
  intro?: ReactNode;
  // Link to the other form (sign in / sign up), kept on the same invitation.
  switchHref?: string;
};

export function AuthForm({ mode, action, initialError, invite, next, intro, switchHref }: Props) {
  const t = useTranslations("Auth");
  const tNav = useTranslations("Nav");
  const [state, formAction] = useActionState(action, { error: initialError });
  const isSignUp = mode === "signUp";

  if (state.checkEmail) {
    return (
      <div className="grid gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{t("checkEmailTitle")}</h1>
        <FormAlert kind="success">
          {t(invite ? "checkEmailInviteBody" : "checkEmailBody", { email: state.values?.email ?? "" })}
        </FormAlert>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {intro ?? (
        <div className="grid gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {isSignUp ? t("signupTitle") : t("loginTitle")}
          </h1>
          {isSignUp && <p className="text-muted">{t("signupLead")}</p>}
        </div>
      )}

      <form action={formAction} noValidate className="grid gap-5 rounded-xl border border-border bg-surface p-5 sm:p-6">
        {state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}
        {invite && <input type="hidden" name="invite" value={invite} />}
        {next && <input type="hidden" name="next" value={next} />}
        {isSignUp && (
          <>
            <Field
              name="firstName"
              label={t("firstName")}
              autoComplete="given-name"
              autoCapitalize="words"
              maxLength={100}
              required
              defaultValue={state.values?.firstName}
              error={state.fieldErrors?.firstName && t(`errors.${state.fieldErrors.firstName}`)}
            />
            <Field
              name="lastName"
              label={t("lastName")}
              autoComplete="family-name"
              autoCapitalize="words"
              maxLength={100}
              required
              defaultValue={state.values?.lastName}
              error={state.fieldErrors?.lastName && t(`errors.${state.fieldErrors.lastName}`)}
            />
          </>
        )}
        <Field
          name="email"
          type="email"
          label={t("email")}
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={state.values?.email}
          error={state.fieldErrors?.email && t(`errors.${state.fieldErrors.email}`)}
        />
        <Field
          name="password"
          type="password"
          label={t("password")}
          autoComplete={isSignUp ? "new-password" : "current-password"}
          minLength={isSignUp ? 10 : undefined}
          required
          hint={isSignUp ? t("passwordHint") : undefined}
          error={state.fieldErrors?.password && t(`errors.${state.fieldErrors.password}`)}
        />
        {!isSignUp && (
          <Link
            href="/forgot-password"
            className="-my-2 inline-flex min-h-11 w-fit items-center text-sm font-medium text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {t("forgotLink")}
          </Link>
        )}
        <SubmitButton pendingLabel={t("pending")}>{isSignUp ? t("signupSubmit") : t("loginSubmit")}</SubmitButton>
      </form>

      <p className="text-muted">
        {isSignUp ? t("haveAccount") : t("noAccount")}{" "}
        <Link
          href={switchHref ?? (isSignUp ? "/login" : "/signup")}
          className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {isSignUp ? tNav("login") : tNav("signup")}
        </Link>
      </p>
    </div>
  );
}
