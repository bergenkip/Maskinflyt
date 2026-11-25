import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, isLocale } from "@/i18n/locale";
import { getSupabaseEnv } from "@/lib/supabase/env";

// The company's own address. The live site also answers on *.vercel.app, and
// the e-mail links (confirmation, password, second step) point back to the
// address the person used, so the live site always moves people here first.
const SITE = "https://maskingo.no";

// A link with ?lang=xx (for example ?lang=lt, the hidden language) switches
// the language on this device and drops the parameter from the address.
// Unknown values only drop the parameter.
function languageLink(request: NextRequest): { locale: string | null; redirect: NextResponse } | null {
  const lang = request.nextUrl.searchParams.get("lang");
  if (lang === null) return null;
  const url = request.nextUrl.clone();
  url.searchParams.delete("lang");
  const redirect = NextResponse.redirect(url);
  if (!isLocale(lang)) return { locale: null, redirect };
  redirect.cookies.set(LOCALE_COOKIE, lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return { locale: lang, redirect };
}

// Refreshes the Supabase session on every page request and keeps
// signed-out visitors out of /app.
export async function proxy(request: NextRequest) {
  // Only the live site: previews (VERCEL_ENV=preview) keep their own address for testing.
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(":")[0];
  if (process.env.VERCEL_ENV === "production" && host.endsWith(".vercel.app")) {
    return NextResponse.redirect(new URL(request.nextUrl.pathname + request.nextUrl.search, SITE), 308);
  }

  const link = languageLink(request);

  const env = getSupabaseEnv();
  if (!env) return link?.redirect ?? NextResponse.next({ request });

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

  if (link) {
    // Signed in: the profile remembers it too, so it follows the person to
    // other devices. RLS lets a person change only their own profile.
    if (signedIn && link.locale) {
      await supabase.from("profiles").update({ locale: link.locale }).eq("id", data!.claims.sub);
    }
    // Keep a refreshed session cookie on the redirect.
    for (const cookie of response.cookies.getAll()) link.redirect.cookies.set(cookie);
    return link.redirect;
  }

  if (!signedIn && (pathname === "/app" || pathname.startsWith("/app/"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // The customer's own page (stage 16a): sign in, then back to it.
  if (!signedIn && (pathname === "/kunde" || pathname.startsWith("/kunde/"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = new URLSearchParams({ next: "/kunde" }).toString();
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
