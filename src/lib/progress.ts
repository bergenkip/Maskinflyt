// The driver's steps on a job, as the database allows them (see the
// driver_job_progress migration), and small helpers for the phone view.

export const jobProgresses = ["accepted", "on_the_way", "arrived", "on_break", "finished"] as const;
export type JobProgress = (typeof jobProgresses)[number];

export const jobSteps = ["accepted", "on_the_way", "arrived", "break_started", "break_ended", "finished"] as const;
export type JobStep = (typeof jobSteps)[number];
export type JobEventKind = JobStep | "note";

export const MAX_NOTE_LENGTH = 500;

export function isJobStep(value: unknown): value is JobStep {
  return typeof value === "string" && (jobSteps as readonly string[]).includes(value);
}

// The buttons a driver gets: the main next step first, then any other (a break).
export function nextSteps(progress: JobProgress | null): JobStep[] {
  switch (progress) {
    case null:
      return ["accepted", "on_the_way"];
    case "accepted":
      return ["on_the_way"];
    case "on_the_way":
      return ["arrived"];
    case "arrived":
      return ["finished", "break_started"];
    case "on_break":
      return ["break_ended"];
    case "finished":
      return [];
  }
}

// A phone number in the site contact ("Per, 912 34 567"), as a tel: link, or
// undefined when there is none. Norwegian numbers have 8 digits; +47 is kept.
export function phoneHref(contact: string | null): string | undefined {
  const match = contact?.match(/(\+?\d[\d ]{6,}\d)/);
  if (!match) return undefined;
  const digits = match[1].replace(/ /g, "");
  return /^\+?\d{8,15}$/.test(digits) ? `tel:${digits}` : undefined;
}

// The address on a map (Google Maps: the app when installed, else the website).
export function mapHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
