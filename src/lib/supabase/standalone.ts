import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseEnv } from "./env";

const noStorage = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const;

// For e-mailing the second-step link. The implicit flow puts the link
// session's tokens in the URL fragment, so the link works in any browser
// (PKCE would tie it to this one). Nothing is stored in cookies.
export function createLinkSender() {
  const { url, key } = requireSupabaseEnv();
  return createSupabaseClient(url, key, { auth: { ...noStorage, flowType: "implicit" } });
}

// Acts as the short-lived link session, from its access token. Used only on
// the approval page; the session is signed out again afterwards.
export function createLinkSessionClient(accessToken: string) {
  const { url, key } = requireSupabaseEnv();
  return createSupabaseClient(url, key, {
    auth: noStorage,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
