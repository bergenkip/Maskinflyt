export const roles = ["owner", "admin", "dispatcher", "driver"] as const;
export type Role = (typeof roles)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (roles as readonly string[]).includes(value);
}

// Mirrors private.may_manage in the database, which is what actually decides.
// The UI only uses this to hide controls a person may not use.
export function canManage(actor: Role, target: Role): boolean {
  if (actor === "owner") return true;
  if (actor === "admin") return target !== "owner";
  return false;
}

// Roles the actor may give to a member (owner only by an owner).
export function assignableRoles(actor: Role): Role[] {
  if (actor === "owner") return [...roles];
  if (actor === "admin") return ["admin", "dispatcher", "driver"];
  return [];
}

// Nobody is invited straight in as owner; ownership is given later.
export function invitableRoles(actor: Role): Role[] {
  return assignableRoles(actor).filter((role) => role !== "owner");
}

// Mirror the RLS policies on vehicles: owners and admins add and change
// machines, dispatchers read the list to plan jobs, drivers do not see it.
export function canSeeVehicles(role: Role): boolean {
  return role !== "driver";
}

export function canEditVehicles(role: Role): boolean {
  return role === "owner" || role === "admin";
}

// Owners and admins manage people and the company, so after the password
// they also confirm with a link e-mailed to them (the database checks this too).
export function needsMfa(role: Role): boolean {
  return role === "owner" || role === "admin";
}

// Mirrors private.second_step_done in the database: the session was created
// from an e-mailed link or code ("otp" / "magiclink" in the JWT's amr list),
// including the sign-up confirmation link ("email/signup"), or it is at
// assurance level aal2.
export function secondStepDone(claims: unknown): boolean {
  if (!claims || typeof claims !== "object") return false;
  const { aal, amr } = claims as { aal?: unknown; amr?: unknown };
  if (aal === "aal2") return true;
  if (!Array.isArray(amr)) return false;
  return amr.some((entry) => {
    const method = (entry as { method?: unknown } | null)?.method;
    return method === "otp" || method === "magiclink" || method === "email/signup";
  });
}
