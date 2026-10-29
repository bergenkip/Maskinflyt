import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { FormAlert } from "@/components/form";
import { CheckCircleIcon, PauseCircleIcon } from "@/components/icons";
import { customerColumns, toCustomerFormValues, type Customer } from "@/lib/customers";
import { getAddedBy } from "@/lib/added-by";
import { getCurrentMembership } from "@/lib/membership";
import { canEditCustomerRates, canSeeCustomers } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "../back-link";
import { CustomerForm, CustomerRateForm, CustomerStatusForm } from "../customer-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Customers");
  return { title: `${t("editTitle")} · Maskinflyt` };
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sectionClass = "grid gap-4 rounded-xl border border-border bg-surface p-5 sm:p-6";

type VehicleRow = { id: string; name: string; hourly_rate: number | null; active: boolean };
type RateRow = { vehicle_id: string; hourly_rate: number };

export default async function CustomerPage({ params, searchParams }: PageProps<"/app/customers/[id]">) {
  const { id } = await params;
  const { added } = await searchParams;
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  if (!canSeeCustomers(membership.role)) redirect("/app");
  if (!uuid.test(id)) notFound();

  const { organization, role } = membership;
  const supabase = await createClient();
  const [t, format, locale, addedBy, { data }, vehicles, rates] = await Promise.all([
    getTranslations("Customers"),
    getFormatter(),
    getLocale(),
    getAddedBy(organization.id),
    // RLS returns nothing for another company's customer: it is "not found" here too.
    supabase.from("customers").select(customerColumns).eq("id", id).maybeSingle(),
    supabase
      .from("vehicles")
      .select("id, name, hourly_rate, active")
      .eq("organization_id", organization.id)
      .order("active", { ascending: false })
      .order("name"),
    supabase.from("customer_rates").select("vehicle_id, hourly_rate").eq("customer_id", id),
  ]);
  if (!data) notFound();
  const customer = data as Customer;
  const mayEditRates = canEditCustomerRates(role);
  const ownRates = new Map(((rates.data ?? []) as RateRow[]).map((rate) => [rate.vehicle_id, rate.hourly_rate]));
  // Machines out of use are listed only when the customer still has a price for them.
  const priced = ((vehicles.data ?? []) as VehicleRow[]).filter((vehicle) => vehicle.active || ownRates.has(vehicle.id));

  const money = (ore: number) => format.number(ore / 100, { style: "currency", currency: organization.currency });
  // Øre as editable text: "1300" or "1300,50" ("1300.50" in English); the parser accepts both.
  const editable = (ore: number) => {
    const whole = Math.floor(ore / 100);
    const fraction = ore % 100;
    return fraction === 0 ? String(whole) : `${whole}${locale === "en" ? "." : ","}${String(fraction).padStart(2, "0")}`;
  };

  return (
    <div className="grid max-w-3xl gap-8">
      <div className="grid gap-2">
        <BackLink label={t("back")} />
        <p className="text-sm font-semibold tracking-wide text-accent uppercase">{t(`kinds.${customer.kind}`)}</p>
        {/* Customer names are data and are shown exactly as entered. */}
        <h1 className="text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">{customer.name}</h1>
        {/* Person names are data and are shown exactly as entered. */}
        <p className="text-sm text-muted [overflow-wrap:anywhere]">{addedBy(customer)}</p>
      </div>

      {added === "1" && <FormAlert kind="success">{t("added", { name: customer.name })}</FormAlert>}

      <section aria-labelledby="details-title" className={sectionClass}>
        <h2 id="details-title" className="text-lg font-semibold">
          {t("detailsTitle")}
        </h2>
        <CustomerForm customer={{ id: customer.id, values: toCustomerFormValues(customer) }} />
      </section>

      <section aria-labelledby="prices-title" className={sectionClass}>
        <div className="grid gap-1">
          <h2 id="prices-title" className="text-lg font-semibold">
            {t("pricesTitle")}
          </h2>
          <p className="text-muted">{mayEditRates ? t("pricesLead") : t("pricesReadOnly")}</p>
        </div>
        {vehicles.error || rates.error ? (
          <p className="text-danger">{t("errors.unknown")}</p>
        ) : priced.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-muted">{t("pricesNoMachines")}</p>
        ) : mayEditRates ? (
          <div className="grid divide-y divide-border">
            {priced.map((vehicle) => (
              <CustomerRateForm
                key={vehicle.id}
                customerId={customer.id}
                vehicleId={vehicle.id}
                vehicleName={vehicle.name}
                hint={
                  vehicle.hourly_rate === null
                    ? t("noUsualRate")
                    : t("usualRate", { rate: t("perHour", { amount: money(vehicle.hourly_rate) }) })
                }
                value={ownRates.has(vehicle.id) ? editable(ownRates.get(vehicle.id)!) : ""}
                currency={organization.currency}
              />
            ))}
          </div>
        ) : (
          <ul className="grid divide-y divide-border">
            {priced.map((vehicle) => {
              const own = ownRates.get(vehicle.id);
              return (
                <li key={vehicle.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
                  {/* Vehicle names are data and are shown exactly as entered. */}
                  <span className="font-medium [overflow-wrap:anywhere]">{vehicle.name}</span>
                  <span className="text-sm tabular-nums">
                    {own !== undefined
                      ? t("ownPrice", { amount: money(own) })
                      : vehicle.hourly_rate === null
                        ? t("noUsualRate")
                        : t("usualRate", { rate: t("perHour", { amount: money(vehicle.hourly_rate) }) })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="status-title" className={sectionClass}>
        <div className="grid gap-1">
          <h2 id="status-title" className="text-lg font-semibold">
            {t("statusTitle")}
          </h2>
          {/* The state is shown with an icon and with words, never by colour alone. */}
          <p className={`flex items-center gap-1.5 font-medium ${customer.active ? "text-success" : "text-muted"}`}>
            {customer.active ? <CheckCircleIcon className="size-5" /> : <PauseCircleIcon className="size-5" />}
            {customer.active ? t("active") : t("inactive")}
          </p>
          <p className="text-muted">{customer.active ? t("statusActiveLead") : t("statusInactiveLead")}</p>
        </div>
        <CustomerStatusForm id={customer.id} active={customer.active} />
      </section>
    </div>
  );
}
