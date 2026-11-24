import "server-only";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type CustomerAccount = {
  name: string;
  email: string;
  phone: string | null;
  place: string | null;
};

// The signed-in person's customer account, or null (signed out, or no customer account).
export async function getCustomerAccount(): Promise<CustomerAccount | null> {
  if (!getSupabaseEnv()) return null;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;
  const [account, profile] = await Promise.all([
    supabase.from("customer_accounts").select("phone, place").eq("user_id", userId).maybeSingle(),
    supabase.from("profiles").select("first_name, last_name").eq("id", userId).maybeSingle(),
  ]);
  if (!account.data) return null;
  const names = profile.data as { first_name: string | null; last_name: string | null } | null;
  const { phone, place } = account.data as { phone: string | null; place: string | null };
  return {
    name: [names?.first_name, names?.last_name].filter(Boolean).join(" "),
    email: String(claims?.claims?.email ?? ""),
    phone,
    place,
  };
}

export type MyRequest = {
  id: string;
  created_at: string;
  status: "new" | "accepted" | "declined";
  place: string;
  wanted_date: string | null;
  wanted_start: string | null;
  service: string | null;
  description: string;
  answer: string | null;
  handled_at: string | null;
  company: string;
  slug: string | null;
  page_published: boolean;
  // The job the company planned from the request (stage 16b): only its time and state.
  job_status: "planned" | "done" | "cancelled" | null;
  job_starts_at: string | null;
  job_ends_at: string | null;
  time_zone: string;
};

export async function getMyRequests(): Promise<MyRequest[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_job_requests");
  return error ? null : ((data ?? []) as MyRequest[]);
}

export async function getMyCompanies(): Promise<{ slug: string; name: string; city: string | null; requests: number }[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_companies");
  return (data ?? []) as { slug: string; name: string; city: string | null; requests: number }[];
}
