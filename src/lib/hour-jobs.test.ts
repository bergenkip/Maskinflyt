import { describe, expect, it } from "vitest";
import { approvedMinutes, jobSearchRange, jobsInSheet, monthRange, shiftMonth } from "./hour-jobs";

const oslo = "Europe/Oslo";
const job = (id: string, starts_at: string, driver_id: string | null = "sander") => ({ id, starts_at, driver_id });
const sheet = { user_id: "sander", period_from: "2026-11-01", period_to: "2026-11-30" };

describe("jobs behind an hours sheet", () => {
  it("picks the employee's jobs on the sheet's local days, in time order", () => {
    const jobs = [
      job("late", "2026-11-20T09:00:00Z"),
      // 00:30 on 1 November in Oslo, still 31 October in UTC.
      job("first", "2026-10-31T23:30:00Z"),
      // 00:30 on 1 December in Oslo: outside.
      job("december", "2026-11-30T23:30:00Z"),
      job("other", "2026-11-10T09:00:00Z", "kari"),
      job("none", "2026-11-11T09:00:00Z", null),
    ];
    expect(jobsInSheet(jobs, sheet, oslo).map((j) => j.id)).toEqual(["first", "late"]);
  });

  it("takes the latest approved time", () => {
    expect(approvedMinutes({ job_times: [] })).toBeNull();
    expect(
      approvedMinutes({
        job_times: [
          { worked_minutes: 300, created_at: "2026-11-02T10:00:00Z" },
          { worked_minutes: 330, created_at: "2026-11-03T08:00:00Z" },
        ],
      }),
    ).toBe(330);
  });

  it("works with months", () => {
    expect(monthRange("2026-11")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange("2026-13")).toBeNull();
    expect(monthRange("november")).toBeNull();
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(jobSearchRange("2026-11-01", "2026-11-30")).toEqual({ from: "2026-10-31T00:00:00.000Z", to: "2026-12-02T00:00:00.000Z" });
  });
});
