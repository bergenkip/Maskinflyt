import { CheckCircleIcon, CircleIcon, ClockIcon, XCircleIcon } from "@/components/icons";
import type { JobStatus } from "@/lib/jobs";

const looks: Record<JobStatus, { icon: typeof CircleIcon; tone: string }> = {
  new: { icon: CircleIcon, tone: "text-warning" },
  planned: { icon: ClockIcon, tone: "text-accent" },
  done: { icon: CheckCircleIcon, tone: "text-success" },
  cancelled: { icon: XCircleIcon, tone: "text-muted" },
};

// A job's status with an icon and words, never by colour alone.
export function StatusBadge({ status, label, size = "sm" }: { status: JobStatus; label: string; size?: "sm" | "md" }) {
  const { icon: Icon, tone } = looks[status];
  return (
    <span className={`flex shrink-0 items-center gap-1 font-medium ${tone} ${size === "sm" ? "text-sm" : ""}`}>
      <Icon className={size === "sm" ? "size-4" : "size-5"} />
      {label}
    </span>
  );
}
