"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormAlert } from "@/components/form";
import { CheckCircleIcon, XCircleIcon } from "@/components/icons";
import { answerJobRequest, type AnswerState } from "./actions";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const primary = `flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 font-semibold text-on-accent hover:bg-accent/90 disabled:opacity-70 ${focusRing}`;
const secondary = `flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 font-semibold hover:bg-accent-soft disabled:opacity-70 ${focusRing}`;

// Accept (goes on to the job form) or decline, with an optional message to the
// customer. Declining asks once more, because it cannot be undone.
export function AnswerForm({ request, name, hasEmail }: { request: string; name: string; hasEmail: boolean }) {
  const t = useTranslations("JobRequests");
  const [state, action, pending] = useActionState<AnswerState, FormData>(answerJobRequest, {});
  const [confirming, setConfirming] = useState(false);
  const messageId = `answer-${request}`;

  return (
    <form action={action} className="grid gap-3 border-t border-border pt-3">
      <input type="hidden" name="request" value={request} />
      <div className="grid gap-1.5">
        <label htmlFor={messageId} className="font-medium">
          {t("messageLabel")}
        </label>
        <textarea
          id={messageId}
          name="message"
          rows={3}
          maxLength={1000}
          aria-describedby={`${messageId}-hint`}
          className={`min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base text-foreground ${focusRing}`}
        />
        <p id={`${messageId}-hint`} className="text-sm text-muted">
          {hasEmail ? t("messageHintEmail") : t("messageHintPhone")}
        </p>
      </div>
      <div aria-live="polite">{state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}</div>
      {confirming ? (
        <div className="grid gap-3 rounded-lg border border-danger/40 bg-danger-soft p-3">
          <p className="font-medium text-danger [overflow-wrap:anywhere]">{t("declineConfirm", { name })}</p>
          <div className="grid gap-2 sm:flex">
            <button type="submit" name="decision" value="decline" disabled={pending} className={`${secondary} text-danger`}>
              <XCircleIcon className="size-5" />
              {pending ? t("answering") : t("declineYes")}
            </button>
            <button type="button" disabled={pending} onClick={() => setConfirming(false)} className={`${secondary} text-foreground`}>
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 sm:flex">
          <button type="submit" name="decision" value="accept" disabled={pending} className={primary}>
            <CheckCircleIcon className="size-5" />
            {pending ? t("answering") : t("accept")}
          </button>
          <button type="button" disabled={pending} onClick={() => setConfirming(true)} className={`${secondary} text-danger`}>
            <XCircleIcon className="size-5" />
            {t("decline")}
          </button>
        </div>
      )}
    </form>
  );
}
