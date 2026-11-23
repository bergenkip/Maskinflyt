import { describe, expect, it } from "vitest";
import { dayMinutes, decimalHours, defaultHourRules, hasLevel2, parseHours, sheetFileName, sheetTotals, splitDay, toHourRules, validateDay, type HourRules } from "./hours";

const rules: HourRules = { ...defaultHourRules, overtime_after: 450, overtime_percent: 50, overtime2_after: 600, overtime2_percent: 100 };
const clock: HourRules = {
  ...defaultHourRules,
  overtime_mode: "clock",
  overtime_percent: 50,
  overtime2_percent: 100,
  overtime_from: "15:00",
  overtime_to: "19:00",
  overtime2_from: "19:00",
  overtime2_to: "06:00",
};
// A day as the form saves it.
const day = (starts: string, ends: string, breakMinutes = 0) => ({
  starts,
  ends,
  break_minutes: breakMinutes,
  worked_minutes: dayMinutes(starts, ends, breakMinutes),
});
const worked = (minutes: number) => ({ starts: "00:00", ends: "00:00", break_minutes: 0, worked_minutes: minutes });

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const period = { from: "2026-11-01", to: "2026-11-30" };

describe("hours sheet", () => {
  it("counts a day's minutes, past midnight too", () => {
    expect(dayMinutes("07:00", "15:00", 30)).toBe(450);
    expect(dayMinutes("20:00", "02:00", 0)).toBe(360);
    expect(dayMinutes("06:00", "18:00", 30)).toBe(690);
  });

  it("splits a day as the database does", () => {
    expect(splitDay(worked(450), rules)).toEqual({ normal: 450, overtime: 0, overtime2: 0 });
    expect(splitDay(worked(690), rules)).toEqual({ normal: 450, overtime: 150, overtime2: 90 });
    expect(splitDay(worked(500), rules)).toEqual({ normal: 450, overtime: 50, overtime2: 0 });
    // One level only: everything over it is the first level.
    expect(splitDay(worked(690), defaultHourRules)).toEqual({ normal: 480, overtime: 210, overtime2: 0 });
    expect(sheetTotals([worked(450), worked(690), worked(360)], rules)).toEqual({
      worked: 1500,
      normal: 1260,
      overtime: 150,
      overtime2: 90,
    });
  });

  it("splits a day by the clock as the database does", () => {
    // The same cases as supabase/tests/database/28_hour_clock_overtime.test.sql.
    expect(splitDay(day("07:00", "21:00", 30), clock)).toEqual({ normal: 450, overtime: 240, overtime2: 120 });
    expect(splitDay(day("22:00", "06:00", 30), clock)).toEqual({ normal: 0, overtime: 0, overtime2: 450 });
    expect(splitDay(day("05:00", "16:00", 60), clock)).toEqual({ normal: 480, overtime: 60, overtime2: 60 });
    const overlap = { ...clock, overtime_to: "06:00" };
    expect(splitDay(day("14:00", "20:00"), overlap)).toEqual({ normal: 60, overtime: 240, overtime2: 60 });
    const oneWindow = { ...clock, overtime_to: "06:00", overtime2_from: null, overtime2_to: null, overtime2_percent: null };
    expect(splitDay(day("14:00", "20:00"), oneWindow)).toEqual({ normal: 60, overtime: 300, overtime2: 0 });
    expect(hasLevel2(clock)).toBe(true);
    expect(hasLevel2(oneWindow)).toBe(false);
    // Every minute worked lands in exactly one level.
    for (const [starts, ends, pause] of [["06:30", "23:45", 45], ["18:10", "07:20", 0], ["00:00", "23:59", 90]] as const) {
      const d = day(starts, ends, pause);
      const split = splitDay(d, clock);
      expect(split.normal + split.overtime + split.overtime2).toBe(d.worked_minutes);
    }
  });

  it("reads the rules from a database row", () => {
    expect(toHourRules(null)).toEqual(defaultHourRules);
    expect(toHourRules({ overtime_mode: "clock", overtime_percent: 50, overtime_from: "15:00:00", overtime_to: "19:00:00" })).toEqual({
      ...defaultHourRules,
      overtime_mode: "clock",
      overtime_from: "15:00",
      overtime_to: "19:00",
    });
  });

  it("reads hours from the form, with a comma or a point", () => {
    expect(parseHours("7,5")).toBe(450);
    expect(parseHours("8")).toBe(480);
    expect(parseHours("7.75")).toBe(465);
    expect(parseHours("0,5")).toBeNull();
    expect(parseHours("25")).toBeNull();
    expect(parseHours("åtte")).toBeNull();
    expect(decimalHours(450)).toBe(7.5);
    expect(decimalHours(100)).toBe(1.67);
  });

  it("checks a day from the form", () => {
    expect(validateDay(form({ day: "2026-11-02", starts: "07:00", ends: "15:00", break: "30", note: "  Verksted   og kran " }), period)).toEqual({
      day: { day: "2026-11-02", starts: "07:00", ends: "15:00", break_minutes: 30, note: "Verksted og kran" },
    });
    expect(validateDay(form({ day: "2026-11-02", starts: "07:00", ends: "15:00", break: "" }), period)).toHaveProperty("day.break_minutes", 0);
    expect(validateDay(form({ day: "2026-12-01", starts: "7", ends: "07:00", break: "-1" }), period)).toEqual({
      errors: ["day", "starts", "break"],
    });
    expect(validateDay(form({ day: "2026-11-02", starts: "07:00", ends: "07:00", break: "0" }), period)).toEqual({ errors: ["ends"] });
    expect(validateDay(form({ day: "2026-11-02", starts: "07:00", ends: "08:00", break: "60" }), period)).toEqual({ errors: ["break"] });
    expect(validateDay(form({ day: "2026-11-02", starts: "07:00", ends: "08:00", note: "x".repeat(201) }), period)).toEqual({ errors: ["note"] });
  });

  it("names the PDF file safely", () => {
    expect(sheetFileName("Sander Lie", "2026-11-01", "2026-11-30")).toBe("Timeliste-Sander-Lie-2026-11-01-2026-11-30.pdf");
    expect(sheetFileName("Žydrūnas Ærø Østby", "2026-11-01", "2026-11-30")).toBe("Timeliste-Zydrunas-Aero-Ostby-2026-11-01-2026-11-30.pdf");
    expect(sheetFileName('"/..', "2026-11-01", "2026-11-30")).toBe("Timeliste-2026-11-01-2026-11-30.pdf");
  });
});
