import { describe, expect, it } from "vitest";
import {
  formatRegNumber,
  normalizeRegNumber,
  parseCraneTm,
  parseHoursToMinutes,
  parseMoneyToOre,
  parsePayloadKg,
  toFormValues,
  validateVehicle,
} from "./vehicles";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("normalizeRegNumber", () => {
  it.each([
    ["AB 12345", "AB12345"],
    ["ab-12345", "AB12345"],
    [" el 1234 ", "EL1234"],
    ["ÆØ 1234", "ÆØ1234"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeRegNumber(input)).toBe(expected);
  });

  it("empty means no plates", () => {
    expect(normalizeRegNumber("  ")).toBeNull();
  });

  it.each(["A", "AB/12345", "ABCDEFGHIJK", "AB_1"])("rejects %s", (input) => {
    expect(normalizeRegNumber(input)).toBeUndefined();
  });
});

describe("formatRegNumber", () => {
  it("shows Norwegian plates with a space", () => {
    expect(formatRegNumber("AB12345")).toBe("AB 12345");
  });
  it("leaves other plates as stored", () => {
    expect(formatRegNumber("LT123ABC")).toBe("LT123ABC");
  });
});

describe("parseMoneyToOre", () => {
  it.each([
    ["1450", 145000],
    ["1 450", 145000],
    ["1 450,5", 145050],
    ["1450.75", 145075],
    ["0", 0],
  ])("%s kr → %i øre", (input, expected) => {
    expect(parseMoneyToOre(input)).toBe(expected);
  });

  it("is exact where floating point is not (0.29 × 100 = 28.999…)", () => {
    expect(parseMoneyToOre("0,29")).toBe(29);
    expect(parseMoneyToOre("1 234,57")).toBe(123457);
  });

  it("empty means no rate", () => {
    expect(parseMoneyToOre("")).toBeNull();
  });

  it.each(["-100", "1,234", "1.234.5", "abc", "100001"])("rejects %s", (input) => {
    expect(parseMoneyToOre(input)).toBeUndefined();
  });
});

describe("parseCraneTm, parsePayloadKg, parseHoursToMinutes", () => {
  it("reads crane capacity with one decimal", () => {
    expect(parseCraneTm("20,5")).toBe(20.5);
    expect(parseCraneTm("20,55")).toBeUndefined();
    expect(parseCraneTm("0")).toBeUndefined();
  });
  it("reads payload in whole kilograms", () => {
    expect(parsePayloadKg("12 000")).toBe(12000);
    expect(parsePayloadKg("12,5")).toBeUndefined();
    expect(parsePayloadKg("200000")).toBeUndefined();
  });
  it("turns hours into minutes", () => {
    expect(parseHoursToMinutes("2")).toBe(120);
    expect(parseHoursToMinutes("1,5")).toBe(90);
    expect(parseHoursToMinutes("0.25")).toBe(15);
    expect(parseHoursToMinutes("")).toBe(0);
    expect(parseHoursToMinutes("25")).toBeUndefined();
  });
});

