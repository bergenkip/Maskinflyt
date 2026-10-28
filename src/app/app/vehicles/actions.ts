"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentMembership } from "@/lib/membership";
import { createClient } from "@/lib/supabase/server";
import { validateVehicle, type VehicleFieldError, type VehicleFormValues } from "@/lib/vehicles";

// RLS decides who may add or change a vehicle (owners and admins, with the
// second step); these actions only check the form and translate errors.

export type VehicleFormState = {
  values?: VehicleFormValues;
  fieldErrors?: Partial<Record<keyof VehicleFormValues, VehicleFieldError | "regNumberTaken">>;
  error?: "notAllowed" | "unknown";
  // Set after a successful save; the add form uses it to start empty again.
  savedName?: string;
  savedAt?: number;
};

function mapError(values: VehicleFormValues, error: { code?: string }): VehicleFormState {
  // The unique index on (organization_id, reg_number).
  if (error.code === "23505") return { values, fieldErrors: { regNumber: "regNumberTaken" } };
  // Row-level security said no (wrong role, or another company's vehicle).
  if (error.code === "42501") return { values, error: "notAllowed" };
  return { values, error: "unknown" };
}

export async function addVehicle(_prev: VehicleFormState, formData: FormData): Promise<VehicleFormState> {
  const { values, fieldErrors, fields } = validateVehicle(formData);
  if (!fields) return { values, fieldErrors };

  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");

  const supabase = await createClient();
  const { error } = await supabase.from("vehicles").insert({ ...fields, organization_id: membership.organization.id });
  if (error) return mapError(values, error);

  revalidatePath("/app/vehicles", "layout");
  return { savedName: fields.name, savedAt: Date.now() };
}

export async function updateVehicle(_prev: VehicleFormState, formData: FormData): Promise<VehicleFormState> {
  const id = String(formData.get("id") ?? "");
  const { values, fieldErrors, fields } = validateVehicle(formData);
  if (!fields) return { values, fieldErrors };
  if (!id) return { values, error: "unknown" };

  const supabase = await createClient();
  // RLS hides rows the person may not change, so no row back means not allowed.
  const { data, error } = await supabase.from("vehicles").update(fields).eq("id", id).select("id");
  if (error) return mapError(values, error);
  if (!data || data.length === 0) return { values, error: "notAllowed" };

  revalidatePath("/app/vehicles", "layout");
  return { values, savedName: fields.name, savedAt: Date.now() };
}

export type VehicleStatusState = { error?: "notAllowed" | "unknown" };

export async function setVehicleActive(_prev: VehicleStatusState, formData: FormData): Promise<VehicleStatusState> {
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return { error: "unknown" };

  const supabase = await createClient();
  const { data, error } = await supabase.from("vehicles").update({ active }).eq("id", id).select("id");
  if (error) return { error: error.code === "42501" ? "notAllowed" : "unknown" };
  if (!data || data.length === 0) return { error: "notAllowed" };

  revalidatePath("/app/vehicles", "layout");
  return {};
}
