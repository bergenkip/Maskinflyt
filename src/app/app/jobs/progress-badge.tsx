import { CheckIcon, CircleIcon, FlagIcon, MapPinIcon, NoteIcon, PauseCircleIcon, TruckIcon } from "@/components/icons";
import type { JobEventKind, JobProgress } from "@/lib/progress";

// The driver's step on a job, with an icon and words (never by colour alone).
export const progressIcon: Record<JobProgress | JobEventKind | "none", typeof CircleIcon> = {
  none: CircleIcon,
  accepted: CheckIcon,
  on_the_way: TruckIcon,
  arrived: MapPinIcon,
  on_break: PauseCircleIcon,
  break_started: PauseCircleIcon,
  break_ended: MapPinIcon,
  finished: FlagIcon,
  note: NoteIcon,
};
const tone: Record<JobProgress | "none", string> = {
  none: "text-muted",
  accepted: "text-accent",
  on_the_way: "text-accent",
  arrived: "text-success",
  on_break: "text-warning",
  finished: "text-success",
};

export function ProgressBadge({ progress, label }: { progress: JobProgress | null; label: string }) {
  const Icon = progressIcon[progress ?? "none"];
  return (
    <span className={`flex shrink-0 items-center gap-1 text-sm font-medium ${tone[progress ?? "none"]}`}>
      <Icon className="size-4" />
      {label}
    </span>
  );
}
