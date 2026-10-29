"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useActionState, useRef, useState, type ReactNode, type Ref } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { AlertIcon, ClockIcon } from "@/components/icons";
import { durationMinuteSteps, MAX_DESCRIPTION_LENGTH, NEW_CUSTOMER, type JobFormValues, type JobStatus } from "@/lib/jobs";
import {
  addJob,
  setJobStatus,
  updateJob,
  type JobFormState,
  type JobStatusState,
  type NewCustomerValues,
} from "./actions";
import type { Suggestion } from "./options";

const selectClass =
  "min-h-11 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-invalid:border-danger";
const secondaryButtonClass =
  "min-h-11 w-full rounded-lg border border-border px-4 font-medium text-foreground hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-70 sm:w-auto";

export type Option = { id: string; name: string; active?: boolean };

type Props = {
  customers: Option[];
  vehicles: Option[];
  drivers: Option[];
  // The machine to suggest when someone is chosen as driver, by user id.
  suggestions: Record<string, Suggestion>;
  timeZone: string;
  // A new job: the values to start from (today's date, a chosen customer).
  initial?: Partial<JobFormValues>;
  // Editing: the job's id and its stored values as text.
  job?: { id: string; values: JobFormValues };
};

export function JobForm({ customers, vehicles, drivers, suggestions, timeZone, initial, job }: Props) {
  const t = useTranslations("Jobs");
  const tAuth = useTranslations("Auth");
  const tCustomers = useTranslations("Customers");
  const format = useFormatter();
  const [state, action] = useActionState<JobFormState, FormData>(job ? updateJob : addJob, {});
  const values: Partial<JobFormValues> = state.values ?? job?.values ?? initial ?? {};
  const error = (key: keyof JobFormValues) => {
    const code = state.fieldErrors?.[key];
    return code && t(`errors.${code}`);
  };
  const customerError = (key: keyof NewCustomerValues) => {
    const code = state.customerFieldErrors?.[key];
    return code && tCustomers(`errors.${code}`);
  };

  // What was chosen since the form was last sent; each answer from the server
  // starts again from the values it sent back.
  const [customerChoice, setCustomerChoice] = useState({ state, value: values.customerId ?? "" });
  const customerId = customerChoice.state === state ? customerChoice.value : (values.customerId ?? "");
  const [suggested, setSuggested] = useState<{ state: JobFormState; driver: string; suggestion: Suggestion } | null>(null);
  const suggestion = suggested?.state === state ? suggested : null;
  const vehicleRef = useRef<HTMLSelectElement>(null);

  // A driver's main (or usual) machine is filled in when no machine is chosen
  // yet, or the one there was filled in the same way; it can still be changed.
  const chooseDriver = (driverId: string) => {
    const next = suggestions[driverId];
    const select = vehicleRef.current;
    if (!next || !select || (select.value !== "" && select.value !== suggestion?.suggestion.vehicleId)) {
      setSuggested(null);
      return;
    }
    select.value = next.vehicleId;
    setSuggested({ state, driver: drivers.find((d) => d.id === driverId)?.name ?? "", suggestion: next });
  };

  const optionLabel = (option: Option) => (option.active === false ? t("inactiveOption", { name: option.name }) : option.name);
  const minuteSteps: string[] = [...durationMinuteSteps];
  if (values.durationMinutes && !minuteSteps.includes(values.durationMinutes)) minuteSteps.push(values.durationMinutes);
  const newCustomer = state.newCustomer;

  return (
    <form action={action} noValidate className="grid gap-6">
      {state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}
      {state.savedAt && <FormAlert kind="success">{t("saved")}</FormAlert>}
      {job && <input type="hidden" name="id" value={job.id} />}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Select
            name="customerId"
            id="job-customer"
            label={t("customer")}
            defaultValue={values.customerId ?? ""}
            onChange={(value) => setCustomerChoice({ state, value })}
            error={error("customerId")}
          >
            <option value="" disabled>
              {t("chooseCustomer")}
            </option>
            <option value={NEW_CUSTOMER}>{t("newCustomerOption")}</option>
            {customers.map((option) => (
              <option key={option.id} value={option.id}>
                {optionLabel(option)}
              </option>
            ))}
          </Select>
        </div>

        {customerId === NEW_CUSTOMER && (
          <fieldset className="grid gap-4 rounded-lg border border-border p-4 sm:col-span-2 sm:grid-cols-2">
            <legend className="px-1 font-semibold">{t("newCustomerTitle")}</legend>
            <p className="-mt-1 text-sm text-muted sm:col-span-2">{t("newCustomerLead")}</p>
            <Select
              name="newCustomerKind"
              id="job-new-customer-kind"
              label={tCustomers("kind")}
              defaultValue={newCustomer?.kind || "company"}
              error={customerError("kind")}
            >
              <option value="company">{tCustomers("kinds.company")}</option>
              <option value="private">{tCustomers("kinds.private")}</option>
            </Select>
            <Field
              name="newCustomerName"
              id="job-new-customer-name"
              label={t("newCustomerName")}
              required
              maxLength={120}
              autoComplete="off"
              defaultValue={newCustomer?.name}
              error={customerError("name")}
            />
            <Field
              name="newCustomerPhone"
              id="job-new-customer-phone"
              type="tel"
              inputMode="tel"
              label={tCustomers("phone")}
              autoComplete="off"
              defaultValue={newCustomer?.phone}
              error={customerError("phone")}
            />
            <Field
              name="newCustomerEmail"
              id="job-new-customer-email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              label={tCustomers("email")}
              autoComplete="off"
              defaultValue={newCustomer?.email}
              error={customerError("email")}
            />
          </fieldset>
        )}

        <div className="sm:col-span-2">
          <Field
            name="address"
            id="job-address"
            label={t("address")}
            hint={t("addressHint")}
            required
            maxLength={200}
            autoComplete="off"
            defaultValue={values.address}
            error={error("address")}
          />
        </div>
        <Field
          name="date"
          id="job-date"
          type="date"
          label={t("date")}
          required
          defaultValue={values.date}
          error={error("date")}
        />
        <Field
          name="startTime"
          id="job-start"
          type="time"
          label={t("startTime")}
          hint={t("timeHint")}
          required
          defaultValue={values.startTime}
          error={error("startTime")}
        />

        <fieldset className="grid gap-1.5 sm:col-span-2" aria-describedby="job-duration-hint">
          <legend className="mb-1.5 font-medium">{t("duration")}</legend>
          <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
            <Field
              name="durationHours"
              id="job-duration-hours"
              label={t("durationHours")}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={2}
              autoComplete="off"
              defaultValue={values.durationHours}
              aria-invalid={error("durationHours") ? true : undefined}
              aria-describedby={error("durationHours") ? "job-duration-error" : undefined}
            />
            <Select
              name="durationMinutes"
              id="job-duration-minutes"
              label={t("durationMinutes")}
              defaultValue={values.durationMinutes || "0"}
            >
              {minuteSteps.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {t("minutesOption", { minutes })}
                </option>
              ))}
            </Select>
          </div>
          <p id="job-duration-hint" className="flex items-start gap-1.5 text-sm text-muted">
            <ClockIcon className="mt-0.5 size-4 shrink-0" />
            {t("durationHint")}
          </p>
          {error("durationHours") && (
            <p id="job-duration-error" className="text-sm font-medium text-danger">
              {error("durationHours")}
            </p>
          )}
        </fieldset>
        <div className="sm:col-span-2">
          <Field
            name="timeNote"
            id="job-time-note"
            label={t("timeNote")}
            hint={t("timeNoteHint")}
            maxLength={200}
            autoComplete="off"
            defaultValue={values.timeNote}
            error={error("timeNote")}
          />
        </div>

        <Select
          name="driverId"
          id="job-driver"
          label={t("driver")}
          defaultValue={values.driverId ?? ""}
          onChange={chooseDriver}
          error={error("driverId")}
        >
          <option value="">{t("notChosen")}</option>
          {drivers.map((option) => (
            <option key={option.id} value={option.id}>
              {optionLabel(option)}
            </option>
          ))}
        </Select>
        <div className="grid content-start gap-1.5">
          <Select
            name="vehicleId"
            id="job-vehicle"
            label={t("vehicle")}
            defaultValue={values.vehicleId ?? ""}
            selectRef={vehicleRef}
            onChange={() => setSuggested(null)}
            error={error("vehicleId")}
          >
            <option value="">{t("notChosen")}</option>
            {vehicles.map((option) => (
              <option key={option.id} value={option.id}>
                {optionLabel(option)}
              </option>
            ))}
          </Select>
          {suggestion && (
            // Person names are data and are shown exactly as entered.
            <p role="status" className="text-sm text-muted [overflow-wrap:anywhere]">
              {t(suggestion.suggestion.reason === "main" ? "vehicleSuggestedMain" : "vehicleSuggestedUsual", {
                name: suggestion.driver,
              })}
            </p>
          )}
        </div>
        <div className="sm:col-span-2">
          <Field
            name="siteContact"
            id="job-site-contact"
            label={t("siteContact")}
            hint={t("siteContactHint")}
            maxLength={100}
            autoComplete="off"
            defaultValue={values.siteContact}
            error={error("siteContact")}
          />
        </div>
        <div className="sm:col-span-2">
          <TextArea
            name="description"
            id="job-description"
            label={t("description")}
            hint={t("descriptionHint")}
            maxLength={MAX_DESCRIPTION_LENGTH}
            defaultValue={values.description}
            error={error("description")}
          />
        </div>
      </div>

      {state.overlaps && state.overlaps.length > 0 && (
        <div role="alert" className="grid gap-2 rounded-lg border border-warning/50 bg-warning-soft p-4 text-foreground">
          <p className="flex items-center gap-2 font-semibold">
            <AlertIcon className="size-5 text-warning" />
            {t("overlapTitle")}
          </p>
          <ul className="grid list-disc gap-1 pl-6">
            {state.overlaps.map((overlap) => (
              // Names are data and are shown exactly as entered.
              <li key={`${overlap.kind}-${overlap.number}`} className="[overflow-wrap:anywhere]">
                {t(overlap.kind === "vehicle" ? "overlapVehicle" : "overlapDriver", {
                  name: overlap.name,
                  number: overlap.number,
                  customer: overlap.customer,
                  time: format.dateTimeRange(new Date(overlap.startsAt), new Date(overlap.endsAt), {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone,
                  }),
                })}
              </li>
            ))}
          </ul>
          <p className="text-muted">{t("overlapLead")}</p>
          <div>
            <button type="submit" name="confirmOverlap" value="1" className={secondaryButtonClass}>
              {t("saveAnyway")}
            </button>
          </div>
        </div>
      )}

      <div>
        <SubmitButton pendingLabel={tAuth("pending")}>{job ? t("save") : t("addSubmit")}</SubmitButton>
      </div>
    </form>
  );
}

