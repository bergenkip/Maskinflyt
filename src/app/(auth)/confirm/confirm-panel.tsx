"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { FormAlert } from "@/components/form";
import { confirmSignUp } from "../actions";

// Where the confirmation link lands, in whatever browser or device opened it.
// `signedIn` is true when this browser already has a session (say, after a reload).
export function ConfirmPanel({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("Auth");
  const tNav = useTranslations("Nav");
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // The link's tokens arrive in the URL fragment. Take them and remove them
    // from the address bar and history right away.
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = fragment.get("access_token");
    const refreshToken = fragment.get("refresh_token");
    const linkFailed = fragment.has("error");
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    // Without tokens: a used or expired link says so in the fragment; otherwise a session from earlier may do.
    const result =
      accessToken && refreshToken ? confirmSignUp(accessToken, refreshToken) : Promise.resolve(signedIn && !linkFailed);
    result.then(
      (ok) => (ok ? window.location.replace("/app") : setFailed(true)),
      () => setFailed(true),
    );
  }, [signedIn]);

  if (!failed) return <p role="status" className="text-muted">{t("confirmChecking")}</p>;
  return (
    <div className="grid gap-3">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{t("confirmTitle")}</h1>
      <FormAlert kind="error">{t("confirmFailed")}</FormAlert>
      <p>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {tNav("login")}
        </Link>
      </p>
    </div>
  );
}
