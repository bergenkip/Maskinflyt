// Builds the Supabase Auth e-mail templates in supabase/templates/ from the
// texts below, in Norwegian (default), English and Lithuanian.
//
//   node scripts/email-templates.mjs          write the files
//   node scripts/email-templates.mjs --check  fail if the files are out of date
//
// Supabase renders them with Go templates. The language comes from
// {{ .Data.email_locale }} (auth.users metadata, see the email_locale
// migration). printf "%v" turns a missing value into "<nil>" instead of a
// template error, so such users get Norwegian.
//
// Hosted project: paste each subject and body into Supabase → Authentication →
// Emails → Templates. Local Supabase reads them through supabase/config.toml.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const LOCALE = '{{ $l := printf "%v" .Data.email_locale }}';
const SITE = "https://maskingo.no";

const common = {
  nb: { fallback: "Virker ikke knappen? Kopier denne lenken inn i nettleseren:", sent: "Sendt av MaskinGo" },
  en: { fallback: "Button not working? Copy this link into your browser:", sent: "Sent by MaskinGo" },
  lt: { fallback: "Mygtukas neveikia? Nukopijuokite šią nuorodą į naršyklę:", sent: "Išsiuntė MaskinGo" },
};

export const templates = {
  confirmation: {
    nb: {
      subject: "Bekreft e-postadressen din – MaskinGo",
      heading: "Bekreft e-postadressen din",
      body: "Takk for at du registrerte deg i MaskinGo. Trykk på knappen for å bekrefte e-postadressen og fullføre registreringen.",
      button: "Bekreft e-postadresse",
      note: "Hvis du ikke opprettet en konto, kan du se bort fra denne e-posten.",
    },
    en: {
      subject: "Confirm your email – MaskinGo",
      heading: "Confirm your email",
      body: "Thanks for signing up for MaskinGo. Tap the button to confirm your email address and finish signing up.",
      button: "Confirm email",
      note: "If you didn't create an account, you can ignore this email.",
    },
    lt: {
      subject: "Patvirtinkite el. pašto adresą – MaskinGo",
      heading: "Patvirtinkite el. pašto adresą",
      body: "Ačiū, kad užsiregistravote MaskinGo. Paspauskite mygtuką, kad patvirtintumėte el. pašto adresą ir užbaigtumėte registraciją.",
      button: "Patvirtinti el. paštą",
      note: "Jei nekūrėte paskyros, šį laišką galite ignoruoti.",
    },
  },
  // Only used for the second sign-in step (src/app/(auth)/mfa/actions.ts).
  magic_link: {
    nb: {
      subject: "Godkjenn innloggingen – MaskinGo",
      heading: "Godkjenn innloggingen",
      body: "Noen logger inn på MaskinGo-kontoen din. Hvis det er deg, trykk på knappen for å godkjenne. Lenken virker én gang og utløper snart.",
      button: "Godkjenn innlogging",
      note: "Hvis det ikke var deg, ikke trykk på lenken, og bytt passord.",
    },
    en: {
      subject: "Approve your sign-in – MaskinGo",
      heading: "Approve your sign-in",
      body: "Someone is signing in to your MaskinGo account. If it's you, tap the button to approve. The link works once and expires soon.",
      button: "Approve sign-in",
      note: "If this wasn't you, don't tap the link, and change your password.",
    },
    lt: {
      subject: "Patvirtinkite prisijungimą – MaskinGo",
      heading: "Patvirtinkite prisijungimą",
      body: "Kažkas jungiasi prie jūsų MaskinGo paskyros. Jei tai jūs, paspauskite mygtuką ir patvirtinkite. Nuoroda veikia vieną kartą ir greitai nustoja galioti.",
      button: "Patvirtinti prisijungimą",
      note: "Jei tai ne jūs, nespauskite nuorodos ir pakeiskite slaptažodį.",
    },
  },
  recovery: {
    nb: {
      subject: "Tilbakestill passordet – MaskinGo",
      heading: "Tilbakestill passordet",
      body: "Vi fikk en forespørsel om å tilbakestille passordet for {{ .Email }}. Trykk på knappen for å velge et nytt passord. Lenken virker én gang.",
      button: "Velg nytt passord",
      note: "Hvis du ikke ba om dette, kan du se bort fra e-posten. Passordet ditt er uendret.",
    },
    en: {
      subject: "Reset your password – MaskinGo",
      heading: "Reset your password",
      body: "We received a request to reset the password for {{ .Email }}. Tap the button to choose a new password. The link works once.",
      button: "Choose a new password",
      note: "If you didn't ask for this, you can ignore this email. Your password stays the same.",
    },
    lt: {
      subject: "Atkurkite slaptažodį – MaskinGo",
      heading: "Atkurkite slaptažodį",
      body: "Gavome prašymą atkurti {{ .Email }} slaptažodį. Paspauskite mygtuką ir pasirinkite naują slaptažodį. Nuoroda veikia vieną kartą.",
      button: "Pasirinkti naują slaptažodį",
      note: "Jei to neprašėte, laišką galite ignoruoti. Slaptažodis nepasikeis.",
    },
  },
};

