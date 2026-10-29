import { describe, expect, it } from "vitest";
import { addDays, calendarRange, minutesOnDay, parseDate, visibleHours, weekNumber, weekStart } from "./calendar";

const oslo = "Europe/Oslo";

describe("dates", () => {
  it("adds days across months and years", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it.each([
    ["2026-10-29", "2026-10-26"], // Thursday
    ["2026-10-26", "2026-10-26"], // Monday
    ["2026-11-01", "2026-10-26"], // Sunday
  ])("the week of %s starts on %s", (date, monday) => {
    expect(weekStart(date)).toBe(monday);
  });

  it.each([
    ["2026-10-29", 44],
    ["2026-01-01", 1],
    ["2027-01-01", 53],
    ["2027-01-04", 1],
  ])("%s is in week %s", (date, week) => {
    expect(weekNumber(date)).toBe(week);
  });

  it("takes only real dates from the address", () => {
    expect(parseDate("2026-11-02", "x")).toBe("2026-11-02");
    expect(parseDate("2026-02-30", "x")).toBe("x");
    expect(parseDate("02.11.2026", "x")).toBe("x");
    expect(parseDate(undefined, "x")).toBe("x");
  });
});

describe("calendarRange", () => {
  it("covers a day from midnight to midnight, also when the clocks change", () => {
    const day = calendarRange("2026-10-25", "day", oslo);
    expect(day.days).toEqual(["2026-10-25"]);
    expect(day.from.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(day.to.toISOString()).toBe("2026-10-25T23:00:00.000Z"); // 25 hours that day
  });

  it("covers a week from Monday", () => {
    const week = calendarRange("2026-10-29", "week", oslo);
    expect(week.days).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(week.from.toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect(week.to.toISOString()).toBe("2026-11-01T23:00:00.000Z");
  });
});

describe("the day timeline", () => {
  const job = { starts_at: "2026-11-02T06:00:00.000Z", ends_at: "2026-11-02T10:30:00.000Z" }; // 07:00–11:30 in Oslo

  it("places a job by local time", () => {
    expect(minutesOnDay(job, "2026-11-02", oslo)).toEqual({ start: 420, end: 690 });
  });

  it("clips a job over midnight to each day", () => {
    const night = { starts_at: "2026-11-02T21:00:00.000Z", ends_at: "2026-11-03T03:00:00.000Z" }; // 22:00–04:00
    expect(minutesOnDay(night, "2026-11-02", oslo)).toEqual({ start: 1320, end: 1440 });
    expect(minutesOnDay(night, "2026-11-03", oslo)).toEqual({ start: 0, end: 240 });
  });

  it("shows 06–20, or more when jobs need it", () => {
    expect(visibleHours([])).toEqual({ from: 6, to: 20 });
    expect(visibleHours([{ start: 420, end: 690 }])).toEqual({ from: 6, to: 20 });
    expect(visibleHours([{ start: 330, end: 1290 }])).toEqual({ from: 5, to: 22 });
    expect(visibleHours([{ start: 0, end: 1440 }])).toEqual({ from: 0, to: 24 });
  });
});
