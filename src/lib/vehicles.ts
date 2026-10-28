// Vehicle form rules, shared by the server actions and their tests. The
// database checks the same limits again (see the vehicles migration).

// "other": the company writes its own type name (type_name).
export const vehicleTypes = ["crane_truck", "crane_truck_grab", "tipper", "excavator", "wheel_loader", "other"] as const;
export type VehicleType = (typeof vehicleTypes)[number];

export function isVehicleType(value: unknown): value is VehicleType {
  return typeof value === "string" && (vehicleTypes as readonly string[]).includes(value);
}

// Types that may lift with a crane; only these ask for the crane capacity.
// An own type may be anything, so it may have a crane too.
export function hasCrane(type: VehicleType) {
  return type === "crane_truck" || type === "crane_truck_grab" || type === "other";
}

export const MAX_TYPE_NAME_LENGTH = 60;

export const MAX_VEHICLE_NAME_LENGTH = 100;
const MAX_RATE_ORE = 10_000_000; // 100 000 kr per hour
const MAX_PAYLOAD_KG = 100_000;
const MAX_CRANE_TM = 9999.9;
const MAX_MINUTES = 24 * 60;

// Spaces of any kind (people paste "1 450" with a no-break space from other apps).
const spaces = /[\s  ]/g;

// "ab 12345" and "AB-12345" are the same plates: stored as "AB12345".
// Empty means no plates (machines that never drive on public roads).
export function normalizeRegNumber(input: string): string | null | undefined {
  const value = input.replace(spaces, "").replace(/-/g, "").toUpperCase();
  if (value === "") return null;
  return /^[A-ZÆØÅ0-9]{2,10}$/.test(value) ? value : undefined;
}

// Norwegian plates are shown as "AB 12345"; anything else as stored.
export function formatRegNumber(stored: string) {
  const match = /^([A-ZÆØÅ]{2})(\d{4,5})$/.exec(stored);
  return match ? `${match[1]} ${match[2]}` : stored;
}

// A decimal number typed with a comma or a point and at most `decimals`
// decimals, as a whole number of the smallest unit (1 450,5 with 2 decimals is
// 145050). Strings only, so no floating-point rounding is involved.
function parseFixed(input: string, decimals: number): number | null | undefined {
  const value = input.replace(spaces, "");
  if (value === "") return null;
  const fractionPart = decimals > 0 ? `(?:[.,](\\d{1,${decimals}}))?` : "";
  const match = new RegExp(`^(\\d+)${fractionPart}$`).exec(value);
  if (!match) return undefined;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(decimals, "0") || "0");
  const result = whole * 10 ** decimals + fraction;
  return Number.isSafeInteger(result) ? result : undefined;
}

// "1 450" or "1450,50" (kroner) → 145050 øre.
export function parseMoneyToOre(input: string) {
  const ore = parseFixed(input, 2);
  if (ore === null || ore === undefined) return ore;
  return ore <= MAX_RATE_ORE ? ore : undefined;
}

// "20,5" tonne-metres → 20.5 (one decimal, as the database stores it).
export function parseCraneTm(input: string) {
  const tenths = parseFixed(input, 1);
  if (tenths === null || tenths === undefined) return tenths;
  return tenths > 0 && tenths <= MAX_CRANE_TM * 10 ? tenths / 10 : undefined;
}

// Whole kilograms: "12 000" → 12000.
export function parsePayloadKg(input: string) {
  const kg = parseFixed(input, 0);
  if (kg === null || kg === undefined) return kg;
  return kg > 0 && kg <= MAX_PAYLOAD_KG ? kg : undefined;
}

// Hours with up to two decimals: "2" → 120 minutes, "1,5" → 90. Empty is 0.
export function parseHoursToMinutes(input: string) {
  const hundredths = parseFixed(input, 2);
  if (hundredths === null) return 0;
  if (hundredths === undefined) return undefined;
  const minutes = Math.round((hundredths * 60) / 100);
  return minutes <= MAX_MINUTES ? minutes : undefined;
}

export type VehicleFieldError =
  | "typeInvalid"
  | "typeNameRequired"
  | "nameRequired"
  | "regNumberInvalid"
  | "craneInvalid"
  | "payloadInvalid"
  | "rateInvalid"
  | "minHoursInvalid";

export type VehicleFormValues = {
  type: string;
  typeName: string;
  name: string;
  regNumber: string;
  craneTm: string;
  payloadKg: string;
  hourlyRate: string;
  minHours: string;
};

