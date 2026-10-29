import "server-only";
import { createClient } from "./server";

const jwt = /^[\w-]+\.[\w-]+\.[\w-]+$/;

// Makes an e-mailed link's tokens (from the URL fragment) this browser's
// session. The answer is the account's address, or null when the link is not
// (or no longer) valid.
export async function setLinkSession(accessToken: string, refreshToken: string): Promise<string | null> {
  if (!jwt.test(accessToken) || !refreshToken || refreshToken.length > 200) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  return error ? null : (data.user?.email ?? null);
}