function byLocale(render) {
  return `{{ if eq $l "lt" }}${render("lt")}{{ else if eq $l "en" }}${render("en")}{{ else }}${render("nb")}{{ end }}`;
}

export function subject(name) {
  return LOCALE + byLocale((l) => templates[name][l].subject);
}

function page(t, c, lang) {
  // Tables and inline styles: many e-mail apps ignore <style> and flexbox.
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${t.heading}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #dfe4ea;border-radius:12px;">
<tr><td style="padding:28px 28px 0 28px;">
<a href="${SITE}" style="text-decoration:none;"><img src="${SITE}/brand/maskingo-wordmark.png" width="190" height="24" alt="MaskinGo" style="display:block;border:0;width:190px;height:24px;color:#012042;font:bold 20px Arial,sans-serif;"></a>
</td></tr>
<tr><td style="padding:24px 28px 0 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#012042;">
<h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;font-weight:700;">${t.heading}</h1>
<p style="margin:0 0 24px 0;font-size:16px;line-height:1.5;color:#012042;">${t.body}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:#0068d9;">
<a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 24px;font-size:16px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:8px;">${t.button}</a>
</td></tr></table>
<p style="margin:24px 0 4px 0;font-size:14px;line-height:1.5;color:#536173;">${c.fallback}</p>
<p style="margin:0 0 24px 0;font-size:13px;line-height:1.5;word-break:break-all;"><a href="{{ .ConfirmationURL }}" style="color:#0068d9;">{{ .ConfirmationURL }}</a></p>
<p style="margin:0 0 28px 0;padding-top:16px;border-top:1px solid #dfe4ea;font-size:14px;line-height:1.5;color:#536173;">${t.note}</p>
</td></tr>
</table>
<p style="margin:16px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;color:#536173;">${c.sent} · <a href="${SITE}" style="color:#536173;">maskingo.no</a></p>
</td></tr>
</table>
</body>
</html>`;
}

export function body(name) {
  return `${LOCALE}${byLocale((l) => page(templates[name][l], common[l], l))}\n`;
}

const files = Object.keys(templates).flatMap((name) => [
  [`supabase/templates/${name}.html`, body(name)],
  [`supabase/templates/${name}.subject.txt`, `${subject(name)}\n`],
]);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  let stale = 0;
  for (const [path, content] of files) {
    const full = root + path;
    if (check) {
      let current = "";
      try {
        current = readFileSync(full, "utf8");
      } catch {}
      if (current !== content) {
        console.error(`out of date: ${path} (run node scripts/email-templates.mjs)`);
        stale++;
      }
    } else {
      writeFileSync(full, content);
      console.log(`wrote ${path}`);
    }
  }
  process.exit(stale ? 1 : 0);
}
