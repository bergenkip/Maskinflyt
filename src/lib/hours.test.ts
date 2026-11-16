import { describe, expect, it } from "vitest";
import { dayMinutes, decimalHours, defaultHourRules, parseHours, sheetFileName, sheetTotals, splitDay, validateDay } from "./hours";

const rules = { overtime_after: 450, overtime_percent: 50, overtime2_after: 600, overtime2_percent: 100 };

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
    expect(splitDay(450, rules)).toEqual({ normal: 450, overtime: 0, overtime2: 0 });
    expect(splitDay(690, rules)).toEqual({ normal: 450, overtime: 150, overtime2: 90 });
    expect(splitDay(500, rules)).toEqual({ normal: 450, overtime: 50, overtime2: 0 });
    // One level only: everything over it is the first level.
    expect(splitDay(690, defaultHourRules)).toEqual({ normal: 480, overtime: 210, overtime2: 0 });
    expect(sheetTotals([{ worked_minutes: 450 }, { worked_minutes: 690 }, { worked_minutes: 360 }], rules)).toEqual({
      worked: 1500,
      normal: 1260,
      overtime: 150,
      overtime2: 90,
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
