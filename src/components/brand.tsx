import Link from "next/link";

export function Brand({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="-mx-1 flex min-h-11 items-center gap-2 rounded-lg px-1 text-lg font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-7 text-accent"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 7h11l-3-3M20 17H9l3 3" />
      </svg>
      Maskinflyt
    </Link>
  );
}
