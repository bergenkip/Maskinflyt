import { describe, expect, it } from "vitest";
import { services } from "./company-page";
import { cleanPlace, directoryPath, serviceFromSlug, serviceSlugs, wantedService } from "./directory";

describe("catalog addresses", () => {
  it("gives every service its own plain address, and reads it back", () => {
    const slugs = services.map((service) => serviceSlugs[service]);
    expect(new Set(slugs).size).toBe(services.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z]+$/);
    for (const service of services) expect(serviceFromSlug(serviceSlugs[service])).toBe(service);
    expect(serviceFromSlug("rakett")).toBeNull();
  });

  it("takes a service from the form by address or key, otherwise all", () => {
    expect(wantedService("kranbil")).toBe("crane_truck");
    expect(wantedService("crane_truck")).toBe("crane_truck");
    expect(wantedService("")).toBeNull();
    expect(wantedService(["kranbil"])).toBeNull();
  });

  it("cleans the place and builds the search address", () => {
    expect(cleanPlace("  Bergen \n sentrum ")).toBe("Bergen sentrum");
    expect(cleanPlace("x".repeat(150))).toHaveLength(100);
    expect(directoryPath(null)).toBe("/finn");
    expect(directoryPath("snow_clearing")).toBe("/finn/broyting");
    expect(directoryPath("crane_truck", " Ålesund ")).toBe("/finn/kranbil?sted=%C3%85lesund");
    expect(directoryPath(null, "Bergen")).toBe("/finn?sted=Bergen");
  });
});