export type VehicleFields = {
  type: VehicleType;
  type_name: string | null;
  name: string;
  reg_number: string | null;
  crane_tm: number | null;
  payload_kg: number | null;
  hourly_rate: number | null;
  min_billable_minutes: number;
};

// A row as the pages read it.
export type Vehicle = VehicleFields & { id: string; active: boolean };
export const vehicleColumns = "id, type, type_name, name, reg_number, crane_tm, payload_kg, hourly_rate, min_billable_minutes, active";

export function validateVehicle(formData: FormData): {
  values: VehicleFormValues;
  fieldErrors?: Partial<Record<keyof VehicleFormValues, VehicleFieldError>>;
  fields?: VehicleFields;
} {
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const values: VehicleFormValues = {
    type: text("type"),
    typeName: text("typeName").replace(/\s+/g, " "),
    name: text("name").replace(/\s+/g, " "),
    regNumber: text("regNumber"),
    craneTm: text("craneTm"),
    payloadKg: text("payloadKg"),
    hourlyRate: text("hourlyRate"),
    minHours: text("minHours"),
  };

  const type = isVehicleType(values.type) ? values.type : undefined;
  const regNumber = normalizeRegNumber(values.regNumber);
  // The crane field is hidden for types without a crane; anything left in it is ignored.
  const craneTm = type && hasCrane(type) ? parseCraneTm(values.craneTm) : null;
  const payloadKg = parsePayloadKg(values.payloadKg);
  const hourlyRate = parseMoneyToOre(values.hourlyRate);
  const minMinutes = parseHoursToMinutes(values.minHours);

  const fieldErrors: Partial<Record<keyof VehicleFormValues, VehicleFieldError>> = {};
  if (!type) fieldErrors.type = "typeInvalid";
  // The own type name is asked for (and kept) only with "other".
  const typeName = type === "other" ? values.typeName : null;
  if (typeName !== null && (typeName.length === 0 || typeName.length > MAX_TYPE_NAME_LENGTH)) {
    fieldErrors.typeName = "typeNameRequired";
  }
  if (values.name.length === 0 || values.name.length > MAX_VEHICLE_NAME_LENGTH) fieldErrors.name = "nameRequired";
  if (regNumber === undefined) fieldErrors.regNumber = "regNumberInvalid";
  if (craneTm === undefined) fieldErrors.craneTm = "craneInvalid";
  if (payloadKg === undefined) fieldErrors.payloadKg = "payloadInvalid";
  if (hourlyRate === undefined) fieldErrors.hourlyRate = "rateInvalid";
  if (minMinutes === undefined) fieldErrors.minHours = "minHoursInvalid";

  if (
    !type ||
    Object.keys(fieldErrors).length > 0 ||
    regNumber === undefined ||
    craneTm === undefined ||
    payloadKg === undefined ||
    hourlyRate === undefined ||
    minMinutes === undefined
  ) {
    return { values, fieldErrors };
  }

  return {
    values,
    fields: {
      type,
      type_name: typeName,
      name: values.name,
      reg_number: regNumber,
      crane_tm: craneTm,
      payload_kg: payloadKg,
      hourly_rate: hourlyRate,
      min_billable_minutes: minMinutes,
    },
  };
}

// A stored vehicle as editable text for the form ("1450,50" with a comma in
// Norwegian and Lithuanian, "1450.50" in English). The parsers accept both.
export function toFormValues(vehicle: VehicleFields, decimalSeparator: "," | "."): VehicleFormValues {
  const decimal = (value: number, decimals: number) => {
    const [whole, fraction = ""] = value.toFixed(decimals).split(".");
    const trimmed = fraction.replace(/0+$/, "");
    return trimmed ? `${whole}${decimalSeparator}${fraction}` : whole;
  };
  return {
    type: vehicle.type,
    typeName: vehicle.type_name ?? "",
    name: vehicle.name,
    regNumber: vehicle.reg_number ? formatRegNumber(vehicle.reg_number) : "",
    craneTm: vehicle.crane_tm === null ? "" : decimal(Number(vehicle.crane_tm), 1),
    payloadKg: vehicle.payload_kg === null ? "" : String(vehicle.payload_kg),
    hourlyRate: vehicle.hourly_rate === null ? "" : decimal(vehicle.hourly_rate / 100, 2),
    minHours: vehicle.min_billable_minutes === 0 ? "" : decimal(vehicle.min_billable_minutes / 60, 2),
  };
}
