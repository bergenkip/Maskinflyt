import { describe, expect, it } from "vitest";
import { splitMinutes, toTimeFormValues, validateTime } from "./job-time";

const tz = "Europe/Oslo";
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

describe("validateTime", () => {
  const valid = { date: "2026-11-02", start: "07:00", end: "16:00", breaks: "30", reason: "" };

  it("returns the instants in the company's time zone", () => {
    expect(validateTime(form(valid), tz).fields).toEqual({
      started_at: "2026-11-02T06:00:00.000Z",
      ended_at: "2026-11-02T15:00:00.000Z",
      break_minutes: 30,
      reason: null,
    });
  });

  it("reads an end before the start as the next morning", () => {
    expect(validateTime(form({ ...valid, start: "20:00", end: "02:00", breaks: "" }), tz).fields).toMatchObject({
      ended_at: "2026-11-03T01:00:00.000Z",
      break_minutes: 0,
    });
  });

  it("keeps the reason, trimmed", () => {
    expect(validateTime(form({ ...valid, reason: "  Glemte å trykke  " }), tz).fields?.reason).toBe("Glemte å trykke");
  });

  it("reports what is wrong", () => {
    expect(validateTime(form({ ...valid, date: "x" }), tz).fieldErrors).toEqual({ date: "dateInvalid" });
    expect(validateTime(form({ ...valid, start: "25:00" }), tz).fieldErrors).toEqual({ start: "startInvalid" });
    expect(validateTime(form({ ...valid, end: "" }), tz).fieldErrors).toEqual({ end: "endInvalid" });
    expect(validateTime(form({ ...valid, breaks: "540" }), tz).fieldErrors).toEqual({ breaks: "breaksInvalid" });
    expect(validateTime(form({ ...valid, breaks: "-5" }), tz).fieldErrors).toEqual({ breaks: "breaksInvalid" });
    expect(validateTime(form({ ...valid, reason: "x".repeat(501) }), tz).fieldErrors).toEqual({ reason: "reasonTooLong" });
  });
});

describe("toTimeFormValues", () => {
  it("reads back to the same time", () => {
    const stored = { started_at: "2026-11-02T06:00:00.000Z", ended_at: "2026-11-02T15:00:00.000Z", break_minutes: 30 };
    const values = toTimeFormValues(stored, tz);
    expect(values).toEqual({ date: "2026-11-02", start: "07:00", end: "16:00", breaks: "30", reason: "" });
    expect(validateTime(form(values), tz).fields).toMatchObject(stored);
  });
});

describe("splitMinutes", () => {
  it("splits minutes into hours and minutes", () => {
    expect(splitMinutes(510)).toEqual({ hours: 8, minutes: 30 });
    expect(splitMinutes(45)).toEqual({ hours: 0, minutes: 45 });
  });
});