function Select({
  name,
  id,
  label,
  defaultValue,
  onChange,
  selectRef,
  error,
  children,
}: {
  name: string;
  id: string;
  label: string;
  defaultValue: string;
  onChange?: (value: string) => void;
  selectRef?: Ref<HTMLSelectElement>;
  error?: string;
  children: ReactNode;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {/* React resets the form after each action, and a select returns to the
          choice it was first rendered with, not a later defaultValue. A new key
          renders it afresh with the values the action sent back. */}
      <select
        key={defaultValue}
        ref={selectRef}
        id={id}
        name={name}
        defaultValue={defaultValue}
        onChange={onChange && ((event) => onChange(event.target.value))}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={selectClass}
      >
        {children}
      </select>
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function TextArea({
  name,
  id,
  label,
  hint,
  maxLength,
  defaultValue,
  error,
}: {
  name: string;
  id: string;
  label: string;
  hint: string;
  maxLength: number;
  defaultValue?: string;
  error?: string;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={4}
        maxLength={maxLength}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
        className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-invalid:border-danger"
      />
      <p id={`${id}-hint`} className="text-sm text-muted">
        {hint}
      </p>
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

// The buttons that move a job along: done, cancelled, or back again.
export function JobStatusForm({ id, status }: { id: string; status: JobStatus }) {
  const t = useTranslations("Jobs");
  const tAuth = useTranslations("Auth");
  const [state, action, pending] = useActionState<JobStatusState, FormData>(setJobStatus, {});
  const moves: { status: "new" | "done" | "cancelled"; label: string; primary?: boolean }[] =
    status === "planned"
      ? [
          { status: "done", label: t("markDone"), primary: true },
          { status: "cancelled", label: t("cancel") },
        ]
      : status === "new"
        ? [{ status: "cancelled", label: t("cancel") }]
        : status === "done"
          ? [{ status: "new", label: t("reopen") }]
          : [{ status: "new", label: t("restore") }];

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="id" value={id} />
      {state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}
      <div className="flex flex-wrap gap-3">
        {moves.map((move) => (
          <button
            key={move.status}
            type="submit"
            name="status"
            value={move.status}
            disabled={pending}
            className={
              move.primary
                ? "min-h-11 w-full rounded-lg bg-accent px-4 font-semibold text-on-accent hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-70 sm:w-auto"
                : secondaryButtonClass
            }
          >
            {pending ? tAuth("pending") : move.label}
          </button>
        ))}
      </div>
    </form>
  );
}
