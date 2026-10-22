"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { FormAlert } from "@/components/form";
import { decide, loadRequest, type Request } from "./actions";

type View = { status: "loading" } | Request | { status: "declined" | "error" };

const primaryClass =
  "flex min-h-11 items-center justify-center rounded-lg bg-accent px-5 text-base font-semibold text-on-accent hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-70";
const secondaryClass =
  "flex min-h-11 items-center justify-center rounded-lg border border-border px-5 font-medium text-foreground hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";

export function ApprovePanel({ requestId }: { requestId: string }) {
  const t = useTranslations("Approve");
  const format = useFormatter();
  const token = useRef<string | null>(null);
  const [view, setView] = useState<View>({ status: "loading" });
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (token.current !== null) return;
    // The link session's tokens arrive in the URL fragment. Take them and
    // remove them from the address bar and history right away.
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    token.current = fragment.get("access_token") ?? "";
    window.history.replaceState(null, "", window.location.pathname);
    if (!token.current) {
      setView({ status: "invalid" });
      return;
    }
    loadRequest(requestId, token.current).then(setView, () => setView({ status: "error" }));
  }, [requestId]);

  function answer(approve: boolean) {
    startTransition(async () => {
      const decision = await decide(requestId, token.current ?? "", approve).catch(() => ({ result: "error" as const }));
      if (decision.result === "approved" && "openApp" in decision && decision.openApp) {
        // A full page load: the router may hold a copy of /app from before
        // this step that still redirects to /mfa.
        window.location.replace("/app");
        return;
      }
      setView({ status: decision.result === "approved" ? "approved" : decision.result });
    });
  }

  switch (view.status) {
    case "loading":
      return <p role="status" className="text-muted">{t("loading")}</p>;
    case "ready":
      return (
        <div className="grid gap-5">
          <p className="text-muted">{t("lead")}</p>
          <dl className="grid gap-3 rounded-xl border border-border bg-surface p-5">
            <div className="grid gap-0.5">
              <dt className="text-sm text-muted">{t("device")}</dt>
              <dd className="font-medium">{view.device ?? t("unknownDevice")}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-sm text-muted">{t("time")}</dt>
              <dd className="font-medium">
                {format.dateTime(new Date(view.createdAt), { dateStyle: "medium", timeStyle: "short" })}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={pending} onClick={() => answer(true)} className={primaryClass}>
              {pending ? t("pending") : t("approve")}
            </button>
            <button type="button" disabled={pending} onClick={() => answer(false)} className={secondaryClass}>
              {t("decline")}
            </button>
          </div>
        </div>
      );
    case "approved":
      return <FormAlert kind="success">{t("approved")}</FormAlert>;
    case "declined":
      return <FormAlert kind="error">{t("declined")}</FormAlert>;
    case "expired":
      return <FormAlert kind="error">{t("expired")}</FormAlert>;
    case "invalid":
      return <FormAlert kind="error">{t("invalid")}</FormAlert>;
    default:
      return <FormAlert kind="error">{t("error")}</FormAlert>;
  }
}
