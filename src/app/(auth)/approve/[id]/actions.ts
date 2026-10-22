"use server";

import { hasSecondStep } from "@/lib/mfa";
import { createLinkSessionClient } from "@/lib/supabase/standalone";
import { describeUserAgent } from "@/lib/user-agent";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const jwt = /^[\w-]+\.[\w-]+\.[\w-]+$/;

export type Request =
  | { status: "ready"; device: string | null; createdAt: string }
  | { status: "approved" | "expired" | "invalid" };

// What the e-mailed link approves. The access token is the link session's,
// taken from the URL fragment; the database only answers for that person.
export async function loadRequest(requestId: string, accessToken: string): Promise<Request> {
  if (!uuid.test(requestId) || !jwt.test(accessToken)) return { status: "invalid" };
  const { data, error } = await createLinkSessionClient(accessToken).rpc("second_step_request", { request: requestId });
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) return { status: "invalid" };
  if (row.approved) return { status: "approved" };
  if (row.expired) return { status: "expired" };
  return { status: "ready", device: describeUserAgent(row.user_agent), createdAt: row.created_at };
}

export type Decision = { result: "approved" | "declined" | "error"; openApp?: boolean };

// Approves (or not) the waiting sign-in, then signs the link session out, so
// opening the link never leaves a signed-in session behind in this browser.
export async function decide(requestId: string, accessToken: string, approve: boolean): Promise<Decision> {
  if (!uuid.test(requestId) || !jwt.test(accessToken)) return { result: "error" };
  const client = createLinkSessionClient(accessToken);

  let result: Decision["result"] = "declined";
  if (approve) {
    const { error } = await client.rpc("approve_second_step", { request: requestId });
    result = error ? "error" : "approved";
  }
  await client.auth.admin.signOut(accessToken, "local");

  // Opened in the same browser that is waiting: go straight in.
  const openApp = result === "approved" && (await hasSecondStep().catch(() => false));
  return { result, openApp };
}
