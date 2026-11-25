import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Industry } from "@/lib/industries";
import { industryPhotoSize, industryPhotos } from "@/lib/industry-photos";

// A card that leads to one trade's page; used on the start page and between the trade pages.
// The photo only illustrates the trade (the name below says it), so it has no alt text.
export function IndustryLink({ industry }: { industry: Industry }) {
  const t = useTranslations("Industry");
  return (
    <Link
      href={`/${industry}`}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className="block aspect-[3/2] overflow-hidden bg-border">
        <Image
          src={industryPhotos[industry]}
          alt=""
          {...industryPhotoSize}
          sizes="(min-width: 1024px) 330px, (min-width: 768px) 33vw, 100vw"
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      </span>
      <span className="flex min-h-11 flex-1 items-start gap-3 p-5">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold [overflow-wrap:anywhere] hyphens-auto">{t(`${industry}.navName`)}</span>
          <span className="mt-1 block leading-relaxed text-muted">{t(`${industry}.summary`)}</span>
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="mt-0.5 size-5 shrink-0 text-link"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
    </Link>
  );
}
