import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRightIcon, CheckCircleIcon, PauseCircleIcon, TruckIcon } from "@/components/icons";
import { getCurrentMembership } from "@/lib/membership";
import { canEditVehicles, canSeeVehicles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { formatRegNumber, vehicleColumns, type Vehicle } from "@/lib/vehicles";
import { VehicleForm } from "./vehicle-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Vehicles");
  return { title: `${t("title")} · Maskinflyt` };
}

export default async function VehiclesPage() {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  if (!canSeeVehicles(membership.role)) redirect("/app");

  const { organization, role } = membership;
  const mayEdit = canEditVehicles(role);
  const supabase = await createClient();
  const [t, format, result] = await Promise.all([
    getTranslations("Vehicles"),
    getFormatter(),
    // In use first, then by name.
    supabase
      .from("vehicles")
      .select(vehicleColumns)
      .eq("organization_id", organization.id)
      .order("active", { ascending: false })
      .order("name"),
  ]);
  const vehicles = (result.data ?? []) as Vehicle[];

  return (
    <div className="grid max-w-3xl gap-8">
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        {/* Company names are data and are shown exactly as entered. */}
        <p className="text-muted [overflow-wrap:anywhere]">{t("lead", { company: organization.name })}</p>
      </div>

      {mayEdit ? (
        <section aria-labelledby="add-title" className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:p-6">
          <div className="grid gap-1">
            <h2 id="add-title" className="text-lg font-semibold">
              {t("addTitle")}
            </h2>
            <p className="text-muted">{t("addLead")}</p>
          </div>
          <VehicleForm currency={organization.currency} />
        </section>
      ) : (
        <p className="rounded-xl border border-border bg-surface p-4 text-muted">{t("readOnly")}</p>
      )}

      <section aria-labelledby="list-title" className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 id="list-title" className="text-lg font-semibold">
            {t("listTitle")}
          </h2>
          {!result.error && <p className="text-sm text-muted">{t("count", { count: vehicles.length })}</p>}
        </div>
        {result.error ? (
          <p className="text-danger">{t("errors.unknown")}</p>
        ) : vehicles.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-muted">
            {mayEdit ? t("empty") : t("emptyReadOnly")}
          </p>
        ) : (
          <ul className="grid gap-3">
            {vehicles.map((vehicle) => {
              const details = [
                vehicle.crane_tm !== null && t("crane", { value: format.number(Number(vehicle.crane_tm)) }),
                vehicle.payload_kg !== null && t("payload", { value: format.number(vehicle.payload_kg) }),
                vehicle.hourly_rate !== null
                  ? t("perHour", {
                      amount: format.number(vehicle.hourly_rate / 100, { style: "currency", currency: organization.currency }),
                    })
                  : t("noRate"),
                vehicle.min_billable_minutes > 0 && t("minimum", { hours: vehicle.min_billable_minutes / 60 }),
              ].filter(Boolean);
              // Vehicle names are data and are shown exactly as entered.
              const body = (
                <>
                  <span
                    className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${vehicle.active ? "bg-accent-soft text-accent" : "border border-border text-muted"}`}
                  >
                    <TruckIcon className="size-6" />
                  </span>
                  <span className="grid min-w-0 flex-1 gap-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="font-semibold [overflow-wrap:anywhere]">{vehicle.name}</span>
                      {/* The state is shown with an icon and with words, never by colour alone. */}
                      <span
                        className={`flex items-center gap-1 text-sm font-medium ${vehicle.active ? "text-success" : "text-muted"}`}
                      >
                        {vehicle.active ? <CheckCircleIcon className="size-4" /> : <PauseCircleIcon className="size-4" />}
                        {vehicle.active ? t("active") : t("inactive")}
                      </span>
                    </span>
                    <span className="text-sm text-muted">
                      {/* An own type name is data and is shown exactly as entered. */}
                      <span className="[overflow-wrap:anywhere]">{vehicle.type_name ?? t(`types.${vehicle.type}`)}</span> ·{" "}
                      <span className="tabular-nums">
                        {vehicle.reg_number ? formatRegNumber(vehicle.reg_number) : t("noRegNumber")}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm tabular-nums">
                      {details.map((detail) => (
                        <span key={String(detail)}>{detail}</span>
                      ))}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={vehicle.id}>
                  {mayEdit ? (
                    <Link
                      href={`/app/vehicles/${vehicle.id}`}
                      className="group flex items-start gap-3 rounded-xl border border-border bg-surface p-4 hover:border-accent/60 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {body}
                      <ArrowRightIcon className="mt-3 size-5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                    </Link>
                  ) : (
                    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
