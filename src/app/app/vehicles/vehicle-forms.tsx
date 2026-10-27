"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { hasCrane, isVehicleType, vehicleTypes, type VehicleFormValues, type VehicleType } from "@/lib/vehicles";
import {
  addVehicle,
  setVehicleActive,
  updateVehicle,
  type VehicleFormState,
  type VehicleStatusState,
} from "./actions";

const selectClass =
  "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

type Props = {
  currency: string;
  // Editing: the vehicle's id and its stored values as text.
  vehicle?: { id: string; values: VehicleFormValues };
};

export function VehicleForm({ currency, vehicle }: Props) {
  const [state, action] = useActionState<VehicleFormState, FormData>(vehicle ? updateVehicle : addVehicle, {});
  // After adding, a fresh empty form for the next machine.
  return <VehicleFields key={vehicle ? "edit" : (state.savedAt ?? "new")} {...{ currency, vehicle, state, action }} />;
}

function VehicleFields({
  currency,
  vehicle,
  state,
  action,
}: Props & { state: VehicleFormState; action: (formData: FormData) => void }) {
  const t = useTranslations("Vehicles");
  const tAuth = useTranslations("Auth");
  const values = state.values ?? vehicle?.values;
  const initialType = values && isVehicleType(values.type) ? values.type : "crane_truck";
  // Controlled, so the crane field appears and disappears with the type.
  const [type, setType] = useState<VehicleType>(initialType);
  const error = (key: keyof VehicleFormValues) => {
    const code = state.fieldErrors?.[key];
    return code && t(`errors.${code}`);
  };

  return (
    <form action={action} noValidate className="grid gap-5">
      {state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}
      {state.savedName && (
        <FormAlert kind="success">{vehicle ? t("saved") : t("added", { name: state.savedName })}</FormAlert>
      )}
      {vehicle && <input type="hidden" name="id" value={vehicle.id} />}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <label htmlFor="vehicle-type" className="font-medium">
            {t("type")}
          </label>
          <select
            id="vehicle-type"
            name="type"
            value={type}
            onChange={(event) => isVehicleType(event.target.value) && setType(event.target.value)}
            className={selectClass}
          >
            {vehicleTypes.map((value) => (
              <option key={value} value={value}>
                {t(`types.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <Field
          name="name"
          id="vehicle-name"
          label={t("name")}
          hint={t("nameHint")}
          required
          maxLength={100}
          autoComplete="off"
          defaultValue={values?.name}
          error={error("name")}
        />
        <Field
          name="regNumber"
          id="vehicle-reg"
          label={t("regNumber")}
          hint={t("regNumberHint")}
          maxLength={14}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          defaultValue={values?.regNumber}
          error={error("regNumber")}
        />
        {hasCrane(type) && (
          <Field
            name="craneTm"
            id="vehicle-crane"
            label={t("craneTm")}
            inputMode="decimal"
            autoComplete="off"
            maxLength={8}
            defaultValue={values?.craneTm}
            error={error("craneTm")}
          />
        )}
        <Field
          name="payloadKg"
          id="vehicle-payload"
          label={t("payloadKg")}
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          defaultValue={values?.payloadKg}
          error={error("payloadKg")}
        />
        <Field
          name="hourlyRate"
          id="vehicle-rate"
          label={t("hourlyRate", { currency })}
          hint={t("hourlyRateHint")}
          inputMode="decimal"
          autoComplete="off"
          maxLength={12}
          defaultValue={values?.hourlyRate}
          error={error("hourlyRate")}
        />
        <Field
          name="minHours"
          id="vehicle-min-hours"
          label={t("minHours")}
          hint={t("minHoursHint")}
          inputMode="decimal"
          autoComplete="off"
          maxLength={5}
          defaultValue={values?.minHours}
          error={error("minHours")}
        />
      </div>

      <div>
        <SubmitButton pendingLabel={tAuth("pending")}>{vehicle ? t("save") : t("addSubmit")}</SubmitButton>
      </div>
    </form>
  );
}

export function VehicleStatusForm({ id, active }: { id: string; active: boolean }) {
  const t = useTranslations("Vehicles");
  const tAuth = useTranslations("Auth");
  const [state, action, pending] = useActionState<VehicleStatusState, FormData>(setVehicleActive, {});

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      {state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}
      <div>
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 w-full rounded-lg border border-border px-4 font-medium text-foreground hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-70 sm:w-auto"
        >
          {pending ? tAuth("pending") : active ? t("deactivate") : t("activate")}
        </button>
      </div>
    </form>
  );
}
