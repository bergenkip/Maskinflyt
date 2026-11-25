"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { Field, FieldError, FormAlert, SubmitButton } from "@/components/form";
import { CheckCircleIcon, UserIcon } from "@/components/icons";
import type { Service } from "@/lib/company-page";
import { groupSlots, type FreeSlot } from "@/lib/company-hours";
import {
  MAX_REQUEST_DESCRIPTION_LENGTH,
  MAX_REQUEST_NAME_LENGTH,
  MAX_REQUEST_PLACE_LENGTH,
  type JobRequestValues,
} from "@/lib/job-requests";
import { submitJobRequest, type RequestState } from "./request-actions";

const control =
  "min-h-11 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-invalid:border-danger";

// The customer's request to the company. No account: a phone or an e-mail is
// enough for the company to answer. Nothing is booked until the company says so.
export function RequestForm({
  slug,
  company,
  services,
  slots,
  customer = null,
  minDate,
  maxDate,
}: {
  slug: string;
  company: string;
  services: { value: Service; label: string }[];
  slots: FreeSlot[] | null;
  customer?: { name: string; prefill: Partial<JobRequestValues> } | null;
  minDate: string;
  maxDate: string;
}) {
  const t = useTranslations("JobRequestForm");
  const [state, action] = useActionState<RequestState, FormData>(submitJobRequest, {});
  // What the action sent back, or else the signed-in customer's details.
  const values: Partial<JobRequestValues> | undefined = state.values ?? customer?.prefill;
  const router = useRouter();
  // A time someone else just took: load the free times again.
  const slotTaken = state.fieldErrors?.wantedStart === "slotTaken";
  useEffect(() => {
    if (slotTaken) router.refresh();
  }, [slotTaken, state, router]);
  const error = (field: keyof NonNullable<RequestState["fieldErrors"]>) => {
    const code = state.fieldErrors?.[field];
    return code ? t(`errors.${code}`) : undefined;
  };

  if (state.sent) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-xl border border-success/40 bg-success-soft p-4 text-success">
        <CheckCircleIcon className="mt-0.5 size-6 shrink-0" />
        <div className="grid gap-1">
          <p className="font-semibold">{t("sentTitle")}</p>
          <p className="text-foreground [overflow-wrap:anywhere]">{t("sentText", { company })}</p>
          {customer && (
            <Link
              href="/kunde"
              className="flex min-h-11 w-fit items-center font-semibold text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {t("seeMyRequests")}
            </Link>
          )}
        </div>
      </div>
    );
  }

  const showSlots = slots !== null && slots.length > 0;
  const serviceError = error("service");
  const dateError = error("wantedDate");
  const descriptionError = error("description");
  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="slug" value={slug} />
      {state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}
      {customer ? (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-background p-3 text-sm">
          <UserIcon className="mt-0.5 size-4 shrink-0 text-muted" />
          <span className="[overflow-wrap:anywhere]">{t("signedInAs", { name: customer.name })}</span>
        </p>
      ) : (
        <CustomerInvite slug={slug} />
      )}

      <Field
        name="name"
        id="request-name"
        label={t("name")}
        autoComplete="name"
        maxLength={MAX_REQUEST_NAME_LENGTH}
        defaultValue={values?.name}
        error={error("name")}
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="phone"
          id="request-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          label={t("phone")}
          defaultValue={values?.phone}
          error={error("phone")}
        />
        <Field
          name="email"
          id="request-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          label={t("email")}
          defaultValue={values?.email}
          error={error("email")}
        />
      </div>
      <p className="-mt-2 text-sm text-muted">{t("contactHint")}</p>

      <Field
        name="place"
        id="request-place"
        label={t("place")}
        hint={t("placeHint")}
        autoComplete="street-address"
        maxLength={MAX_REQUEST_PLACE_LENGTH}
        defaultValue={values?.place}
        error={error("place")}
        required
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {services.length > 0 && (
          <div className="grid min-w-0 content-start gap-1.5">
            <label htmlFor="request-service" className="font-medium">
              {t("service")}
            </label>
            {/* A new key renders the select again with what the action sent back. */}
            <select
              key={values?.service ?? ""}
              id="request-service"
              name="service"
              defaultValue={values?.service ?? ""}
              aria-invalid={serviceError ? true : undefined}
              aria-describedby={serviceError ? "request-service-error" : undefined}
              className={control}
            >
              <option value="">{t("serviceAny")}</option>
              {services.map((service) => (
                <option key={service.value} value={service.value}>
                  {service.label}
                </option>
              ))}
            </select>
            {serviceError && <FieldError id="request-service-error">{serviceError}</FieldError>}
          </div>
        )}
        {!showSlots && (
          <div className="grid min-w-0 content-start gap-1.5">
            <label htmlFor="request-date" className="font-medium">
              {t("date")}
            </label>
            <input
              id="request-date"
              name="wantedDate"
              type="date"
              min={minDate}
              max={maxDate}
              defaultValue={values?.wantedDate}
              aria-invalid={dateError ? true : undefined}
              aria-describedby={`request-date-hint${dateError ? " request-date-error" : ""}`}
              className={`${control} [&::-webkit-date-and-time-value]:text-left`}
            />
            <p id="request-date-hint" className="text-sm text-muted">
              {t("dateHint")}
            </p>
            {dateError && <FieldError id="request-date-error">{dateError}</FieldError>}
          </div>
        )}
      </div>
      {slots !== null && slots.length === 0 && <p className="-mt-2 text-sm text-muted">{t("noTimes")}</p>}
      {showSlots && <SlotPicker slots={slots} from={minDate} initial={values?.wantedStart ?? ""} error={error("wantedStart")} />}

      <div className="grid gap-1.5">
        <label htmlFor="request-description" className="font-medium">
          {t("description")}
        </label>
        <textarea
          id="request-description"
          name="description"
          rows={5}
          maxLength={MAX_REQUEST_DESCRIPTION_LENGTH}
          defaultValue={values?.description}
          required
          aria-invalid={descriptionError ? true : undefined}
          aria-describedby={`request-description-hint${descriptionError ? " request-description-error" : ""}`}
          className={`${control} py-2.5`}
        />
        <p id="request-description-hint" className="text-sm text-muted">
          {t("descriptionHint")}
        </p>
        {descriptionError && <FieldError id="request-description-error">{descriptionError}</FieldError>}
      </div>

      {/* For form robots only: people neither see nor reach this field. */}
      <div aria-hidden="true" className="invisible absolute size-0 overflow-hidden">
        <label htmlFor="request-company-website">{t("trap")}</label>
        <input id="request-company-website" name="company_website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <p className="text-sm text-muted [overflow-wrap:anywhere]">
        {t.rich("privacy", {
          company,
          link: (chunks) => (
            <Link href="/personvern" className="font-medium text-accent underline underline-offset-4">
              {chunks}
            </Link>
          ),
        })}
      </p>
      <div>
        <SubmitButton pendingLabel={t("sending")}>{t("send")}</SubmitButton>
      </div>
    </form>
  );
}