describe("validateVehicle", () => {
  const valid = {
    type: "crane_truck",
    name: "  Kranbil   1 ",
    regNumber: "ab 12345",
    craneTm: "20,5",
    payloadKg: "12000",
    hourlyRate: "1 450",
    minHours: "2",
  };

  it("returns the database fields", () => {
    expect(validateVehicle(form(valid)).fields).toEqual({
      type: "crane_truck",
      type_name: null,
      name: "Kranbil 1",
      reg_number: "AB12345",
      crane_tm: 20.5,
      payload_kg: 12000,
      hourly_rate: 145000,
      min_billable_minutes: 120,
      evening_from: null,
      evening_percent: null,
      evening_rate: null,
    });
  });

  it("reads a higher rate from a time of day, as a surcharge or another price", () => {
    const evening = (values: Record<string, string>) => validateVehicle(form({ ...valid, ...values }));
    expect(evening({ eveningFrom: "15:00", eveningKind: "percent", eveningValue: "50 %" }).fields).toMatchObject({
      evening_from: "15:00",
      evening_percent: 50,
      evening_rate: null,
    });
    expect(evening({ eveningFrom: "15:00", eveningKind: "rate", eveningValue: "2 175,50" }).fields).toMatchObject({
      evening_percent: null,
      evening_rate: 217550,
    });
    // Without a time, whatever else is left in the form means no higher rate.
    expect(evening({ eveningFrom: "", eveningKind: "rate", eveningValue: "x" }).fields?.evening_rate).toBeNull();
    expect(evening({ eveningFrom: "25:00", eveningKind: "percent", eveningValue: "50" }).fieldErrors).toEqual({
      eveningFrom: "eveningFromInvalid",
    });
    expect(evening({ eveningFrom: "15:00", eveningKind: "percent", eveningValue: "0" }).fieldErrors).toEqual({
      eveningValue: "eveningPercentInvalid",
    });
    expect(evening({ eveningFrom: "15:00", eveningKind: "percent", eveningValue: "501" }).fieldErrors).toEqual({
      eveningValue: "eveningPercentInvalid",
    });
    expect(evening({ eveningFrom: "15:00", eveningKind: "rate", eveningValue: "" }).fieldErrors).toEqual({
      eveningValue: "rateInvalid",
    });
    expect(evening({ eveningFrom: "15:00", eveningKind: "", eveningValue: "50" }).fieldErrors).toEqual({
      eveningKind: "eveningKindRequired",
    });
  });

  it("asks for an own type name only with \"other\"", () => {
    expect(validateVehicle(form({ ...valid, type: "other", typeName: "  Vilkikas " })).fields?.type_name).toBe("Vilkikas");
    expect(validateVehicle(form({ ...valid, type: "other", typeName: "" })).fieldErrors).toEqual({
      typeName: "typeNameRequired",
    });
    expect(validateVehicle(form({ ...valid, typeName: "Vilkikas" })).fields?.type_name).toBeNull();
  });

  it("ignores the crane field for a type without a crane", () => {
    expect(validateVehicle(form({ ...valid, type: "excavator", craneTm: "x" })).fields?.crane_tm).toBeNull();
  });

  it("reports every wrong field at once and keeps what was typed", () => {
    const result = validateVehicle(
      form({ type: "boat", name: "", regNumber: "?", craneTm: "", payloadKg: "-1", hourlyRate: "abc", minHours: "x" }),
    );
    expect(result.fields).toBeUndefined();
    expect(result.fieldErrors).toEqual({
      type: "typeInvalid",
      name: "nameRequired",
      regNumber: "regNumberInvalid",
      payloadKg: "payloadInvalid",
      hourlyRate: "rateInvalid",
      minHours: "minHoursInvalid",
    });
    expect(result.values.hourlyRate).toBe("abc");
  });
});

describe("toFormValues", () => {
  const stored = {
    type: "crane_truck" as const,
    type_name: null,
    name: "Kranbil 1",
    reg_number: "AB12345",
    crane_tm: 20.5,
    payload_kg: 12000,
    hourly_rate: 145050,
    min_billable_minutes: 90,
    evening_from: null,
    evening_percent: null,
    evening_rate: null,
  };

  it("uses the language's decimal separator and reads back to the same fields", () => {
    const values = toFormValues(stored, ",");
    expect(values).toMatchObject({ regNumber: "AB 12345", craneTm: "20,5", hourlyRate: "1450,50", minHours: "1,50" });
    expect(validateVehicle(form(values)).fields).toEqual(stored);
    expect(toFormValues({ ...stored, hourly_rate: 145000, min_billable_minutes: 120 }, ".")).toMatchObject({
      hourlyRate: "1450",
      minHours: "2",
    });
  });

  it("reads back a higher rate from the database's time", () => {
    const percent = { ...stored, evening_from: "15:00:00", evening_percent: 50 };
    expect(toFormValues(percent, ",")).toMatchObject({ eveningFrom: "15:00", eveningKind: "percent", eveningValue: "50" });
    expect(validateVehicle(form(toFormValues(percent, ","))).fields).toEqual({ ...percent, evening_from: "15:00" });
    const rate = { ...stored, evening_from: "16:30:00", evening_rate: 217550 };
    expect(toFormValues(rate, ",")).toMatchObject({ eveningKind: "rate", eveningValue: "2175,50" });
  });
});
