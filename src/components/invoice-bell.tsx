"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellIcon } from "./icons";

// The office's reminder in the header: finished jobs whose invoice is not yet
// marked as sent. The number is also in the link's name, never only a dot.
export function InvoiceBell({ count, label, countLabel }: { count: number; label: string; countLabel: string }) {
  const pathname = usePathname();
  return (
    <Link
      href="/app/invoices"
      aria-label={count > 0 ? `${label}: ${countLabel}` : label}
      title={count > 0 ? `${label}: ${countLabel}` : label}
      aria-current={pathname.startsWith("/app/invoices") ? "page" : undefined}
      className="relative flex size-11 items-center justify-center rounded-lg text-muted hover:bg-accent-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent"
    >
      <BellIcon />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs leading-none font-semibold text-on-accent tabular-nums ring-2 ring-surface"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
