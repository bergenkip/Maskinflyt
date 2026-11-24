import { describe, expect, it } from "vitest";
import { groupSlots, validateHours, weekFromRows } from "./company-hours";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

describe("weekFromRows", () => {
  it("fills closed days with the usual hours", () => {
    const week = weekFromRows([{ weekday: 1, opens: "06:30:00", closes: "14:00:00" }]);
    expect(week[0]).toEqual({ weekday: 1, open: true, opens: "06:30", closes: "14:00" });
    expect(week[6]).toEqual({ weekday: 7, open: false, opens: "07:00", closes: "15:00" });
  });
});

describe("validateHours", () => {
  it("sends the open days only", () => {
    const { fields } = validateHours(
      form({ freeTimes: "on", bookingMinutes: "240", "open-1": "on", "opens-1": "07:00", "closes-1": "15:00", "opens-2": "07:00", "closes-2": "15:00" }),
    );
    expect(fields).toEqual({ show_free_times: true, booking_minutes: 240, week: [{ weekday: 1, opens: "07:00", closes: "15:00" }] });
  });

  it("refuses closing before opening, odd lengths, and free times without an open day", () => {
    const bad = validateHours(form({ bookingMinutes: "45", "open-3": "on", "opens-3": "15:00", "closes-3": "07:00" }));
    expect(bad.fields).toBeUndefined();
    expect(bad.dayErrors).toEqual({ 3: "timesInvalid" });
    expect(bad.fieldErrors).toEqual({ bookingMinutes: "lengthInvalid" });
    expect(validateHours(form({ freeTimes: "on", bookingMinutes: "120" })).fieldErrors).toEqual({ freeTimes: "noOpenDay" });
  });

  it("allows requests only with no open days", () => {
    expect(validateHours(form({ bookingMinutes: "120" })).fields).toEqual({ show_free_times: false, booking_minutes: 120, week: [] });
  });
});

describe("groupSlots", () => {
  it("groups free times by day in order", () => {
    const slot = (day: string, start: string) => ({ day, start_time: start, starts_at: `${day}T${start}:00+01:00` });
    expect(groupSlots([slot("2026-12-01", "07:00"), slot("2026-12-01", "11:00"), slot("2026-12-02", "07:00")]).map((d) => [d.day, d.slots.length])).toEqual([
      ["2026-12-01", 2],
      ["2026-12-02", 1],
    ]);
  });
});
