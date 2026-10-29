"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState, useTransition, type PointerEvent } from "react";
import { AlertIcon, PencilIcon, PlusIcon } from "@/components/icons";
import { draggedSpan, lanes, minutesOnDay } from "@/lib/calendar";
import type { JobStatus } from "@/lib/jobs";
import { moveJob, type Overlap } from "../actions";
import { StatusIcon } from "../status-badge";

export type TimelineJob = {
  id: string;
  number: number;
  starts_at: string;
  ends_at: string;
  status: JobStatus;
  customer: string;
  driver: string | null;
};
export type TimelineRow = { id: string; name: string; drivers: string[]; jobs: TimelineJob[] };
type Span = { starts_at: string; ends_at: string };
type Drag = { id: string; mode: "move" | "resize"; x: number; width: number; minutes: number; moved: boolean };
type Change = { job: TimelineJob; from: Span; to: Span };

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const barTone: Record<JobStatus, string> = {
  new: "border-warning/60 bg-warning-soft",
  planned: "border-accent/50 bg-accent-soft",
  done: "border-success/50 bg-success-soft",
  cancelled: "border-border bg-surface",
};
const pad = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

// The day as a timeline: a row per machine, jobs as bars. Open jobs can be dragged
// to another time or made longer by their right edge; the pencil opens the job
// (the keyboard and single-tap way to change the same times).
export function DayTimeline({
  date,
  timeZone,
  hours,
  rows,
  label,
}: {
  date: string;
  timeZone: string;
  hours: { from: number; to: number };
  rows: TimelineRow[];
  label: string;
}) {
  const t = useTranslations("Calendar");
  const tJobs = useTranslations("Jobs");
  const format = useFormatter();
  const router = useRouter();
  const [drag, setDrag] = useState<Drag | null>(null);
  // A change waiting for "save anyway", being saved, or just saved (to undo).
  const [asked, setAsked] = useState<(Change & { overlaps: Overlap[] }) | null>(null);
  const [saving, setSaving] = useState<Change | null>(null);
  const [done, setDone] = useState<Change | null>(null);
  const [failed, setFailed] = useState<"notMovable" | "unknown" | null>(null);
  const [pending, startTransition] = useTransition();
  const tap = useRef(false);

  const total = (hours.to - hours.from) * 60;
  const percent = (minutes: number) => ((minutes - hours.from * 60) / total) * 100;
  const hourList = Array.from({ length: hours.to - hours.from }, (_, i) => hours.from + i);
  const time = (iso: string) => format.dateTime(new Date(iso), { hour: "2-digit", minute: "2-digit", timeZone });
  const span = (s: Span) => tJobs("timeSpan", { start: time(s.starts_at), end: time(s.ends_at) });

  // Where each job is drawn now: while dragged, while asking or saving, or as saved.
  const shown = (job: TimelineJob): Span => {
    if (drag?.id === job.id) return draggedSpan(job, drag.mode, drag.minutes);
    if (asked?.job.id === job.id) return asked.to;
    if (saving?.job.id === job.id && pending) return saving.to;
    return job;
  };

  function save(change: Change, saveAnyway: boolean) {
    setFailed(null);
    setAsked(null);
    setSaving(change);
    startTransition(async () => {
      const result = await moveJob(change.job.id, change.to.starts_at, change.to.ends_at, saveAnyway);
      if (result.overlaps) setAsked({ ...change, overlaps: result.overlaps });
      else if (result.ok) {
        setDone(change);
        router.refresh();
      } else setFailed(result.error === "notMovable" ? "notMovable" : "unknown");
    });
  }

  function start(event: PointerEvent<HTMLElement>, job: TimelineJob, mode: Drag["mode"]) {
    if (event.button !== 0 || pending) return;
    const track = event.currentTarget.closest<HTMLElement>("[data-track]");
    if (!track) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    tap.current = true;
    setDrag({ id: job.id, mode, x: event.clientX, width: track.getBoundingClientRect().width, minutes: 0, moved: false });
  }

  function move(event: PointerEvent<HTMLElement>) {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 6) return;
    tap.current = false;
    setDrag({ ...drag, moved: true, minutes: (dx / drag.width) * total });
  }

  function end(job: TimelineJob) {
    if (!drag) return;
    const to = draggedSpan(job, drag.mode, drag.minutes);
    setDrag(null);
    if (tap.current) {
      // A tap without moving opens the job.
      router.push(`/app/jobs/${job.id}`);
      return;
    }
    if (to.starts_at !== job.starts_at || to.ends_at !== job.ends_at) {
      save({ job, from: { starts_at: job.starts_at, ends_at: job.ends_at }, to }, false);
    }
  }

  return (
    <div className="grid gap-3">
      {asked && (
        <div role="alert" className="grid gap-2 rounded-xl border border-warning/50 bg-warning-soft p-4">
          <p className="flex items-center gap-2 font-semibold">
            <AlertIcon className="size-5 text-warning" />
            {t("moveBusy", { number: asked.job.number, time: span(asked.to) })}
          </p>
          <ul className="grid list-disc gap-1 pl-6">
            {asked.overlaps.map((overlap) => (
              // Names are data and are shown exactly as entered.
              <li key={`${overlap.kind}-${overlap.number}`} className="[overflow-wrap:anywhere]">
                {tJobs(overlap.kind === "vehicle" ? "overlapVehicle" : "overlapDriver", {
                  name: overlap.name,
                  number: overlap.number,
                  customer: overlap.customer,
                  time: span({ starts_at: overlap.startsAt, ends_at: overlap.endsAt }),
                })}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => save(asked, true)}
              className={`min-h-11 rounded-lg bg-accent px-4 font-semibold text-on-accent hover:bg-accent/90 ${focusRing}`}
            >
              {tJobs("saveAnyway")}
            </button>
            <button
              type="button"
              onClick={() => setAsked(null)}
              className={`min-h-11 rounded-lg border border-border bg-surface px-4 font-medium hover:bg-accent-soft ${focusRing}`}
            >
              {t("keepTime")}
            </button>
          </div>
        </div>
      )}
      <div aria-live="polite">
        {failed && <p className="text-danger">{t(failed === "notMovable" ? "notMovable" : "moveFailed")}</p>}
        {done && !asked && !failed && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-success/50 bg-success-soft px-4 py-2">
            <span>{t("moved", { number: done.job.number, time: span(done.to) })}</span>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setDone(null);
                save({ job: { ...done.job, ...done.to }, from: done.to, to: done.from }, true);
              }}
              className={`min-h-11 rounded-lg px-2 font-semibold text-accent underline underline-offset-4 disabled:opacity-60 ${focusRing}`}
            >
              {t("undo")}
            </button>
          </p>
        )}
      </div>

      {/* Scrolls inside itself when narrow, never the page. */}
      <section aria-label={label} className="overflow-x-auto rounded-xl border border-border bg-surface">
        <div style={{ minWidth: `${12 + hourList.length * 3.5}rem` }}>
          <div className="grid grid-cols-[12rem_1fr] border-b border-border">
            <span className="px-3 py-2 text-sm font-medium text-muted">{t("byVehicle")}</span>
            <div className="relative h-9" aria-hidden="true">
              {hourList.map((hour) => (
                <span
                  key={hour}
                  className="absolute top-2 -translate-x-1/2 text-xs text-muted tabular-nums first:translate-x-0"
                  style={{ left: `${percent(hour * 60)}%` }}
                >
                  {String(hour).padStart(2, "0")}
                </span>
              ))}
            </div>
          </div>
          {rows.map((row) => {
            const placed = lanes(row.jobs.map((job) => ({ job, ...minutesOnDay(shown(job), date, timeZone) })));
            const laneCount = Math.max(1, ...placed.map((p) => p.lane + 1));
            const newJob = (hour: number) =>
              `/app/jobs/new?${new URLSearchParams({ date, start: pad(hour), ...(row.id ? { vehicle: row.id } : {}) })}`;
            return (
              <div
                key={row.id || "none"}
                role="group"
                aria-label={row.name}
                className="grid grid-cols-[12rem_1fr] border-b border-border last:border-b-0"
              >
                <div className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="grid min-w-0">
                    <span className="text-sm font-medium [overflow-wrap:anywhere]">{row.name}</span>
                    {row.drivers.length > 0 && (
                      <span className="text-xs text-muted [overflow-wrap:anywhere]">{row.drivers.join(", ")}</span>
                    )}
                  </span>
                  <Link
                    href={newJob(7)}
                    aria-label={t("newJobFor", { name: row.name })}
                    className={`flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-accent-soft hover:text-accent ${focusRing}`}
                  >
                    <PlusIcon className="size-5" />
                  </Link>
                </div>
                <div data-track className="relative" style={{ height: `${laneCount * 3.25 + 0.5}rem` }}>
                  {/* Each free hour starts a new job there (the + button does the same by keyboard). */}
                  {hourList.map((hour) => (
                    <Link
                      key={hour}
                      href={newJob(hour)}
                      tabIndex={-1}
                      aria-hidden="true"
                      title={t("newJobAt", { name: row.name, time: pad(hour) })}
                      className="absolute inset-y-0 border-l border-border/60 hover:bg-accent-soft/50"
                      style={{ left: `${percent(hour * 60)}%`, width: `${percent((hour + 1) * 60) - percent(hour * 60)}%` }}
                    />
                  ))}
                  {placed.map(({ job, start: from, end: to, lane }) => {
                    const now = shown(job);
                    const movable = job.status === "new" || job.status === "planned";
                    const dragged = drag?.id === job.id && drag.moved;
                    const status = tJobs(`statuses.${job.status}`);
                    const left = percent(Math.max(from, hours.from * 60));
                    const width = percent(Math.min(to, hours.to * 60)) - left;
                    return (
                      <div
                        key={job.id}
                        data-job={job.number}
                        title={t("jobLabel", { number: job.number, customer: job.customer, time: span(now), status })}
                        onPointerDown={movable ? (event) => start(event, job, "move") : undefined}
                        onPointerMove={move}
                        onPointerUp={() => end(job)}
                        onPointerCancel={() => setDrag(null)}
                        onClick={movable ? undefined : () => router.push(`/app/jobs/${job.id}`)}
                        className={`absolute flex h-11 min-w-[3.75rem] items-center overflow-hidden rounded-lg border text-sm shadow-sm select-none ${barTone[job.status]} ${movable ? "cursor-grab touch-none active:cursor-grabbing" : ""} ${dragged ? "z-10 shadow-lg ring-2 ring-accent" : ""}`}
                        style={{ left: `${left}%`, width: `${width}%`, top: `${lane * 3.25 + 0.25}rem` }}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-1.5 pl-2">
                          <StatusIcon status={job.status} />
                          <span className="grid min-w-0 leading-tight">
                            <span className="truncate font-semibold tabular-nums">
                              {span(now)}
                              {job.status !== "planned" && <span className="font-normal"> · {status}</span>}
                            </span>
                            <span className="truncate">
                              {job.customer}
                              {job.driver && <span className="text-muted"> · {job.driver}</span>}
                            </span>
                          </span>
                        </span>
                        <Link
                          href={`/app/jobs/${job.id}`}
                          aria-label={t("editJob", { number: job.number, customer: job.customer, time: span(now), status })}
                          onPointerDown={(event) => event.stopPropagation()}
                          className={`flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface/70 hover:text-accent ${focusRing}`}
                        >
                          <PencilIcon className="size-4" />
                        </Link>
                        {movable && (
                          // The right edge: drag to make the job longer or shorter.
                          <span
                            aria-hidden="true"
                            data-resize
                            onPointerDown={(event) => start(event, job, "resize")}
                            className="flex h-full w-3 shrink-0 cursor-ew-resize items-center justify-center border-l border-current/15 hover:bg-surface/70"
                          >
                            <span className="h-4 w-0.5 rounded-full bg-current opacity-40" />
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <p className="text-sm text-muted">{t("dragHint")}</p>
    </div>
  );
}
