import { describe, expect, it } from "vitest";
import {
  assignableRoles,
  canEditVehicles,
  canManage,
  canSeeVehicles,
  invitableRoles,
  needsMfa,
  roles,
  secondStepDone,
} from "./roles";

describe("roles", () => {
  it("owners manage everyone, admins never owners, others nobody", () => {
    expect(canManage("owner", "owner")).toBe(true);
    expect(canManage("admin", "owner")).toBe(false);
    expect(canManage("admin", "dispatcher")).toBe(true);
    expect(canManage("dispatcher", "driver")).toBe(false);
    expect(canManage("driver", "driver")).toBe(false);
  });

  it("only owners can give the owner role", () => {
    expect(assignableRoles("owner")).toContain("owner");
    expect(assignableRoles("admin")).not.toContain("owner");
    expect(assignableRoles("dispatcher")).toEqual([]);
  });

  it("nobody is invited as owner", () => {
    expect(invitableRoles("owner")).toEqual(["admin", "dispatcher", "driver"]);
    expect(invitableRoles("admin")).toEqual(["admin", "dispatcher", "driver"]);
    expect(invitableRoles("driver")).toEqual([]);
  });
});

describe("needsMfa", () => {
  it("asks owners and admins for a code, not dispatchers or drivers", () => {
    expect(roles.filter(needsMfa)).toEqual(["owner", "admin"]);
  });
});

describe("vehicles", () => {
  it("owners and admins change machines, dispatchers only see them, drivers neither", () => {
    expect(roles.filter(canEditVehicles)).toEqual(["owner", "admin"]);
    expect(roles.filter(canSeeVehicles)).toEqual(["owner", "admin", "dispatcher"]);
  });
});

describe("secondStepDone", () => {
  it("accepts a session created from an e-mailed link or code", () => {
    expect(secondStepDone({ aal: "aal1", amr: [{ method: "otp", timestamp: 1 }] })).toBe(true);
    expect(secondStepDone({ amr: [{ method: "magiclink", timestamp: 1 }] })).toBe(true);
    expect(secondStepDone({ aal: "aal2", amr: [{ method: "password", timestamp: 1 }] })).toBe(true);
    // The sign-up confirmation link proves the e-mail address the same way.
    expect(secondStepDone({ aal: "aal1", amr: [{ method: "email/signup", timestamp: 1 }] })).toBe(true);
  });

  it("rejects a password-only session and malformed claims", () => {
    expect(secondStepDone({ aal: "aal1", amr: [{ method: "password", timestamp: 1 }] })).toBe(false);
    expect(secondStepDone({ amr: [{ method: "totp" }] })).toBe(false);
    expect(secondStepDone({ amr: "otp" })).toBe(false);
    expect(secondStepDone({ amr: [null] })).toBe(false);
    expect(secondStepDone({})).toBe(false);
    expect(secondStepDone(null)).toBe(false);
    expect(secondStepDone(undefined)).toBe(false);
  });
});