// The next two weeks as a small month calendar (Li, 2026-11-25): open days with
// free times (blue dot), full days (grey dot) and closed days (struck through),
// each also said in words. A tapped day shows its times: free ones to pick, taken
// ones marked "Taken". "No particular time" sends none.
const WINDOW_DAYS = 14;

function SlotPicker({ slots, from, initial, error }: { slots: FreeSlot[]; from: string; initial: string; error?: string }) {
  const t = useTranslations("JobRequestForm");
  const format = useFormatter();
  const byDay = new Map(groupSlots(slots).map((d) => [d.day, d.slots]));
  const isFree = (slot: FreeSlot) => slot.free !== false;
  const initialDay = slots.find((slot) => slot.starts_at === initial)?.day ?? "";
  const [day, setDay] = useState(initialDay);

  // Dates are plain YYYY-MM-DD strings, read at noon UTC so no time zone moves them a day.
  const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const plus = (date: string, days: number) => iso(new Date(at(date).getTime() + days * 86_400_000));
  const last = plus(from, WINDOW_DAYS - 1);
  const months = [...new Set([from.slice(0, 7), last.slice(0, 7)])];
  const [month, setMonth] = useState(initialDay.slice(0, 7) || months[0]);
  const monthIndex = months.indexOf(month);

  const dayLabel = (date: string) =>
    format.dateTime(at(date), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  type DayKind = "free" | "full" | "closed" | "outside";
  const kindOf = (date: string): DayKind => {
    if (date < from || date > last) return "outside";
    const times = byDay.get(date);
    if (!times) return "closed";
    return times.some(isFree) ? "free" : "full";
  };
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1, 12));
  const lead = (first.getUTCDay() + 6) % 7; // Monday first, as in Norway
  const length = new Date(Date.UTC(year, monthNumber, 0, 12)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  // Weekday names from a known Monday (2024-01-01).
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    format.dateTime(new Date(Date.UTC(2024, 0, 1 + i, 12)), { weekday: "short", timeZone: "UTC" }),
  );
  const chosen = byDay.get(day);
  const firstFree = chosen?.find(isFree)?.starts_at;
  const navButton =
    "flex size-11 items-center justify-center rounded-lg text-foreground hover:bg-accent-soft disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  const dot = "inline-block size-1.5 shrink-0 rounded-full";

  return (
    <fieldset className="grid min-w-0 gap-3" aria-describedby={`request-times-hint${error ? " request-times-error" : ""}`}>
      <legend className="mb-1.5 font-medium">{t("times")}</legend>
      <p id="request-times-hint" className="-mt-1 text-sm text-muted">
        {t("timesHint")}
      </p>

      <div className="w-full max-w-sm rounded-xl border border-border p-2 sm:p-3">
        <div className="flex items-center justify-between gap-2">
          <button type="button" className={navButton} onClick={() => setMonth(months[monthIndex - 1])} disabled={monthIndex <= 0} aria-label={t("prevMonth")}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <p aria-live="polite" className="font-semibold first-letter:uppercase">
            {format.dateTime(first, { month: "long", year: "numeric", timeZone: "UTC" })}
          </p>
          <button
            type="button"
            className={navButton}
            onClick={() => setMonth(months[monthIndex + 1])}
            disabled={monthIndex >= months.length - 1}
            aria-label={t("nextMonth")}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
        <div aria-hidden="true" className="mt-1 grid grid-cols-7 text-center text-xs font-medium text-muted uppercase">
          {weekdays.map((name) => (
            <span key={name} className="py-1">
              {name.replace(".", "")}
            </span>
          ))}
        </div>
        <div role="group" aria-label={t("date")} className="grid grid-cols-7">
          {cells.map((cell, index) => {
            if (!cell) return <span key={`blank-${index}`} />;
            const kind = kindOf(cell);
            const selected = cell === day;
            const times = byDay.get(cell) ?? [];
            const label =
              kind === "free"
                ? t("dayFree", { date: dayLabel(cell), count: times.filter(isFree).length })
                : kind === "full"
                  ? t("dayFull", { date: dayLabel(cell) })
                  : kind === "closed"
                    ? t("dayClosed", { date: dayLabel(cell) })
                    : dayLabel(cell);
            const look = selected
              ? "bg-accent font-semibold text-on-accent"
              : kind === "free"
                ? "font-semibold text-foreground hover:bg-accent-soft"
                : kind === "full"
                  ? "text-muted hover:bg-accent-soft"
                  : kind === "closed"
                    ? "text-muted line-through decoration-2"
                    : "text-muted/40";
            return (
              <button
                key={cell}
                type="button"
                data-day={cell}
                data-kind={kind}
                disabled={kind === "closed" || kind === "outside"}
                aria-pressed={kind === "free" || kind === "full" ? selected : undefined}
                aria-label={label}
                onClick={() => setDay(selected ? "" : cell)}
                className={`relative mx-auto flex size-11 items-center justify-center rounded-full tabular-nums focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${look}`}
              >
                {Number(cell.slice(8))}
                {!selected && (kind === "free" || kind === "full") && (
                  <span aria-hidden="true" className={`absolute bottom-1.5 ${dot} ${kind === "free" ? "bg-accent" : "bg-muted/60"}`} />
                )}
              </button>
            );
          })}
        </div>
        <ul aria-hidden="true" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-1 pt-2 text-xs text-muted">
          <li className="flex items-center gap-1.5">
            <span className={`${dot} bg-accent`} />
            <span>{t("legendFree")}</span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className={`${dot} bg-muted/60`} />
            <span>{t("legendFull")}</span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className="line-through decoration-2">12</span>
            <span>{t("legendClosed")}</span>
          </li>
        </ul>
      </div>

      {chosen ? (
        <div className="grid gap-2">
          <p className="font-medium first-letter:uppercase">{dayLabel(day)}</p>
          <div role="radiogroup" aria-label={dayLabel(day)} className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {chosen.map((slot) =>
              isFree(slot) ? (
                <label
                  key={slot.starts_at}
                  className="relative flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface px-2 font-semibold tabular-nums has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-on-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
                >
                  <input
                    type="radio"
                    name="wantedStart"
                    value={slot.starts_at}
                    defaultChecked={initial ? slot.starts_at === initial : slot.starts_at === firstFree}
                    className="absolute -inset-px m-0 cursor-pointer appearance-none rounded-lg opacity-0"
                  />
                  {slot.start_time}
                </label>
              ) : (
                <span
                  key={slot.starts_at}
                  className="flex min-h-11 flex-col items-center justify-center rounded-lg border border-dashed border-border px-1 py-1 text-muted tabular-nums"
                >
                  <span className="leading-tight font-semibold line-through">{slot.start_time}</span>
                  <span className="text-xs leading-tight">{t("taken")}</span>
                </span>
              ),
            )}
          </div>
          {!firstFree && <p className="text-sm text-muted">{t("dayFullHint")}</p>}
          <button
            type="button"
            onClick={() => setDay("")}
            className="flex min-h-11 w-fit items-center font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {t("timeNone")}
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted">{t("pickDay")}</p>
      )}
      {error && <FieldError id="request-times-error">{error}</FieldError>}
    </fieldset>
  );
}

// Not signed in: an invitation to a customer account (stage 16a). Optional: the form works without it.
function CustomerInvite({ slug }: { slug: string }) {
  const t = useTranslations("JobRequestForm");
  const link =
    "flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface px-4 font-semibold text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  return (
    <aside aria-labelledby="customer-invite" className="grid gap-3 rounded-lg border border-accent/40 bg-accent-soft p-4">
      <div className="grid gap-1">
        <h3 id="customer-invite" className="font-semibold">
          {t("inviteTitle")}
        </h3>
        <p className="text-sm">{t("inviteText")}</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href="/signup?konto=kunde" className={link}>
          {t("inviteSignup")}
        </Link>
        <Link href={`/login?${new URLSearchParams({ next: `/firma/${slug}` })}`} className={link}>
          {t("inviteLogin")}
        </Link>
      </div>
    </aside>
  );
}
