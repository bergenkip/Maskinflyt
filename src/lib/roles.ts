// The accountant (regnskapsfører) finishes the invoicing only (see the accountant migration).
export const roles = ["owner", "admin", "dispatcher", "driver", "accountant"] as const;
export type Role = (typeof roles)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (roles as readonly string[]).includes(value);
}

// Extra rights an owner or admin gives a dispatcher, driver or accountant, on
// top of the role (see the extra permissions migration). They only add.
export const permissions = ["plan_jobs", "invoicing", "machines", "invite"] as const;
export type Permission = (typeof permissions)[number];

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (permissions as readonly string[]).includes(value);
}

// What a member may do: the role, and any extra rights.
export type Access = Role | { role: Role; permissions?: readonly string[] };

function roleOf(access: Access): Role {
  return typeof access === "string" ? access : access.role;
}

function has(access: Access, permission: Permission): boolean {
  return typeof access !== "string" && (access.permissions ?? []).includes(permission);
}

// Mirrors private.has_role: plan_jobs counts as a dispatcher, invoicing as an accountant.
function plans(access: Access): boolean {
  const role = roleOf(access);
  return role === "owner" || role === "admin" || role === "dispatcher" || has(access, "plan_jobs");
}

function invoices(access: Access): boolean {
  return plans(access) || roleOf(access) === "accountant" || has(access, "invoicing");
}

function managesMachines(access: Access): boolean {
  const role = roleOf(access);
  return role === "owner" || role === "admin" || has(access, "machines");
}

// Which extra rights add something for this role (owners and admins have them all).
export function grantablePermissions(role: Role): Permission[] {
  if (role === "owner" || role === "admin") return [];
  if (role === "dispatcher") return ["machines", "invite"];
  if (role === "accountant") return ["plan_jobs", "machines", "invite"];
  return [...permissions];
}

// Mirrors public.set_member_permissions: owners and admins, for the other roles.
export function canGrantPermissions(actor: Role, target: Role): boolean {
  return (actor === "owner" || actor === "admin") && grantablePermissions(target).length > 0;
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
  if (actor === "admin") return ["admin", "dispatcher", "driver", "accountant"];
  return [];
}

// Nobody is invited straight in as owner; ownership is given later. With the
// invite right a member invites drivers and dispatchers (public.create_invitation).
export function invitableRoles(actor: Access): Role[] {
  const own = assignableRoles(roleOf(actor)).filter((role) => role !== "owner");
  if (own.length > 0) return own;
  return has(actor, "invite") ? ["dispatcher", "driver"] : [];
}

// Mirror the RLS policies on vehicles: owners and admins add and change
// machines, dispatchers read the list to plan jobs, drivers do not see it.
export function canSeeVehicles(access: Access): boolean {
  return plans(access) || managesMachines(access);
}

export function canEditVehicles(access: Access): boolean {
  return managesMachines(access);
}

// Owners and admins manage people and the company, and accountants handle the
// money, so after the password they also confirm with a link e-mailed to them
// (the database checks this too).
// Extra rights for money, machines or people need it too; planning does not (as for dispatchers).
export function needsMfa(access: Access): boolean {
  const role = roleOf(access);
  return (
    role === "owner" ||
    role === "admin" ||
    role === "accountant" ||
    has(access, "invoicing") ||
    has(access, "machines") ||
    has(access, "invite")
  );
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

// Mirror the RLS policies on customers: owners, admins and dispatchers add and
// change customers (orders come in by phone); drivers do not see the list.
export function canSeeCustomers(access: Access): boolean {
  return plans(access);
}

// A customer's own prices are set by owners and admins; dispatchers read them.
export function canEditCustomerRates(access: Access): boolean {
  return managesMachines(access);
}

// Mirror the RLS policies on jobs: owners, admins and dispatchers add, plan and
// change jobs; drivers will see their own jobs in a later stage.
export function canSeeJobs(access: Access): boolean {
  return plans(access);
}

// The invoicing: the office and the accountant (who sees finished jobs only).
export function canSeeInvoices(access: Access): boolean {
  return invoices(access);
}

// Mirrors public.set_main_machine: those who plan jobs choose each person's main machine.
export function canChooseMainMachines(access: Access): boolean {
  return plans(access);
}
