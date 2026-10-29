import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";

// Back to the customer list, at the top of a customer's pages.
export function BackLink({ label }: { label: string }) {
  return (
    <Link
      href="/app/customers"
      className="-ml-2 flex min-h-11 w-fit items-center gap-1.5 rounded-lg px-2 font-medium text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <ArrowRightIcon className="size-5 rotate-180" />
      {label}
    </Link>
  );
}
