"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormAlert, SubmitButton } from "@/components/form";
import type { Interval, Plan } from "@/lib/billing";
import { choosePlan, openPortal, type BillingActionState } from "./actions";

function BillingError({ state }: { state: BillingActionState }) {
  const t = useTranslations("Billing");
  if (!state.error) return null;
  return <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>;
}

export function ChoosePlanForm({ plan, interval, label }: { plan: Plan; interval: Interval; label: string }) {
  const t = useTranslations("Billing");
  const [state, action] = useActionState<BillingActionState, FormData>(choosePlan, {});
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="interval" value={interval} />
      <BillingError state={state} />
      {state.done && <FormAlert kind="success">{t("changed")}</FormAlert>}
      <SubmitButton pendingLabel={t("pending")}>{label}</SubmitButton>
    </form>
  );
}

export function PortalForm() {
  const t = useTranslations("Billing");
  const [state, action] = useActionState<BillingActionState, FormData>(openPortal, {});
  return (
    <form action={action} className="grid gap-3">
      <BillingError state={state} />
      <SubmitButton pendingLabel={t("pending")}>{t("portal")}</SubmitButton>
    </form>
  );
}
