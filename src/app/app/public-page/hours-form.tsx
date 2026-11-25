"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useActionState } from "react";
import { FieldError, FormAlert, SubmitButton } from "@/components/form";
import { CalendarIcon, CheckIcon, TrashIcon } from "@/components/icons";
import { bookingLengths, MAX_DAY_OFF_NOTE_LENGTH, slotSteps, type HoursValues } from "@/lib/company-hours";
import { addDayOff, removeDayOff, saveCompanyHours, type DayOffState, type HoursState } from "./hours-actions";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const control = `min-h-11 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-base text-foreground ${focusRing} aria-invalid:border-danger`;
const choice =
  "relative flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-accent";

// A Monday, so weekday n is this date + n - 1; only the name is shown.
const MONDAY = Date.UTC(2026, 10, 23, 12);

// Free times on or off, how long a booking is, and the opening hours of the week.
export function HoursForm({ initial }: { initial: HoursValues }) {
  const t = useTranslations("CompanyHours");
  const tAuth = useTranslations("Auth");
  const format = useFormatter();
  const [state, action] = useActionState<HoursState, FormData>(saveCompanyHours, {});
  const values = state.values ?? initial;
  const dayName = (weekday: number) => format.dateTime(new Date(MONDAY + (weekday - 1) * 86_400_000), { weekday: "long", timeZone: "UTC" });
  const freeError = state.fieldErrors?.freeTimes;
  const stepError = state.fieldErrors?.stepMinutes;

  return (
    <form action={action} className="grid gap-6">
      <fieldset className="grid gap-2" aria-describedby={freeError ? "free-times-error" : undefined}>
        <legend className="mb-2 font-medium">{t("modeLegend")}</legend>
        {(["on", "off"] as const).map((mode) => (
          <label key={mode} className={choice}>
            <input
              type="radio"
              name="freeTimes"
              value={mode}
              defaultChecked={(mode === "on") === values.freeTimes}
              aria-labelledby={`mode-${mode}-label`}
              aria-describedby={`mode-${mode}-hint`}
              className="peer absolute -inset-px m-0 cursor-pointer appearance-none rounded-lg opacity-0"
            />
            <span
              aria-hidden="true"
              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-muted bg-surface text-transparent peer-checked:border-accent peer-checked:bg-accent peer-checked:text-on-accent"
            >
              <CheckIcon className="size-4" />
            </span>
            <span className="grid min-w-0 gap-0.5">
              <span id={`mode-${mode}-label`} className="font-medium">
                {mode === "on" ? t("modeOn") : t("modeOff")}
              </span>
              <span id={`mode-${mode}-hint`} className="text-sm text-muted">
                {mode === "on" ? t("modeOnHint") : t("modeOffHint")}
              </span>
            </span>
          </label>
        ))}
        {freeError && <FieldError id="free-times-error">{t(`errors.${freeError}`)}</FieldError>}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid content-start gap-1.5">
        <label htmlFor="booking-minutes" className="font-medium">
          {t("length")}
        </label>
        <select key={values.bookingMinutes} id="booking-minutes" name="bookingMinutes" defaultValue={values.bookingMinutes} className={control}>
          {bookingLengths.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes === 480 ? t("lengthDay") : t("lengthHours", { hours: minutes / 60 })}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted">{t("lengthHint")}</p>
      </div>
      <div className="grid content-start gap-1.5">
        <label htmlFor="step-minutes" className="font-medium">
          {t("step")}
        </label>
        <select
          key={values.stepMinutes}
          id="step-minutes"
          name="stepMinutes"
          defaultValue={values.stepMinutes}
          aria-describedby={stepError ? "step-minutes-hint step-minutes-error" : "step-minutes-hint"}
          aria-invalid={stepError ? true : undefined}
          className={control}
        >
          {slotSteps.map((minutes) => (
            <option key={minutes} value={minutes}>
              {t("stepMinutes", { minutes })}
            </option>
          ))}
        </select>
        <p id="step-minutes-hint" className="text-sm text-muted">{t("stepHint")}</p>
        {stepError && <FieldError id="step-minutes-error">{t(`errors.${stepError}`)}</FieldError>}
      </div>
      </div>

      <fieldset className="grid gap-3">
        <legend className="mb-1 font-medium">{t("weekLegend")}</legend>
        <p className="-mt-1 text-sm text-muted">{t("weekHint")}</p>
        <ul className="grid gap-2">
          {values.week.map((day) => {
            const error = state.dayErrors?.[day.weekday];
            const name = dayName(day.weekday);
            return (
              <li key={`${day.weekday}-${state.values ? "s" : "i"}`} className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-background p-3 sm:grid-cols-[minmax(0,12rem)_1fr_1fr] sm:items-center">
                {/* The real checkbox covers the whole row, so all of it is the tap target. */}
                <label className="relative col-span-2 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg sm:col-span-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-accent">
                  <input
                    type="checkbox"
                    name={`open-${day.weekday}`}
                    defaultChecked={day.open}
                    aria-label={t("openOn", { day: name })}
                    className="peer absolute -inset-px m-0 cursor-pointer appearance-none rounded-lg opacity-0"
                  />
                  <span
                    aria-hidden="true"
                    className="flex size-6 shrink-0 items-center justify-center rounded-md border-2 border-muted bg-surface text-transparent peer-checked:border-accent peer-checked:bg-accent peer-checked:text-on-accent"
                  >
                    <CheckIcon className="size-4" />
                  </span>
                  <span aria-hidden="true" className="font-medium first-letter:uppercase">
                    {name}
                  </span>
                </label>
                <label className="grid min-w-0 gap-1 text-sm text-muted">
                  <span>
                    {t("opens")}
                    <span className="sr-only"> {name}</span>
                  </span>
                  <input
                    type="time"
                    name={`opens-${day.weekday}`}
                    defaultValue={day.opens}
                    aria-invalid={error ? true : undefined}
                    className={control}
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-sm text-muted">
                  <span>
                    {t("closes")}
                    <span className="sr-only"> {name}</span>
                  </span>
                  <input
                    type="time"
                    name={`closes-${day.weekday}`}
                    defaultValue={day.closes}
                    aria-invalid={error ? true : undefined}
                    className={control}
                  />
                </label>
                {error && (
                  <div className="col-span-2 sm:col-span-3">
                    <FieldError id={`day-${day.weekday}-error`}>{t(`errors.${error}`)}</FieldError>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div aria-live="polite" className="grid gap-2">
        {state.savedAt && <FormAlert kind="success">{values.freeTimes ? t("savedOn") : t("savedOff")}</FormAlert>}
        {state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}
      </div>
      <div>
        <SubmitButton pendingLabel={tAuth("pending")}>{t("save")}</SubmitButton>
      </div>
    </form>
  );
}

function RemoveDayOff({ day, label }: { day: string; label: string }) {
  const t = useTranslations("CompanyHours");
  const [state, action, pending] = useActionState<DayOffState, FormData>(removeDayOff, {});
  return (
    <form action={action} className="grid gap-1">
      <input type="hidden" name="day" value={day} />
      <button
        type="submit"
        disabled={pending}
        aria-label={t("removeDay", { day: label })}
        className={`flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-danger hover:bg-accent-soft disabled:opacity-40 ${focusRing}`}
      >
        <TrashIcon />
      </button>
      {state.error && <span className="sr-only" role="alert">{t(`errors.${state.error}`)}</span>}
    </form>
  );
}

// Holidays and other closed days: no free times are shown on them.
export function DaysOffForm({ days, minDate }: { days: { day: string; note: string | null }[]; minDate: string }) {
  const t = useTranslations("CompanyHours");
  const format = useFormatter();
  const [state, action, pending] = useActionState<DayOffState, FormData>(addDayOff, {});
  const label = (day: string) =>
    format.dateTime(new Date(`${day}T12:00:00Z`), { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="grid gap-4">
      {days.length > 0 ? (
        <ul className="grid gap-2">
          {days.map((day) => (
            <li key={day.day} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
              <span className="flex min-w-0 items-start gap-2">
                <CalendarIcon className="mt-0.5 size-5 shrink-0 text-muted" />
                <span className="grid min-w-0">
                  <span className="font-medium first-letter:uppercase">{label(day.day)}</span>
                  {/* The note is the company's own text, shown as written. */}
                  {day.note && <span className="text-sm text-muted [overflow-wrap:anywhere]">{day.note}</span>}
                </span>
              </span>
              <RemoveDayOff day={day.day} label={label(day.day)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{t("noDaysOff")}</p>
      )}
      <form action={action} className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_1fr_auto] sm:items-end">
        <div className="grid gap-1.5">
          <label htmlFor="day-off" className="font-medium">
            {t("dayOff")}
          </label>
          <input id="day-off" name="day" type="date" min={minDate} required className={`${control} [&::-webkit-date-and-time-value]:text-left`} />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="day-off-note" className="font-medium">
            {t("dayOffNote")}
          </label>
          <input id="day-off-note" name="note" maxLength={MAX_DAY_OFF_NOTE_LENGTH} placeholder={t("dayOffNotePlaceholder")} className={control} />
        </div>
        <button
          type="submit"
          disabled={pending}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 font-semibold text-accent hover:bg-accent-soft disabled:opacity-70 ${focusRing}`}
        >
          {pending ? t("adding") : t("addDay")}
        </button>
      </form>
      <div aria-live="polite">{state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}</div>
    </div>
  );
}
