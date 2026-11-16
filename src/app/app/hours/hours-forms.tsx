"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { MAX_HOUR_NOTE_LENGTH } from "@/lib/hours";
import {
  createSheet,
  resendSheet,
  saveDay,
  saveHourSettings,
  submitSheet,
  type DayState,
  type HourSettingsState,
  type HourSettingsValues,
  type NewSheetState,
  type SubmitState,
} from "./actions";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const secondaryButton = `flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface px-4 font-semibold hover:bg-background ${focusRing}`;

export function NewSheetForm({ from, to }: { from: string; to: string }) {
  const t = useTranslations("Hours");
  const tAuth = useTranslations("Auth");
  const [state, action] = useActionState<NewSheetState, FormData>(createSheet, {});
  const error = state.error && state.error !== "unknown" && state.error !== "overlap" ? t(`newErrors.${state.error}`) : undefined;
  return (
    <form action={action} noValidate className="grid gap-4">
      <div aria-live="polite">
        {(state.error === "unknown" || state.error === "overlap") && <FormAlert kind="error">{t(`newErrors.${state.error}`)}</FormAlert>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="from" id="sheet-from" type="date" label={t("from")} required defaultValue={state.from ?? from} error={error} />
        <Field name="to" id="sheet-to" type="date" label={t("to")} required defaultValue={state.to ?? to} />
      </div>
      <SubmitButton pendingLabel={tAuth("pending")}>{t("create")}</SubmitButton>
    </form>
  );
}

export function DayForm({ sheet, from, to, firstDay }: { sheet: string; from: string; to: string; firstDay: string }) {
  const t = useTranslations("Hours");
  const tAuth = useTranslations("Auth");
  const [state, action] = useActionState<DayState, FormData>(saveDay, {});
  const values = state.values ?? { day: firstDay, starts: "07:00", ends: "15:00", break: "30", note: "" };
  const error = (field: "day" | "starts" | "ends" | "break" | "note") =>
    state.errors?.includes(field) ? t(`dayErrors.${field}`) : undefined;
  return (
    // The key resets the fields to the saved values (the next day) after each save.
    <form key={state.savedAt ?? "new"} action={action} noValidate className="grid gap-4">
      <input type="hidden" name="sheet" value={sheet} />
      <input type="hidden" name="periodFrom" value={from} />
      <input type="hidden" name="periodTo" value={to} />
      <div aria-live="polite">
        {state.error && <FormAlert kind="error">{t(`dayErrors.${state.error}`)}</FormAlert>}
        {state.savedAt && <FormAlert kind="success">{t("savedDay")}</FormAlert>}
      </div>
      <Field name="day" id="hours-day" type="date" label={t("day")} min={from} max={to} required defaultValue={values.day} error={error("day")} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field name="starts" id="hours-starts" type="time" label={t("starts")} required defaultValue={values.starts} error={error("starts")} />
        <Field name="ends" id="hours-ends" type="time" label={t("ends")} required defaultValue={values.ends} error={error("ends")} />
        <div className="col-span-2 sm:col-span-1">
          <Field
            name="break"
            id="hours-break"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            label={t("break")}
            defaultValue={values.break}
            error={error("break")}
          />
        </div>
      </div>
      <p className="-mt-2 text-sm text-muted">{t("endsHint")}</p>
      <Field
        name="note"
        id="hours-note"
        label={t("note")}
        hint={t("noteHint")}
        maxLength={MAX_HOUR_NOTE_LENGTH}
        autoComplete="off"
        defaultValue={values.note}
        error={error("note")}
      />
      <SubmitButton pendingLabel={tAuth("pending")}>{t("saveDay")}</SubmitButton>
    </form>
  );
}

export function SubmitSheetForm({ sheet, count, hours }: { sheet: string; count: number; hours: string }) {
  const t = useTranslations("Hours");
  const tAuth = useTranslations("Auth");
  const [state, action] = useActionState<SubmitState, FormData>(submitSheet, {});
  const [sure, setSure] = useState(false);
  return (
    <form action={action} noValidate className="grid gap-3">
      <input type="hidden" name="sheet" value={sheet} />
      <div aria-live="polite">{state.error && <FormAlert kind="error">{t(`submitErrors.${state.error}`)}</FormAlert>}</div>
      {sure ? (
        <div className="grid gap-3 rounded-lg border border-accent/40 bg-accent-soft p-3">
          <p className="font-medium">{t("confirmSure", { count, hours })}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <SubmitButton pendingLabel={tAuth("pending")}>{t("confirmYes")}</SubmitButton>
            <button type="button" onClick={() => setSure(false)} className={secondaryButton}>
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setSure(true)}
          disabled={count === 0}
          className={`flex min-h-11 w-full items-center justify-center rounded-lg bg-accent px-4 text-base font-semibold text-on-accent hover:bg-accent/90 disabled:opacity-70 sm:w-auto sm:justify-self-start ${focusRing}`}
        >
          {t("confirm")}
        </button>
      )}
    </form>
  );
}

export function ResendSheetForm({ sheet }: { sheet: string }) {
  const t = useTranslations("Hours");
  const tAuth = useTranslations("Auth");
  const [state, action] = useActionState<SubmitState, FormData>(resendSheet, {});
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="sheet" value={sheet} />
      <div aria-live="polite">{state.error && <FormAlert kind="error">{t("submitErrors.unknown")}</FormAlert>}</div>
      <SubmitButton pendingLabel={tAuth("pending")}>{t("resend")}</SubmitButton>
    </form>
  );
}

export function HourSettingsForm({ initial }: { initial: HourSettingsValues }) {
  const t = useTranslations("HourSettings");
  const tAuth = useTranslations("Auth");
  const [state, action] = useActionState<HourSettingsState, FormData>(saveHourSettings, {});
  const values = state.values ?? initial;
  const error = (field: keyof HourSettingsValues) => (state.errors?.includes(field) ? t(`errors.${field}`) : undefined);
  return (
    <form action={action} noValidate className="grid gap-6">
      <div aria-live="polite">
        {state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}
        {state.savedAt && <FormAlert kind="success">{t("saved")}</FormAlert>}
      </div>
      <fieldset className="grid gap-4">
        <legend className="mb-3 font-semibold">{t("level1Title")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="after" id="hours-after" inputMode="decimal" label={t("after")} hint={t("afterHint")} required defaultValue={values.after} error={error("after")} />
          <Field name="percent" id="hours-percent" inputMode="numeric" label={t("percent")} required defaultValue={values.percent} error={error("percent")} />
        </div>
      </fieldset>
      <fieldset className="grid gap-4">
        <legend className="mb-1 font-semibold">{t("level2Title")}</legend>
        <p className="text-sm text-muted">{t("level2Hint")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="after2" id="hours-after2" inputMode="decimal" label={t("after2")} defaultValue={values.after2} error={error("after2")} />
          <Field name="percent2" id="hours-percent2" inputMode="numeric" label={t("percent2")} defaultValue={values.percent2} error={error("percent2")} />
        </div>
      </fieldset>
      <p className="text-sm text-muted">{t("law")}</p>
      <Field
        name="email"
        id="hours-email"
        type="email"
        inputMode="email"
        autoComplete="email"
        label={t("email")}
        hint={t("emailHint")}
        defaultValue={values.email}
        error={error("email")}
      />
      <SubmitButton pendingLabel={tAuth("pending")}>{t("save")}</SubmitButton>
    </form>
  );
}
