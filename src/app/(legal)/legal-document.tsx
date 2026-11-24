import { useFormatter, useTranslations } from "next-intl";
import { LEGAL_UPDATED, fillCompany, type LegalSection } from "@/lib/legal";

// One legal text (privacy policy or terms): title, date and
// numbered sections. The texts live in messages/*.json under "Legal".
export function LegalDocument({ kind }: { kind: "privacy" | "terms" | "dpa" }) {
  const t = useTranslations("Legal");
  const format = useFormatter();
  const sections = t.raw(`${kind}.sections`) as LegalSection[];
  const updated = format.dateTime(new Date(`${LEGAL_UPDATED}T12:00:00Z`), { dateStyle: "long" });

  return (
    <article className="[overflow-wrap:anywhere] hyphens-auto">
      <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">{t(`${kind}.title`)}</h1>
      <p className="mt-2 text-sm text-muted">{t("updated", { date: updated })}</p>
      {/* raw: the lead may name the company, filled in below like the sections. */}
      <p className="mt-6 text-lg leading-relaxed text-muted">{fillCompany(t.raw(`${kind}.lead`) as string)}</p>

      <ol className="mt-10 grid gap-8">
        {sections.map((section, index) => (
          <li key={section.title}>
            <section aria-labelledby={`${kind}-${index}`}>
              <h2 id={`${kind}-${index}`} className="text-xl font-semibold tracking-tight">
                <span className="text-muted">{index + 1}. </span>
                {section.title}
              </h2>
              <div className="mt-3 grid gap-3 leading-relaxed text-foreground/90">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{fillCompany(paragraph)}</p>
                ))}
              </div>
            </section>
          </li>
        ))}
      </ol>
    </article>
  );
}
