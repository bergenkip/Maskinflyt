import { describe, expect, it } from "vitest";
import { isJobStep, mapHref, nextSteps, phoneHref } from "./progress";

describe("the driver's next steps", () => {
  it("follows accepted → on the way → arrived → finished, with breaks", () => {
    expect(nextSteps(null)).toEqual(["accepted", "on_the_way"]);
    expect(nextSteps("accepted")).toEqual(["on_the_way"]);
    expect(nextSteps("on_the_way")).toEqual(["arrived"]);
    expect(nextSteps("arrived")).toEqual(["finished", "break_started"]);
    expect(nextSteps("on_break")).toEqual(["break_ended"]);
    expect(nextSteps("finished")).toEqual([]);
  });

  it("knows only real steps", () => {
    expect(isJobStep("arrived")).toBe(true);
    expect(isJobStep("note")).toBe(false);
    expect(isJobStep("on_break")).toBe(false);
  });
});

describe("contact links", () => {
  it("finds a phone number in the site contact", () => {
    expect(phoneHref("Per, 912 34 567")).toBe("tel:91234567");
    expect(phoneHref("Kari +47 412 34 567")).toBe("tel:+4741234567");
    expect(phoneHref("Per at the gate")).toBeUndefined();
    expect(phoneHref("Gate 12")).toBeUndefined();
    expect(phoneHref(null)).toBeUndefined();
  });

  it("puts the address on a map", () => {
    expect(mapHref("Storgata 1, 0155 Oslo")).toBe("https://www.google.com/maps/search/?api=1&query=Storgata%201%2C%200155%20Oslo");
  });
});
