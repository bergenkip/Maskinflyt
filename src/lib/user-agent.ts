// A short "Browser, device" label for the approval page, so the person can
// tell whether the waiting sign-in is theirs. Brand names are not translated.
export function describeUserAgent(userAgent: string | null | undefined): string | null {
  const ua = userAgent ?? "";
  const browser =
    /EdgiOS|Edg\//.test(ua) ? "Edge"
    : /FxiOS|Firefox\//.test(ua) ? "Firefox"
    : /CriOS|Chrome\//.test(ua) ? "Chrome"
    : /GSA\//.test(ua) ? "Google"
    : /Safari\//.test(ua) ? "Safari"
    : null;
  const device =
    /iPhone/.test(ua) ? "iPhone"
    : /iPad/.test(ua) ? "iPad"
    : /Android/.test(ua) ? "Android"
    : /Macintosh/.test(ua) ? "Mac"
    : /Windows/.test(ua) ? "Windows"
    : /Linux/.test(ua) ? "Linux"
    : null;
  if (!browser && !device) return null;
  return [browser, device].filter(Boolean).join(", ");
}
