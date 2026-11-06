import { describe, expect, it } from "vitest";
import {
  assignableRoles,
  canChooseMainMachines,
  canEditCustomerRates,
  canGrantPermissions,
  canEditVehicles,
  canManage,
  canSeeCustomers,
  canSeeInvoices,
  canSeeJobs,
  canSeeVehicles,
  grantablePermissions,
  invitableRoles,
  isPermission,
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
    expect(invitableRoles("owner")).toEqual(["admin", "dispatcher", "driver", "accountant"]);
    expect(invitableRoles("admin")).toEqual(["admin", "dispatcher", "driver", "accountant"]);
    expect(invitableRoles("driver")).toEqual([]);
  });
});

describe("needsMfa", () => {
  it("asks owners, admins and accountants for a code, not dispatchers or drivers", () => {
    expect(roles.filter(needsMfa)).toEqual(["owner", "admin", "accountant"]);
  });
});

describe("vehicles", () => {
  it("owners and admins change machines, dispatchers only see them, drivers neither", () => {
    expect(roles.filter(canEditVehicles)).toEqual(["owner", "admin"]);
    expect(roles.filter(canSeeVehicles)).toEqual(["owner", "admin", "dispatcher"]);
  });
});

describe("customers", () => {
  it("everyone but drivers keeps customers, only owners and admins set their prices", () => {
    expect(roles.filter(canSeeCustomers)).toEqual(["owner", "admin", "dispatcher"]);
    expect(roles.filter(canEditCustomerRates)).toEqual(["owner", "admin"]);
  });
});

describe("accountant", () => {
  it("sees the invoicing only: no planning, customers or machines", () => {
    expect(roles.filter(canSeeInvoices)).toEqual(["owner", "admin", "dispatcher", "accountant"]);
    expect(roles.filter(canSeeJobs)).toEqual(["owner", "admin", "dispatcher"]);
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

  describe("extra rights", () => {
    const driver = (...permissions: string[]) => ({ role: "driver" as const, permissions });

    it("plan_jobs plans like a dispatcher, with the invoicing, without the second step", () => {
      const planner = driver("plan_jobs");
      expect(canSeeJobs(planner)).toBe(true);
      expect(canSeeCustomers(planner)).toBe(true);
      expect(canSeeVehicles(planner)).toBe(true);
      expect(canChooseMainMachines(planner)).toBe(true);
      expect(canSeeInvoices(planner)).toBe(true);
      expect(canEditVehicles(planner)).toBe(false);
      expect(invitableRoles(planner)).toEqual([]);
      expect(needsMfa(planner)).toBe(false);
    });

    it("invoicing shows the invoices only, with the second step", () => {
      const invoicer = driver("invoicing");
      expect(canSeeInvoices(invoicer)).toBe(true);
      expect(canSeeJobs(invoicer)).toBe(false);
      expect(needsMfa(invoicer)).toBe(true);
    });

    it("machines changes machines and prices, with the second step", () => {
      const mechanic = { role: "dispatcher" as const, permissions: ["machines"] };
      expect(canEditVehicles(mechanic)).toBe(true);
      expect(canEditCustomerRates(mechanic)).toBe(true);
      expect(canSeeVehicles(driver("machines"))).toBe(true);
      expect(canSeeJobs(driver("machines"))).toBe(false);
      expect(needsMfa(mechanic)).toBe(true);
    });

    it("invite invites drivers and dispatchers only", () => {
      expect(invitableRoles(driver("invite"))).toEqual(["dispatcher", "driver"]);
      expect(invitableRoles({ role: "admin", permissions: ["invite"] })).toContain("admin");
      expect(needsMfa(driver("invite"))).toBe(true);
    });

    it("no rights is the plain role, and unknown rights count for nothing", () => {
      expect(canSeeJobs(driver())).toBe(false);
      expect(canSeeJobs(driver("everything"))).toBe(false);
      expect(isPermission("plan_jobs")).toBe(true);
      expect(isPermission("everything")).toBe(false);
    });

    it("owners and admins give the rights that add something, to the other roles", () => {
      expect(grantablePermissions("driver")).toEqual(["plan_jobs", "invoicing", "machines", "invite"]);
      expect(grantablePermissions("dispatcher")).toEqual(["machines", "invite"]);
      expect(grantablePermissions("accountant")).toEqual(["plan_jobs", "machines", "invite"]);
      expect(grantablePermissions("admin")).toEqual([]);
      expect(canGrantPermissions("admin", "driver")).toBe(true);
      expect(canGrantPermissions("owner", "admin")).toBe(false);
      expect(canGrantPermissions("dispatcher", "driver")).toBe(false);
    });
  });
});
