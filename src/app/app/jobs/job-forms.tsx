"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useActionState, useState, type ReactNode } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { AlertIcon } from "@/components/icons";
import { MAX_DESCRIPTION_LENGTH, type JobFormValues, type JobStatus } from "@/lib/jobs";
import { addJob, setJobStatus, updateJob, type JobFormState, type JobStatusState } from "./actions";

const selectClass =
  "min-h-11 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-invalid:border-danger";
const secondaryButtonClass =
  "min-h-11 w-full rounded-lg border border-border px-4 font-medium text-foreground hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-70 sm:w-auto";

export type Option = { id: string; name: string; active?: boolean };

type Props = {
  customers: Option[];
  vehicles: Option[];
  drivers: Option[];
  timeZone: string;
  // A new job: the values to start from (today's date, a chosen customer).
  initial?: Partial<JobFormValues>;
  // Editing: the job's id and its stored values as text.
  job?: { id: string; values: JobFormValues };
};

export function JobForm({ customers, vehicles, drivers, timeZone, initial, job }: Props) {
  const t = useTranslations("Jobs");
  const tAuth = useTranslations("Auth");
  const format = useFormatter();
  const [state, action] = useActionState<JobFormState, FormData>(job ? updateJob : addJob, {});
  const values: Partial<JobFormValues> = state.values ?? job?.values ?? initial ?? {};
  const error = (key: keyof JobFormValues) => {
    const code = state.fieldErrors?.[key];
    return code && t(`errors.${code}`);
  };
  // Controlled: React resets a form after each action, and an uncontrolled
  // select would fall back to the choice it was first rendered with.
  const [customerId, setCustomerId] = useState(values.customerId ?? "");
  const [vehicleId, setVehicleId] = useState(values.vehicleId ?? "");
  const [driverId, setDriverId] = useState(values.driverId ?? "");
  const optionLabel = (option: Option) => (option.active === false ? t("inactiveOption", { name: option.name }) : option.name);

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
            value={customerId}
            onChange={setCustomerId}
            error={error("customerId")}
          >
            <option value="" disabled>
              {t("chooseCustomer")}
            </option>
            {customers.map((option) => (
              <option key={option.id} value={option.id}>
                {optionLabel(option)}
              </option>
            ))}
          </Select>
        </div>
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
        {/* Phones: the date on its own row, the two times side by side under it. */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:col-span-2 sm:grid-cols-3 sm:gap-x-5">
          <div className="col-span-2 sm:col-span-1">
            <Field
              name="date"
              id="job-date"
              type="date"
              label={t("date")}
              required
              defaultValue={values.date}
              error={error("date")}
            />
          </div>
          <Field
            name="startTime"
            id="job-start"
            type="time"
            label={t("startTime")}
            required
            defaultValue={values.startTime}
            error={error("startTime")}
          />
          <Field
            name="endTime"
            id="job-end"
            type="time"
            label={t("endTime")}
            required
            defaultValue={values.endTime}
            error={error("endTime")}
          />
          <p className="col-span-2 -mt-3 text-sm text-muted sm:col-span-3">{t("timeHint")}</p>
        </div>
        <Select name="vehicleId" id="job-vehicle" label={t("vehicle")} value={vehicleId} onChange={setVehicleId} error={error("vehicleId")}>
          <option value="">{t("notChosen")}</option>
          {vehicles.map((option) => (
            <option key={option.id} value={option.id}>
              {optionLabel(option)}
            </option>
          ))}
        </Select>
        <Select name="driverId" id="job-driver" label={t("driver")} value={driverId} onChange={setDriverId} error={error("driverId")}>
          <option value="">{t("notChosen")}</option>
          {drivers.map((option) => (
            <option key={option.id} value={option.id}>
              {optionLabel(option)}
            </option>
          ))}
        </Select>
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
  value,
  onChange,
  error,
  children,
}: {
  name: string;
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  children: ReactNode;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <select
        id={id}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
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
