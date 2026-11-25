import { describe, expect, it } from "vitest";
import { DEFAULT_WEEK, daysBetween, isoWeekday, minutesOn, openMinutes, workload, type LoadJob } from "./workload";

const tz = "Europe/Oslo";
// Oslo is UTC+1 in winter: 07:00 local is 06:00Z.
const job = (start: string, end: string, extra: Partial<LoadJob> = {}): LoadJob => ({
  starts_at: start,
  ends_at: end,
  status: "planned",
  vehicle_id: "v1",
  ...extra,
});

describe("isoWeekday", () => {
  it("counts Monday as 1 and Sunday as 7", () => {
    expect(isoWeekday("2026-11-23")).toBe(1);
    expect(isoWeekday("2026-11-29")).toBe(7);
  });
});

describe("openMinutes", () => {
  it("uses the weekday's hours, none on closed days and days off", () => {
    expect(openMinutes("2026-11-23", DEFAULT_WEEK, new Set())).toBe(480);
    expect(openMinutes("2026-11-28", DEFAULT_WEEK, new Set())).toBe(0);
    expect(openMinutes("2026-11-23", DEFAULT_WEEK, new Set(["2026-11-23"]))).toBe(0);
    expect(openMinutes("2026-11-28", [{ weekday: 6, opens: "08:00:00", closes: "12:30:00" }], new Set())).toBe(270);
  });
});

describe("minutesOn", () => {
  it("clips a job to the day, by the local clock", () => {
    // 22:00–02:00 local: two hours on each day.
    const late = job("2026-11-23T21:00:00Z", "2026-11-24T01:00:00Z");
    expect(minutesOn(late, "2026-11-23", tz)).toBe(120);
    expect(minutesOn(late, "2026-11-24", tz)).toBe(120);
    expect(minutesOn(late, "2026-11-25", tz)).toBe(0);
  });

  it("knows the day the clocks go back has 25 hours", () => {
    // 2026-10-25 in Oslo: midnight is 22:00Z the day before, the next midnight 23:00Z.
    expect(minutesOn(job("2026-10-24T20:00:00Z", "2026-10-26T01:00:00Z"), "2026-10-25", tz)).toBe(25 * 60);
  });
});

describe("workload", () => {
  const options = { timeZone: tz, activeMachines: 2, week: DEFAULT_WEEK, daysOff: new Set<string>() };

  it("adds jobs, hours, machines and how busy they are", () => {
    const load = workload(
      [
        job("2026-11-23T06:00:00Z", "2026-11-23T10:00:00Z"), // 07–11, machine 1
        job("2026-11-23T11:00:00Z", "2026-11-23T13:00:00Z", { vehicle_id: "v2", status: "done" }), // 12–14
        job("2026-11-23T06:00:00Z", "2026-11-23T08:00:00Z", { vehicle_id: null, status: "new" }), // no machine
        job("2026-11-23T06:00:00Z", "2026-11-23T14:00:00Z", { status: "cancelled" }),
        job("2026-11-24T06:00:00Z", "2026-11-24T14:00:00Z"), // another day
      ],
      ["2026-11-23"],
      options,
    );
    expect(load).toEqual({
      jobs: 3,
      done: 1,
      minutes: 8 * 60,
      machines: 2,
      bookedMinutes: 6 * 60,
      availableMinutes: 2 * 480,
      busy: 0.375,
    });
  });

  it("counts a job over several days once, with its hours on each day", () => {
    const load = workload([job("2026-11-23T06:00:00Z", "2026-11-24T14:00:00Z")], ["2026-11-23", "2026-11-24"], options);
    expect(load.jobs).toBe(1);
    expect(load.minutes).toBe(17 * 60 + 15 * 60);
  });

  it("has no busy share when nothing was available", () => {
    const weekend = workload([job("2026-11-28T06:00:00Z", "2026-11-28T10:00:00Z")], ["2026-11-28"], options);
    expect(weekend.busy).toBeNull();
    expect(weekend.minutes).toBe(240);
    expect(workload([], ["2026-11-23"], { ...options, activeMachines: 0 }).busy).toBeNull();
  });

  it("can be busier than the working day", () => {
    const load = workload([job("2026-11-23T05:00:00Z", "2026-11-23T17:00:00Z")], ["2026-11-23"], {
      ...options,
      activeMachines: 1,
    });
    expect(load.busy).toBe(1.5);
  });
});

describe("daysBetween", () => {
  it("lists every day, both ends included", () => {
    expect(daysBetween("2026-11-29", "2026-12-02")).toEqual(["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
    expect(daysBetween("2026-11-29", "2026-11-29")).toEqual(["2026-11-29"]);
  });
});
