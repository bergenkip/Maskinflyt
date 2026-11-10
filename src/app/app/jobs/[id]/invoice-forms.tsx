"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { MAX_INVOICE_REFERENCE_LENGTH } from "@/lib/invoice";
import { issueInvoice, markInvoiceSent, unmarkInvoiceSent, type IssueState, type MarkState } from "../invoice-actions";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// After sending the invoice from the accounting system: mark the draft as sent.
export function MarkSentForm({ job }: { job: string }) {
  const t = useTranslations("Invoice");
  const tAuth = useTranslations("Auth");
  const [state, action] = useActionState<MarkState, FormData>(markInvoiceSent, {});
  return (
    <form action={action} noValidate className="grid gap-4">
      <input type="hidden" name="job" value={job} />
      <div aria-live="polite">
        {state.error && state.error !== "referenceTooLong" && <FormAlert kind="error">{t(`markErrors.${state.error}`)}</FormAlert>}
      </div>
      <Field
        name="reference"
        id={`invoice-reference-${job}`}
        label={t("reference")}
        hint={t("referenceHint")}
        maxLength={MAX_INVOICE_REFERENCE_LENGTH}
        autoComplete="off"
        defaultValue={state.reference}
        error={state.error === "referenceTooLong" ? t("markErrors.referenceTooLong") : undefined}
      />
      <div>
        <SubmitButton pendingLabel={tAuth("pending")}>{t("markSent")}</SubmitButton>
      </div>
    </form>
  );
}

// A mark made by mistake: the draft opens again.
export function UnmarkSentForm({ job }: { job: string }) {
  const t = useTranslations("Invoice");
  const [state, action, pending] = useActionState<MarkState, FormData>(unmarkInvoiceSent, {});
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="job" value={job} />
      <div aria-live="polite">{state.error && <FormAlert kind="error">{t(`markErrors.${state.error}`)}</FormAlert>}</div>
      <button
        type="submit"
        disabled={pending}
        className={`flex min-h-11 items-center justify-center rounded-lg border border-danger/40 px-4 font-semibold text-danger hover:bg-danger-soft disabled:opacity-70 sm:justify-self-start ${focusRing}`}
      >
        {pending ? t("unmarking") : t("unmark")}
      </button>
    </form>
  );
}

// Issuing cannot be undone, so the button asks once more before it issues.
export function IssueInvoiceForm({ job }: { job: string }) {
  const t = useTranslations("Invoice");
  const tAuth = useTranslations("Auth");
  const [state, action] = useActionState<IssueState, FormData>(issueInvoice, {});
  const [sure, setSure] = useState(false);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="job" value={job} />
      <div aria-live="polite">
        {state.error && <FormAlert kind="error">{t(`issueErrors.${state.error}`)}</FormAlert>}
        {state.pdfFailed && <FormAlert kind="error">{t("pdfFailed")}</FormAlert>}
      </div>
      {sure ? (
        <div className="grid gap-3 rounded-lg border border-warning/50 bg-warning-soft p-3">
          <p className="font-medium">{t("issueConfirm")}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <SubmitButton pendingLabel={tAuth("pending")}>{t("issueNow")}</SubmitButton>
            <button
              type="button"
              onClick={() => setSure(false)}
              className={`flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface px-4 font-semibold hover:bg-background ${focusRing}`}
            >
              {t("issueCancel")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setSure(true)}
          className={`flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 font-semibold text-on-accent hover:bg-accent/90 sm:justify-self-start ${focusRing}`}
        >
          {t("issue")}
        </button>
      )}
    </form>
  );
}
