import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Industry } from "@/lib/industries";

// A card that leads to one trade's page; used on the start page and between the trade pages.
export function IndustryLink({ industry }: { industry: Industry }) {
  const t = useTranslations("Industry");
  return (
    <Link
      href={`/${industry}`}
      className="flex h-full min-h-11 items-start gap-3 rounded-xl border border-border bg-surface p-5 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-semibold [overflow-wrap:anywhere] hyphens-auto">{t(`${industry}.navName`)}</span>
        <span className="mt-1 block leading-relaxed text-muted">{t(`${industry}.summary`)}</span>
      </span>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="mt-0.5 size-5 shrink-0 text-accent"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </Link>
  );
}
