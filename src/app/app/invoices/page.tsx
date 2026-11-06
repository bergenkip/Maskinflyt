import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { QueueRow } from "@/lib/invoice";
import { getCurrentMembership } from "@/lib/membership";
import { canSeeJobs } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { InvoiceQueueView } from "./queue-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Invoices");
  return { title: `${t("title")} · MaskinGo` };
}

// One place to finish the invoicing: finished jobs whose time waits for
// approval, drafts ready to invoice, and those marked as sent.
export default async function InvoicesPage() {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  if (!canSeeJobs(membership.role)) redirect("/app");
  const { organization } = membership;

  const supabase = await createClient();
  const result = await supabase.rpc("invoice_queue");
  return <InvoiceQueueView rows={(result.data ?? []) as QueueRow[]} organization={organization} failed={Boolean(result.error)} />;
}
