import { describe, expect, it } from "vitest";
import { companyPhotoPath, imageSize, isCompanyPhotoKind, MAX_ALT_LENGTH, normalizeAlt } from "./company-photos";

const png = (width: number, height: number) => {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
};

// SOI, an APP0 segment of 16 bytes, then a baseline frame header (SOF0).
const jpeg = (width: number, height: number, frame = 0xc0) => {
  const bytes = new Uint8Array(2 + 18 + 19);
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const at = 2 + 18;
  bytes.set([0xff, frame, 0x00, 0x11, 0x08], at);
  const view = new DataView(bytes.buffer);
  view.setUint16(at + 5, height);
  view.setUint16(at + 7, width);
  return bytes;
};

describe("imageSize", () => {
  it("reads the size of a PNG", () => {
    expect(imageSize(png(512, 256))).toEqual({ width: 512, height: 256 });
  });

  it("reads the size of a JPEG past the segments before the frame", () => {
    expect(imageSize(jpeg(1600, 1200))).toEqual({ width: 1600, height: 1200 });
    expect(imageSize(jpeg(1200, 1600, 0xc2))).toEqual({ width: 1200, height: 1600 });
  });

  it("refuses other files and sizes outside 1–4000", () => {
    expect(imageSize(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(imageSize(png(0, 10))).toBeNull();
    expect(imageSize(png(5000, 10))).toBeNull();
    expect(imageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
  });
});

describe("normalizeAlt", () => {
  it("tidies spaces and treats empty as none", () => {
    expect(normalizeAlt("  Kranbil   i  Bergen ")).toBe("Kranbil i Bergen");
    expect(normalizeAlt("   ")).toBeNull();
  });

  it("refuses a description that is too long", () => {
    expect(normalizeAlt("a".repeat(MAX_ALT_LENGTH))).toHaveLength(MAX_ALT_LENGTH);
    expect(normalizeAlt("a".repeat(MAX_ALT_LENGTH + 1))).toBeUndefined();
  });
});

describe("companyPhotoPath and isCompanyPhotoKind", () => {
  it("puts the file in its company's folder", () => {
    expect(companyPhotoPath("org", "file", "png")).toBe("org/file.png");
  });

  it("knows the two kinds", () => {
    expect(isCompanyPhotoKind("logo")).toBe(true);
    expect(isCompanyPhotoKind("photo")).toBe(true);
    expect(isCompanyPhotoKind("signature")).toBe(false);
  });
});
