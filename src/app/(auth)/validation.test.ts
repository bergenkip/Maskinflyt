import { describe, expect, it } from "vitest";
import { isInviteToken, safeNextPath, validateCredentials } from "./validation";

function form(email: string, password: string, firstName = "Anna", lastName = "Berg") {
  const data = new FormData();
  data.set("email", email);
  data.set("password", password);
  data.set("firstName", firstName);
  data.set("lastName", lastName);
  return data;
}

describe("validateCredentials", () => {
  it("accepts valid sign-up data and normalises the e-mail", () => {
    const result = validateCredentials(form("  Anna@FjordVerktoy.test ", "long-enough-1"), "signUp");
    expect(result.fieldErrors).toBeUndefined();
    expect(result.values.email).toBe("anna@fjordverktoy.test");
  });

  it("rejects an invalid e-mail", () => {
    expect(validateCredentials(form("anna@", "long-enough-1"), "signUp").fieldErrors).toEqual({
      email: "emailInvalid",
    });
  });

  it("requires at least 10 characters when signing up", () => {
    expect(validateCredentials(form("anna@a.test", "short"), "signUp").fieldErrors).toEqual({
      password: "passwordShort",
    });
  });

  it("only requires a password when signing in", () => {
    expect(validateCredentials(form("anna@a.test", "short"), "signIn").fieldErrors).toBeUndefined();
    expect(validateCredentials(form("anna@a.test", ""), "signIn").fieldErrors).toEqual({
      password: "passwordShort",
    });
  });

  it("requires first and last name when signing up, trimmed", () => {
    expect(validateCredentials(form("anna@a.test", "long-enough-1", "  ", ""), "signUp").fieldErrors).toEqual({
      firstName: "firstNameRequired",
      lastName: "lastNameRequired",
    });
    const result = validateCredentials(form("anna@a.test", "long-enough-1", "  Åse  Marie ", " Ødegård "), "signUp");
    expect(result.fieldErrors).toBeUndefined();
    expect(result.values).toMatchObject({ firstName: "Åse Marie", lastName: "Ødegård" });
  });

  it("rejects names over 100 characters", () => {
    expect(validateCredentials(form("anna@a.test", "long-enough-1", "A".repeat(101)), "signUp").fieldErrors).toEqual({
      firstName: "firstNameRequired",
    });
  });

  it("does not ask for a name when signing in", () => {
    expect(validateCredentials(form("anna@a.test", "x", "", ""), "signIn").fieldErrors).toBeUndefined();
  });
});

describe("safeNextPath", () => {
  it("keeps paths on this site", () => {
    expect(safeNextPath("/join/abc")).toBe("/join/abc");
  });

  it("refuses other hosts", () => {
    for (const value of ["https://evil.test", "//evil.test", "/\\evil.test", "", null]) {
      expect(safeNextPath(value)).toBe("/app");
    }
  });
});

describe("isInviteToken", () => {
  it("accepts only 64 lower-case hex characters", () => {
    expect(isInviteToken("a".repeat(64))).toBe(true);
    expect(isInviteToken("A".repeat(64))).toBe(false);
    expect(isInviteToken("a".repeat(63))).toBe(false);
    expect(isInviteToken("../../app")).toBe(false);
    expect(isInviteToken(undefined)).toBe(false);
  });
});
