"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { CheckIcon } from "@/components/icons";
import { MAX_REASON_LENGTH, type TimeFormValues } from "@/lib/job-time";
import { approveTime, type TimeState } from "../time-actions";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function Hidden({ job, values }: { job: string; values: TimeFormValues }) {
  return (
    <>
      <input type="hidden" name="job" value={job} />
      <input type="hidden" name="date" value={values.date} />
      <input type="hidden" name="start" value={values.start} />
      <input type="hidden" name="end" value={values.end} />
      <input type="hidden" name="breaks" value={values.breaks} />
    </>
  );
}

// Approve the time as the driver pressed it.
export function ApproveTimeForm({ job, values }: { job: string; values: TimeFormValues }) {
  const t = useTranslations("JobTime");
  const [state, action, pending] = useActionState<TimeState, FormData>(approveTime, {});
  return (
    <form action={action} className="grid gap-2">
      <Hidden job={job} values={values} />
      <div aria-live="polite">
        {state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}
        {state.fieldErrors && <FormAlert kind="error">{t("errors.changed")}</FormAlert>}
      </div>
      <button
        type="submit"
        disabled={pending}
        className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 font-semibold text-on-accent hover:bg-accent/90 disabled:opacity-70 sm:w-auto sm:justify-self-start ${focusRing}`}
      >
        <CheckIcon className="size-5" />
        {t("approve")}
      </button>
    </form>
  );
}

// Correct the time (or enter it, when the driver pressed nothing) and say why.
export function CorrectTimeForm({ job, values, submitLabel }: { job: string; values: TimeFormValues; submitLabel: string }) {
  const t = useTranslations("JobTime");
  const tAuth = useTranslations("Auth");
  const [state, action] = useActionState<TimeState, FormData>(approveTime, {});
  const shown = state.values ?? values;
  const error = (key: keyof TimeFormValues) => {
    const code = state.fieldErrors?.[key];
    return code && t(`errors.${code}`);
  };
  const reasonError = error("reason");

  return (
    <form action={action} noValidate className="grid gap-4" key={state.savedAt ?? "draft"}>
      <input type="hidden" name="job" value={job} />
      {state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="date" id={`time-date-${job}`} type="date" label={t("date")} required defaultValue={shown.date} error={error("date")} />
        <Field name="start" id={`time-start-${job}`} type="time" label={t("start")} required defaultValue={shown.start} error={error("start")} />
        <Field
          name="end"
          id={`time-end-${job}`}
          type="time"
          label={t("end")}
          hint={t("endHint")}
          required
          defaultValue={shown.end}
          error={error("end")}
        />
        <Field
          name="breaks"
          id={`time-breaks-${job}`}
          label={t("breaksMinutes")}
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          defaultValue={shown.breaks}
          error={error("breaks")}
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`time-reason-${job}`} className="font-medium">
          {t("reason")}
        </label>
        <textarea
          id={`time-reason-${job}`}
          name="reason"
          rows={2}
          maxLength={MAX_REASON_LENGTH}
          defaultValue={shown.reason}
          aria-invalid={reasonError ? true : undefined}
          aria-describedby={`time-reason-${job}-hint`}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-invalid:border-danger"
        />
        <p id={`time-reason-${job}-hint`} className="text-sm text-muted">
          {t("reasonHint")}
        </p>
        {reasonError && <p className="text-sm font-medium text-danger">{reasonError}</p>}
      </div>
      <div>
        <SubmitButton pendingLabel={tAuth("pending")}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
