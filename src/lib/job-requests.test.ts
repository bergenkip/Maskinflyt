import { describe, expect, it } from "vitest";
import { validateJobRequest } from "./job-requests";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

const today = "2026-11-24";
const complete = {
  name: "  Kari   Nordmann ",
  phone: "+47 912 34 567",
  email: "",
  place: " Strandgaten 1,  Bergen ",
  wantedDate: "2026-12-01",
  service: "crane_truck",
  description: "Løfte takstein til 3. etasje.\r\nHelst før lunsj.",
};

describe("validateJobRequest", () => {
  it("takes a picked time instead of a day", () => {
    const { fields } = validateJobRequest(form({ ...complete, wantedStart: "2026-12-01T11:00:00+01:00" }), today);
    expect(fields?.request_wanted_start).toBe("2026-12-01T10:00:00.000Z");
    expect(fields?.request_wanted_date).toBeNull();
    expect(validateJobRequest(form({ ...complete, wantedStart: "kl. 11" }), today).fieldErrors.wantedStart).toBe("slotTaken");
  });

  it("tidies a complete request for the database", () => {
    const { fields, fieldErrors } = validateJobRequest(form(complete), today);
    expect(fieldErrors).toEqual({});
    expect(fields).toEqual({
      request_name: "Kari Nordmann",
      request_phone: "+4791234567",
      request_email: null,
      request_place: "Strandgaten 1, Bergen",
      request_description: "Løfte takstein til 3. etasje.\nHelst før lunsj.",
      request_wanted_date: "2026-12-01",
      request_wanted_start: null,
      request_service: "crane_truck",
    });
  });

  it("needs a name, a place, a description and a phone or e-mail", () => {
    const { fields, fieldErrors } = validateJobRequest(form({ name: " ", place: "", description: "" }), today);
    expect(fields).toBeUndefined();
    expect(fieldErrors).toEqual({
      name: "nameRequired",
      phone: "contactRequired",
      place: "placeRequired",
      description: "descriptionRequired",
    });
  });

  it("takes an e-mail alone, and refuses a bad phone or e-mail", () => {
    expect(validateJobRequest(form({ ...complete, phone: "", email: "Kari@Nordmann.TEST " }), today).fields?.request_email).toBe(
      "kari@nordmann.test",
    );
    expect(validateJobRequest(form({ ...complete, phone: "12ab" }), today).fieldErrors.phone).toBe("phoneInvalid");
    expect(validateJobRequest(form({ ...complete, email: "kari@" }), today).fieldErrors.email).toBe("emailInvalid");
  });

  it("leaves out an empty date and service", () => {
    const { fields } = validateJobRequest(form({ ...complete, wantedDate: "", service: "" }), today);
    expect(fields?.request_wanted_date).toBeNull();
    expect(fields?.request_service).toBeNull();
  });

  it("accepts today up to two years ahead, and only real days", () => {
    const date = (wantedDate: string) => validateJobRequest(form({ ...complete, wantedDate }), today).fieldErrors.wantedDate;
    expect(date("2026-11-24")).toBeUndefined();
    expect(date("2028-11-23")).toBeUndefined();
    expect(date("2026-11-23")).toBe("dateInvalid");
    expect(date("2028-11-25")).toBe("dateInvalid");
    expect(date("2027-02-30")).toBe("dateInvalid");
    expect(date("i morgen")).toBe("dateInvalid");
  });

  it("refuses services that are not on the list and text that is too long", () => {
    const { fieldErrors } = validateJobRequest(
      form({ ...complete, service: "rocket", name: "K".repeat(101), place: "B".repeat(201), description: "x".repeat(2001) }),
      today,
    );
    expect(fieldErrors).toEqual({
      service: "serviceInvalid",
      name: "nameTooLong",
      place: "placeTooLong",
      description: "descriptionTooLong",
    });
  });
});
