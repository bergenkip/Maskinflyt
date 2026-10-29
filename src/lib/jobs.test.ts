import { describe, expect, it } from "vitest";
import { durationToMinutes, fromLocalParts, NEW_CUSTOMER, overlaps, toJobFormValues, toLocalParts, validateJob, type Job } from "./jobs";

const oslo = "Europe/Oslo";
const customer = "a2000000-0000-4000-8000-000000000001";
const vehicle = "a1000000-0000-4000-8000-000000000001";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const valid = {
  customerId: customer,
  vehicleId: vehicle,
  driverId: "",
  address: "  Storgata  1,  0155 Oslo ",
  siteContact: "",
  date: "2026-11-02",
  startTime: "07:00",
  durationHours: "4",
  durationMinutes: "30",
  timeNote: "  Kan  ta lengre tid ",
  description: "Løfte takstoler\nInngang fra baksiden",
};

describe("local time in Oslo", () => {
  it.each([
    // Winter (UTC+1) and summer (UTC+2).
    ["2026-11-02", "07:00", "2026-11-02T06:00:00.000Z"],
    ["2026-07-15", "07:00", "2026-07-15T05:00:00.000Z"],
    // The days the clocks change.
    ["2026-03-29", "01:30", "2026-03-29T00:30:00.000Z"],
    ["2026-03-29", "03:30", "2026-03-29T01:30:00.000Z"],
    ["2026-10-25", "05:00", "2026-10-25T04:00:00.000Z"],
    ["2026-12-31", "23:59", "2026-12-31T22:59:00.000Z"],
  ])("%s %s → %s", (date, time, iso) => {
    const instant = fromLocalParts(date, time, oslo);
    expect(instant?.toISOString()).toBe(iso);
    expect(toLocalParts(instant!, oslo)).toEqual({ date, time });
  });

  it.each([
    ["2026-03-29", "02:30"], // skipped in spring
    ["2026-02-31", "07:00"],
    ["2026-13-01", "07:00"],
    ["2026-11-02", "24:00"],
    ["2026-11-02", "7:00"],
    ["02.11.2026", "07:00"],
    ["", ""],
  ])("%s %s does not exist", (date, time) => {
    expect(fromLocalParts(date, time, oslo)).toBeUndefined();
  });
});

describe("validateJob", () => {
  it("accepts a job and stores times in UTC", () => {
    const { fieldErrors, fields } = validateJob(form(valid), oslo);
    expect(fieldErrors).toBeUndefined();
    expect(fields).toEqual({
      customer_id: customer,
      vehicle_id: vehicle,
      driver_id: null,
      address: "Storgata 1, 0155 Oslo",
      site_contact: null,
      starts_at: "2026-11-02T06:00:00.000Z",
      ends_at: "2026-11-02T10:30:00.000Z",
      time_note: "Kan ta lengre tid",
      description: "Løfte takstoler\nInngang fra baksiden",
    });
  });

  it("explains every wrong field and keeps what was typed", () => {
    const { values, fieldErrors, fields } = validateJob(
      form({ customerId: "", vehicleId: "x", driverId: "y", address: " ", siteContact: "a".repeat(101), date: "2026-11-02", startTime: "11:00", durationHours: "0", durationMinutes: "0", timeNote: "c".repeat(201), description: "b".repeat(2001) }),
      oslo,
    );
    expect(fields).toBeUndefined();
    expect(fieldErrors).toEqual({
      customerId: "customerRequired",
      vehicleId: "choiceInvalid",
      driverId: "choiceInvalid",
      address: "addressRequired",
      siteContact: "siteContactInvalid",
      durationHours: "durationInvalid",
      timeNote: "timeNoteTooLong",
      description: "descriptionTooLong",
    });
    expect(values.startTime).toBe("11:00");
  });

  it("asks for a date, a start time and a duration that exist", () => {
    expect(validateJob(form({ ...valid, date: "" }), oslo).fieldErrors).toEqual({ date: "dateInvalid" });
    expect(validateJob(form({ ...valid, startTime: "", durationHours: "25" }), oslo).fieldErrors).toEqual({
      startTime: "timeInvalid",
      durationHours: "durationInvalid",
    });
  });

  it("runs past midnight and counts real hours over a clock change", () => {
    const late = validateJob(form({ ...valid, startTime: "22:00", durationHours: "6", durationMinutes: "0" }), oslo).fields;
    expect([late?.starts_at, late?.ends_at]).toEqual(["2026-11-02T21:00:00.000Z", "2026-11-03T03:00:00.000Z"]);
    // The night the clocks go back: 01:00 + 3 hours is 03:00 by the clock, 3 real hours later.
    const night = validateJob(form({ ...valid, date: "2026-10-25", startTime: "01:00", durationHours: "3", durationMinutes: "0" }), oslo).fields;
    expect(Date.parse(night!.ends_at) - Date.parse(night!.starts_at)).toBe(3 * 3_600_000);
  });

  it("lets a new customer be added with the job", () => {
    const { fieldErrors, fields } = validateJob(form({ ...valid, customerId: NEW_CUSTOMER }), oslo);
    expect(fieldErrors).toBeUndefined();
    expect(fields?.customer_id).toBe(NEW_CUSTOMER);
  });
});

describe("durationToMinutes", () => {
  it.each([
    ["4", "30", 270],
    ["0", "15", 15],
    ["", "45", 45],
    ["24", "0", 1440],
    ["1", "", 60],
  ])("%s h %s min → %s", (hours, minutes, expected) => {
    expect(durationToMinutes(hours, minutes)).toBe(expected);
  });

  it.each([
    ["0", "0"],
    ["0", "10"],
    ["24", "15"],
    ["4,5", "0"],
    ["-1", "0"],
    ["2", "60"],
    ["x", "0"],
  ])("%s h %s min is refused", (hours, minutes) => {
    expect(durationToMinutes(hours, minutes)).toBeUndefined();
  });
});

describe("toJobFormValues", () => {
  const job: Job = {
    id: "j",
    number: 1,
    customer_id: customer,
    vehicle_id: null,
    driver_id: null,
    address: "Storgata 1",
    site_contact: null,
    starts_at: "2026-11-02T06:00:00.000Z",
    ends_at: "2026-11-02T10:30:00.000Z",
    time_note: null,
    description: null,
    status: "new",
    hourly_rate: null,
    customer_rate: false,
    created_by: null,
    created_at: "2026-10-29T10:00:00.000Z",
  };

  it("shows the job in local time, with its expected duration", () => {
    expect(toJobFormValues(job, oslo)).toMatchObject({
      date: "2026-11-02",
      startTime: "07:00",
      durationHours: "4",
      durationMinutes: "30",
      timeNote: "",
      vehicleId: "",
    });
  });

  it("keeps a job past midnight as a duration", () => {
    expect(toJobFormValues({ ...job, ends_at: "2026-11-02T23:30:00.000Z" }, oslo)).toMatchObject({ durationHours: "17", durationMinutes: "30" });
  });
});

describe("overlaps", () => {
  const span = (from: string, to: string) => ({ starts_at: `2026-11-02T${from}:00Z`, ends_at: `2026-11-02T${to}:00Z` });
  it.each([
    [span("06:00", "10:00"), span("09:00", "12:00"), true],
    [span("06:00", "10:00"), span("07:00", "08:00"), true],
    [span("06:00", "10:00"), span("10:00", "12:00"), false],
    [span("06:00", "10:00"), span("04:00", "06:00"), false],
  ])("%o and %o → %s", (a, b, expected) => {
    expect(overlaps(a, b)).toBe(expected);
    expect(overlaps(b, a)).toBe(expected);
  });
});
