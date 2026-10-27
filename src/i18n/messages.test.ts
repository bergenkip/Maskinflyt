import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import lt from "../../messages/lt.json";
import nb from "../../messages/nb.json";

function keysOf(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keysOf(child, prefix ? `${prefix}.${key}` : key),
  );
}

function emptyKeys(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") return value.trim() === "" ? [prefix] : [];
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    emptyKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

const reference = keysOf(en).sort();

describe.each([
  ["nb", nb],
  ["en", en],
  ["lt", lt],
])("messages/%s.json", (_name, messages) => {
  it("has exactly the same keys as en.json", () => {
    expect(keysOf(messages).sort()).toEqual(reference);
  });

  it("has no empty texts", () => {
    expect(emptyKeys(messages)).toEqual([]);
  });
});
