import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";

// Back to the job list, at the top of a job's pages.
export function BackLink({ label }: { label: string }) {
  return (
    <Link
      href="/app/jobs"
      className="-ml-2 flex min-h-11 w-fit items-center gap-1.5 rounded-lg px-2 font-medium text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <ArrowRightIcon className="size-5 rotate-180" />
      {label}
    </Link>
  );
}
