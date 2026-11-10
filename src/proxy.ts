import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

// The company's own address. The live site also answers on *.vercel.app, and
// the e-mail links (confirmation, password, second step) point back to the
// address the person used, so the live site always moves people here first.
const SITE = "https://maskingo.no";

// Refreshes the Supabase session on every page request and keeps
// signed-out visitors out of /app.
export async function proxy(request: NextRequest) {
  // Only the live site: previews (VERCEL_ENV=preview) keep their own address for testing.
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(":")[0];
  if (process.env.VERCEL_ENV === "production" && host.endsWith(".vercel.app")) {
    return NextResponse.redirect(new URL(request.nextUrl.pathname + request.nextUrl.search, SITE), 308);
  }

  const env = getSupabaseEnv();
  if (!env) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname } = request.nextUrl;

  if (!signedIn && (pathname === "/app" || pathname.startsWith("/app/"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Signed-in people go straight to the app, also from the start page.
  if (signedIn && (pathname === "/" || pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
