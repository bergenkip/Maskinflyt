"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { MAX_LINE_DESCRIPTION_LENGTH, MAX_UNIT_LENGTH, vatRates, type LineFormValues } from "@/lib/invoice";
import { removeLine, saveLine, type LineState } from "../line-actions";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const empty: LineFormValues = { description: "", quantity: "1", unit: "", unitPrice: "", vatRate: "25" };

// Add a line to the job, or change one (with `line`).
export function LineForm({ job, line, values = empty }: { job: string; line?: string; values?: LineFormValues }) {
  const t = useTranslations("Invoice");
  const tAuth = useTranslations("Auth");
  const [state, action] = useActionState<LineState, FormData>(saveLine, {});
  // After adding, the form starts empty again; after changing, it shows the saved line.
  const shown = state.values ?? values;
  const id = (name: string) => `line-${name}-${line ?? `new-${job}`}`;
  const error = (key: keyof LineFormValues) => {
    const code = state.fieldErrors?.[key];
    return code && t(`errors.${code}`);
  };
  const vatError = error("vatRate");

  return (
    <form action={action} noValidate className="grid gap-4" key={state.savedAt ?? "draft"}>
      <input type="hidden" name="job" value={job} />
      {line && <input type="hidden" name="line" value={line} />}
      <div aria-live="polite">
        {state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}
        {state.savedAt && !line && <FormAlert kind="success">{t("added")}</FormAlert>}
      </div>
      <Field
        name="description"
        id={id("description")}
        label={t("description")}
        hint={t("descriptionHint")}
        required
        maxLength={MAX_LINE_DESCRIPTION_LENGTH}
        autoComplete="off"
        defaultValue={shown.description}
        error={error("description")}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="quantity"
          id={id("quantity")}
          label={t("quantity")}
          inputMode="decimal"
          autoComplete="off"
          required
          defaultValue={shown.quantity}
          error={error("quantity")}
        />
        <Field
          name="unit"
          id={id("unit")}
          label={t("unit")}
          hint={t("unitHint")}
          maxLength={MAX_UNIT_LENGTH}
          autoComplete="off"
          defaultValue={shown.unit}
          error={error("unit")}
        />
        <Field
          name="unitPrice"
          id={id("price")}
          label={t("unitPrice")}
          hint={t("unitPriceHint")}
          inputMode="decimal"
          autoComplete="off"
          required
          defaultValue={shown.unitPrice}
          error={error("unitPrice")}
        />
        <div className="grid content-start gap-1.5">
          <label htmlFor={id("vat")} className="font-medium">
            {t("vatRate")}
          </label>
          <select
            id={id("vat")}
            name="vatRate"
            defaultValue={shown.vatRate}
            aria-invalid={vatError ? true : undefined}
            className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-invalid:border-danger"
          >
            {vatRates.map((rate) => (
              <option key={rate} value={rate}>
                {t("vatOption", { rate })}
              </option>
            ))}
          </select>
          {vatError && <p className="text-sm font-medium text-danger">{vatError}</p>}
        </div>
      </div>
      <div>
        <SubmitButton pendingLabel={tAuth("pending")}>{line ? t("save") : t("add")}</SubmitButton>
      </div>
    </form>
  );
}

// Remove a line from the draft. Nothing has been sent, so nothing else changes.
export function RemoveLineForm({ job, line }: { job: string; line: string }) {
  const t = useTranslations("Invoice");
  const [state, action, pending] = useActionState<LineState, FormData>(removeLine, {});
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="job" value={job} />
      <input type="hidden" name="line" value={line} />
      <div aria-live="polite">{state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}</div>
      <button
        type="submit"
        disabled={pending}
        className={`flex min-h-11 items-center justify-center rounded-lg border border-danger/40 px-4 font-semibold text-danger hover:bg-danger-soft disabled:opacity-70 sm:justify-self-start ${focusRing}`}
      >
        {pending ? t("removing") : t("remove")}
      </button>
    </form>
  );
}
