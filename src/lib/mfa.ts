import "server-only";
import { cache } from "react";
import { secondStepDone } from "@/lib/roles";
import { createClient, getClaims } from "@/lib/supabase/server";

// Whether this session has passed the second sign-in step: either the JWT
// says so (a session created from the e-mailed link), or the database has an
// approval for this session (the link was opened in another browser).
export const hasSecondStep = cache(async (): Promise<boolean> => {
  if (secondStepDone(await getClaims())) return true;
  const supabase = await createClient();
  const { data: passed } = await supabase.rpc("second_step_passed");
  return passed === true;
});

// The signed-in person's e-mail address, where the link is sent.
export async function getUserEmail(): Promise<string | null> {
  const email = ((await getClaims()) as { email?: unknown } | null)?.email;
  return typeof email === "string" && email ? email : null;
}
