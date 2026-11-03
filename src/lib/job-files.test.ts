import { describe, expect, it } from "vitest";
import { isJobFileKind, jobFilePath, MAX_SIGNER_LENGTH, normalizeSigner, sniffImage } from "./job-files";

describe("sniffImage", () => {
  it("knows JPEG and PNG by their first bytes", () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe("jpg");
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))).toBe("png");
  });

  it("refuses anything else, whatever its name says", () => {
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(sniffImage(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});

describe("jobFilePath", () => {
  it("puts the file in its company's and job's folder", () => {
    expect(jobFilePath("org", "job", "file", "jpg")).toBe("org/job/file.jpg");
  });
});

describe("normalizeSigner", () => {
  it("keeps the name as written, with tidy spaces", () => {
    expect(normalizeSigner("  Per   Kristian  Ødegård ")).toBe("Per Kristian Ødegård");
  });

  it("refuses an empty or too long name", () => {
    expect(normalizeSigner("   ")).toBeUndefined();
    expect(normalizeSigner("x".repeat(MAX_SIGNER_LENGTH + 1))).toBeUndefined();
  });
});

describe("isJobFileKind", () => {
  it("accepts photos and signatures only", () => {
    expect(isJobFileKind("photo")).toBe(true);
    expect(isJobFileKind("signature")).toBe(true);
    expect(isJobFileKind("video")).toBe(false);
  });
});
