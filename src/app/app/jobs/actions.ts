"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validateCustomer, type CustomerFieldError, type CustomerFormValues } from "@/lib/customers";
import { NEW_CUSTOMER, validateJob, type JobFieldError, type JobFields, type JobFormValues } from "@/lib/jobs";
import { getCurrentMembership } from "@/lib/membership";
import { createClient } from "@/lib/supabase/server";

// RLS decides who may add or change a job (owners, admins, dispatchers) and the
// database sets the number, the price and "new" or "planned"; these actions
// check the form, warn about double bookings and translate errors.

export type Overlap = {
  kind: "vehicle" | "driver";
  name: string;
  number: number;
  customer: string;
  startsAt: string;
  endsAt: string;
};

export type JobFormState = {
  values?: JobFormValues;
  fieldErrors?: Partial<Record<keyof JobFormValues, JobFieldError>>;
  error?: "notAllowed" | "notAvailable" | "unknown";
  // The machine or driver is already on another job at that time.
  overlaps?: Overlap[];
  savedAt?: number;
  // The customer being added with the job, and what is wrong with it.
  newCustomer?: NewCustomerValues;
  customerFieldErrors?: Partial<Record<keyof CustomerFormValues, CustomerFieldError>>;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapError(values: JobFormValues, error: { code?: string }): JobFormState {
  // A customer, machine or driver of another company, or a driver who has left.
  if (error.code === "23503") return { values, error: "notAvailable" };
  if (error.code === "42501") return { values, error: "notAllowed" };
  return { values, error: "unknown" };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;
type OverlapRow = {
  number: number;
  vehicle_id: string | null;
  driver_id: string | null;
  starts_at: string;
  ends_at: string;
  customers: { name: string } | null;
  vehicles: { name: string } | null;
};

// Open jobs of the same machine or driver that share any time with this one.
async function findOverlaps(supabase: Supabase, organizationId: string, fields: JobFields, exceptId?: string) {
  const who = [
    fields.vehicle_id && `vehicle_id.eq.${fields.vehicle_id}`,
    fields.driver_id && `driver_id.eq.${fields.driver_id}`,
  ].filter(Boolean);
  if (who.length === 0) return [];

  let request = supabase
    .from("jobs")
    .select("number, vehicle_id, driver_id, starts_at, ends_at, customers(name), vehicles(name)")
    .eq("organization_id", organizationId)
    .in("status", ["new", "planned"])
    .lt("starts_at", fields.ends_at)
    .gt("ends_at", fields.starts_at)
    .or(who.join(","))
    .order("starts_at")
    .limit(5);
  if (exceptId) request = request.neq("id", exceptId);
  const [{ data }, members] = await Promise.all([
    request,
    fields.driver_id ? supabase.rpc("list_members", { org: organizationId }) : null,
  ]);
  const people = new Map(
    ((members?.data ?? []) as { user_id: string; email: string; full_name: string | null }[]).map((m) => [
      m.user_id,
      m.full_name ?? m.email,
    ]),
  );

  return ((data ?? []) as unknown as OverlapRow[]).flatMap((row): Overlap[] => {
    const base = { number: row.number, customer: row.customers?.name ?? "", startsAt: row.starts_at, endsAt: row.ends_at };
    return [
      ...(fields.vehicle_id && row.vehicle_id === fields.vehicle_id
        ? [{ ...base, kind: "vehicle" as const, name: row.vehicles?.name ?? "" }]
        : []),
      ...(fields.driver_id && row.driver_id === fields.driver_id
        ? [{ ...base, kind: "driver" as const, name: people.get(fields.driver_id) ?? "" }]
        : []),
    ];
  });
}

// The customer added together with a job (customer "new"): only what is
// needed on the phone; the rest can be filled in on the customer's page.
export type NewCustomerValues = { kind: string; name: string; phone: string; email: string };
const newCustomerFields = { kind: "newCustomerKind", name: "newCustomerName", phone: "newCustomerPhone", email: "newCustomerEmail" } as const;

function readNewCustomer(formData: FormData) {
  const data = new FormData();
  for (const [key, field] of Object.entries(newCustomerFields)) data.set(key, String(formData.get(field) ?? ""));
  const { values, fieldErrors, fields } = validateCustomer(data);
  const shown: NewCustomerValues = { kind: values.kind, name: values.name, phone: values.phone, email: values.email };
  return { values: shown, fieldErrors, fields };
}

// Adds (no id) or changes a job. A new customer is added first, once the job
// itself is known to be valid and free of clashes, so a refused job leaves no
// customer behind; if the job still fails after that, the form keeps the new
// customer chosen and nothing is added twice.
async function saveJob(formData: FormData, id?: string): Promise<JobFormState> {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  const { organization } = membership;

  const { values, fieldErrors, fields } = validateJob(formData, organization.timeZone);
  const isNew = values.customerId === NEW_CUSTOMER;
  const customer = isNew ? readNewCustomer(formData) : undefined;
  if (!fields || customer?.fieldErrors) {
    return { values, fieldErrors, newCustomer: customer?.values, customerFieldErrors: customer?.fieldErrors };
  }
  if (id !== undefined && !uuid.test(id)) return { values, error: "unknown" };

  const supabase = await createClient();
  if (formData.get("confirmOverlap") !== "1") {
    const overlaps = await findOverlaps(supabase, organization.id, fields, id);
    if (overlaps.length > 0) return { values, overlaps, newCustomer: customer?.values };
  }

  if (customer?.fields) {
    const { data, error } = await supabase
      .from("customers")
      .insert({ ...customer.fields, organization_id: organization.id })
      .select("id")
      .single();
    if (error) return { ...mapError(values, error), newCustomer: customer.values };
    fields.customer_id = data.id;
    values.customerId = data.id;
    revalidatePath("/app/customers", "layout");
  }

  if (id === undefined) {
    const { data, error } = await supabase
      .from("jobs")
      .insert({ ...fields, organization_id: organization.id })
      .select("id")
      .single();
    if (error) return mapError(values, error);
    revalidatePath("/app", "layout");
    redirect(`/app/jobs/${data.id}?added=1`);
  }

  // RLS hides rows the person may not change, so no row back means not allowed.
  const { data, error } = await supabase.from("jobs").update(fields).eq("id", id).select("id");
  if (error) return mapError(values, error);
  if (!data || data.length === 0) return { values, error: "notAllowed" };

  revalidatePath("/app", "layout");
  return { values, savedAt: Date.now() };
}

export async function addJob(_prev: JobFormState, formData: FormData): Promise<JobFormState> {
  return saveJob(formData);
}

export async function updateJob(_prev: JobFormState, formData: FormData): Promise<JobFormState> {
  return saveJob(formData, String(formData.get("id") ?? ""));
}

export type JobStatusState = { error?: "notAllowed" | "needsVehicleAndDriver" | "unknown" };

// "new" restores a cancelled job (or reopens a done one); the database makes it
// "planned" again when it has a machine and a driver.
export async function setJobStatus(_prev: JobStatusState, formData: FormData): Promise<JobStatusState> {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!uuid.test(id) || !["new", "done", "cancelled"].includes(status)) return { error: "unknown" };

  const supabase = await createClient();
  const { data, error } = await supabase.from("jobs").update({ status }).eq("id", id).select("id");
  if (error) {
    if (error.code === "23514") return { error: "needsVehicleAndDriver" };
    return { error: error.code === "42501" ? "notAllowed" : "unknown" };
  }
  if (!data || data.length === 0) return { error: "notAllowed" };

  revalidatePath("/app", "layout");
  return {};
}
