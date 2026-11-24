// Stage 15a+: the logo and photos on the company's public page, stored in the
// private company-photos bucket (see the company_photos migration, which
// checks the same limits again).

export const companyPhotoKinds = ["logo", "photo"] as const;
export type CompanyPhotoKind = (typeof companyPhotoKinds)[number];

export function isCompanyPhotoKind(value: unknown): value is CompanyPhotoKind {
  return typeof value === "string" && (companyPhotoKinds as readonly string[]).includes(value);
}

export const COMPANY_PHOTOS_BUCKET = "company-photos";
export const MAX_COMPANY_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_COMPANY_PHOTOS = 8;
export const MAX_ALT_LENGTH = 200;
// Made smaller in the browser before sending (the longest side, in pixels).
// Re-drawing the picture also leaves out its hidden data, such as the GPS position.
export const MAX_SIDE: Record<CompanyPhotoKind, number> = { logo: 512, photo: 1600 };
// A logo keeps its transparent background (PNG); a photo is a JPEG.
export const extensionFor: Record<CompanyPhotoKind, "png" | "jpg"> = { logo: "png", photo: "jpg" };
export const contentTypeFor: Record<"jpg" | "png", string> = { jpg: "image/jpeg", png: "image/png" };

// <organization>/<random id>.<ext>: the folder decides who may change it.
export function companyPhotoPath(organizationId: string, fileId: string, extension: "jpg" | "png") {
  return `${organizationId}/${fileId}.${extension}`;
}

// The description as written, spaces tidied; null when empty, undefined when too long.
export function normalizeAlt(input: string): string | null | undefined {
  const alt = input.trim().replace(/\s+/g, " ");
  if (alt === "") return null;
  return alt.length <= MAX_ALT_LENGTH ? alt : undefined;
}

// The width and height of a PNG or JPEG, read from its first bytes (null when unreadable).
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // PNG: the IHDR chunk comes first, with the size at bytes 16–23.
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[12] === 0x49 && bytes[13] === 0x48) {
    return checked(view.getUint32(16), view.getUint32(20));
  }
  // JPEG: walk the segments to the frame header (SOF0–SOF15, except DHT, JPG and DAC).
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) return null;
      const marker = bytes[at + 1];
      if (marker === 0xff) {
        at += 1;
        continue;
      }
      const length = view.getUint16(at + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return checked(view.getUint16(at + 7), view.getUint16(at + 5));
      }
      at += 2 + length;
    }
  }
  return null;
}

function checked(width: number, height: number) {
  return width >= 1 && height >= 1 && width <= 4000 && height <= 4000 ? { width, height } : null;
}
