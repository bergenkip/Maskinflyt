import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRightIcon, CheckCircleIcon, PauseCircleIcon } from "@/components/icons";
import { getAddedBy } from "@/lib/added-by";
import { getCurrentMembership } from "@/lib/membership";
import { canEditVehicles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { toFormValues, vehicleColumns, type Vehicle } from "@/lib/vehicles";
import { VehicleForm, VehicleStatusForm } from "../vehicle-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Vehicles");
  return { title: `${t("editTitle")} · Maskinflyt` };
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sectionClass = "grid gap-4 rounded-xl border border-border bg-surface p-5 sm:p-6";

export default async function VehiclePage({ params }: PageProps<"/app/vehicles/[id]">) {
  const { id } = await params;
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  if (!canEditVehicles(membership.role)) redirect("/app/vehicles");
  if (!uuid.test(id)) notFound();

  const supabase = await createClient();
  const [t, locale, addedBy, { data }] = await Promise.all([
    getTranslations("Vehicles"),
    getLocale(),
    getAddedBy(membership.organization.id),
    // RLS returns nothing for another company's vehicle: it is "not found" here too.
    supabase.from("vehicles").select(vehicleColumns).eq("id", id).maybeSingle(),
  ]);
  if (!data) notFound();
  const vehicle = data as Vehicle;

  return (
    <div className="grid max-w-3xl gap-8">
      <div className="grid gap-2">
        <Link
          href="/app/vehicles"
          className="-ml-2 flex min-h-11 w-fit items-center gap-1.5 rounded-lg px-2 font-medium text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ArrowRightIcon className="size-5 rotate-180" />
          {t("back")}
        </Link>
        <p className="text-sm font-semibold tracking-wide text-accent uppercase">{t("editTitle")}</p>
        {/* Vehicle names are data and are shown exactly as entered. */}
        <h1 className="text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">{vehicle.name}</h1>
        {/* Person names are data and are shown exactly as entered. */}
        <p className="text-sm text-muted [overflow-wrap:anywhere]">{addedBy(vehicle)}</p>
      </div>

      <section aria-label={t("editTitle")} className={sectionClass}>
        <VehicleForm
          currency={membership.organization.currency}
          vehicle={{ id: vehicle.id, values: toFormValues(vehicle, locale === "en" ? "." : ",") }}
        />
      </section>

      <section aria-labelledby="status-title" className={sectionClass}>
        <div className="grid gap-1">
          <h2 id="status-title" className="text-lg font-semibold">
            {t("statusTitle")}
          </h2>
          {/* The state is shown with an icon and with words, never by colour alone. */}
          <p className={`flex items-center gap-1.5 font-medium ${vehicle.active ? "text-success" : "text-muted"}`}>
            {vehicle.active ? <CheckCircleIcon className="size-5" /> : <PauseCircleIcon className="size-5" />}
            {vehicle.active ? t("active") : t("inactive")}
          </p>
          <p className="text-muted">{vehicle.active ? t("statusActiveLead") : t("statusInactiveLead")}</p>
        </div>
        <VehicleStatusForm id={vehicle.id} active={vehicle.active} />
      </section>
    </div>
  );
}
