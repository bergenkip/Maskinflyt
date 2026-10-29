import "server-only";
import { getFormatter, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

type Added = { created_by: string | null; created_at: string };

type MemberRow = { user_id: string; email: string; full_name: string | null };

// "Added by Ingrid Hansen · 29 Oct 2026" for vehicles and customers. Names come
// from the team list, so a person who has left shows as a former member, and
// rows from before this was recorded show only the date.
export async function getAddedBy(organizationId: string): Promise<(row: Added) => string> {
  const supabase = await createClient();
  const [t, format, members] = await Promise.all([
    getTranslations("AddedBy"),
    getFormatter(),
    supabase.rpc("list_members", { org: organizationId }),
  ]);
  const names = new Map(((members.data ?? []) as MemberRow[]).map((m) => [m.user_id, m.full_name ?? m.email]));

  return ({ created_by, created_at }) => {
    const date = format.dateTime(new Date(created_at), { dateStyle: "medium" });
    if (!created_by) return t("on", { date });
    return t("by", { name: names.get(created_by) ?? t("formerMember"), date });
  };
}
