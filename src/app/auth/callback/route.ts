import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/app/(auth)/validation";
import { createClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The confirmation and password-reset e-mail links land here with a one-time code. An invitation
// used at sign-up was already accepted when the account was created.
// The second-step link lands here with ?approve=<request>; its tokens are in
// the URL fragment, which the browser keeps across this redirect.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const approve = searchParams.get("approve");
  if (approve && uuid.test(approve)) return NextResponse.redirect(`${origin}/approve/${approve}`);

  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  // A failed password-reset link: that page explains it and offers a new link.
  if (next === "/reset-password") return NextResponse.redirect(`${origin}/reset-password`);
  return NextResponse.redirect(`${origin}/login?error=link`);
}
