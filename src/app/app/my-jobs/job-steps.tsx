"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormAlert } from "@/components/form";
import { MAX_NOTE_LENGTH, nextSteps, type JobProgress, type JobStep } from "@/lib/progress";
import { progressIcon } from "../jobs/progress-badge";
import { addNote, recordStep, type NoteState, type StepState } from "./actions";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const big = `flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-4 text-lg font-semibold disabled:opacity-70 ${focusRing}`;

// The big buttons on a job: the next step first, a break beside it. Finishing
// asks once more, since it closes the job for the office.
export function StepButtons({ job, progress }: { job: string; progress: JobProgress | null }) {
  const t = useTranslations("MyJobs");
  const [state, action, pending] = useActionState<StepState, FormData>(recordStep, {});
  const [confirming, setConfirming] = useState(false);
  const steps = nextSteps(progress);
  if (steps.length === 0) return null;

  const button = (step: JobStep, main: boolean) => {
    const Icon = progressIcon[step];
    const look = main
      ? "bg-accent text-on-accent hover:bg-accent/90"
      : "border border-border bg-surface text-foreground hover:bg-accent-soft";
    if (step === "finished" && !confirming) {
      return (
        <button key={step} type="button" onClick={() => setConfirming(true)} className={`${big} ${look}`}>
          <Icon className="size-6" />
          {t(`steps.${step}`)}
        </button>
      );
    }
    return (
      <button key={step} type="submit" name="step" value={step} disabled={pending} className={`${big} ${look}`}>
        <Icon className="size-6" />
        {step === "finished" ? t("confirmFinish") : t(`steps.${step}`)}
      </button>
    );
  };

  return (
    <form action={action} className="grid gap-2" onSubmit={() => setConfirming(false)}>
      <input type="hidden" name="job" value={job} />
      {confirming ? (
        <div className="grid gap-2 rounded-xl border border-border bg-background p-3">
          <p className="font-medium">{t("finishQuestion")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {button("finished", true)}
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className={`${big} border border-border bg-surface text-foreground hover:bg-accent-soft`}
            >
              {t("notYet")}
            </button>
          </div>
        </div>
      ) : (
        <div className={`grid gap-2 ${steps.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {steps.map((step, i) => button(step, i === 0))}
        </div>
      )}
      <div aria-live="polite">{state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}</div>
    </form>
  );
}

// A note from the site, kept with the job's steps for the office.
export function NoteForm({ job }: { job: string }) {
  const t = useTranslations("MyJobs");
  const [state, action, pending] = useActionState<NoteState, FormData>(addNote, {});
  const id = `note-${job}`;
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="job" value={job} />
      <label htmlFor={id} className="font-medium">
        {t("noteLabel")}
      </label>
      <textarea
        // A new empty box after each saved note.
        key={state.savedAt ?? "draft"}
        id={id}
        name="note"
        rows={3}
        maxLength={MAX_NOTE_LENGTH}
        defaultValue={state.error ? state.note : ""}
        aria-invalid={state.error === "noteInvalid" ? true : undefined}
        aria-describedby={`${id}-hint`}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-invalid:border-danger"
      />
      <p id={`${id}-hint`} className="text-sm text-muted">
        {t("noteHint")}
      </p>
      <div aria-live="polite" className="grid gap-2">
        {state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}
        {state.savedAt && <FormAlert kind="success">{t("noteSaved")}</FormAlert>}
      </div>
      <button
        type="submit"
        disabled={pending}
        className={`min-h-11 rounded-lg border border-border bg-surface px-4 font-semibold hover:bg-accent-soft disabled:opacity-70 sm:justify-self-start ${focusRing}`}
      >
        {t("saveNote")}
      </button>
    </form>
  );
}
