import { describe, expect, it } from "vitest";
import { assignableRoles, canManage, invitableRoles, needsMfa, roles, secondStepDone } from "./roles";

describe("roles", () => {
  it("owners manage everyone, admins never owners, others nobody", () => {
    expect(canManage("owner", "owner")).toBe(true);
    expect(canManage("admin", "owner")).toBe(false);
    expect(canManage("admin", "operator")).toBe(true);
    expect(canManage("operator", "viewer")).toBe(false);
    expect(canManage("viewer", "viewer")).toBe(false);
  });

  it("only owners can give the owner role", () => {
    expect(assignableRoles("owner")).toContain("owner");
    expect(assignableRoles("admin")).not.toContain("owner");
    expect(assignableRoles("operator")).toEqual([]);
  });

  it("nobody is invited as owner", () => {
    expect(invitableRoles("owner")).toEqual(["admin", "operator", "viewer"]);
    expect(invitableRoles("admin")).toEqual(["admin", "operator", "viewer"]);
    expect(invitableRoles("viewer")).toEqual([]);
  });
});

describe("needsMfa", () => {
  it("asks owners and admins for a code, not operators or viewers", () => {
    expect(roles.filter(needsMfa)).toEqual(["owner", "admin"]);
  });
});

describe("secondStepDone", () => {
  it("accepts a session created from an e-mailed link or code", () => {
    expect(secondStepDone({ aal: "aal1", amr: [{ method: "otp", timestamp: 1 }] })).toBe(true);
    expect(secondStepDone({ amr: [{ method: "magiclink", timestamp: 1 }] })).toBe(true);
    expect(secondStepDone({ aal: "aal2", amr: [{ method: "password", timestamp: 1 }] })).toBe(true);
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
