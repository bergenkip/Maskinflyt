import Link from "next/link";
import { useTranslations } from "next-intl";
import { guidePath, type Guide } from "@/lib/guides";

// A card that leads to one guide: its name, one line on what it answers, and an arrow.
export function GuideCard({ guide }: { guide: Guide }) {
  const t = useTranslations("Guides");
  return (
    <Link
      href={guidePath(guide)}
      className="group flex h-full min-h-11 items-start gap-3 rounded-xl border border-border bg-surface p-5 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-link">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3h9l3 3v15H6zM9 10h6M9 14h6M9 17h3" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold [overflow-wrap:anywhere] hyphens-auto">{t(`${guide}.navName`)}</span>
        <span className="mt-1 block leading-relaxed text-muted">{t(`${guide}.summary`)}</span>
      </span>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 text-link" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </Link>
  );
}
