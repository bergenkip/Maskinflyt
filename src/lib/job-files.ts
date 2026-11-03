// Photos from the site and the customer's signature, stored in the private
// job-files bucket (see the job_files migration, which checks the same limits).

export const jobFileKinds = ["photo", "signature"] as const;
export type JobFileKind = (typeof jobFileKinds)[number];

export function isJobFileKind(value: unknown): value is JobFileKind {
  return typeof value === "string" && (jobFileKinds as readonly string[]).includes(value);
}

export const JOB_FILES_BUCKET = "job-files";
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_PHOTOS = 30;
export const MAX_SIGNER_LENGTH = 100;
// Photos are made smaller on the phone before they are sent: the longest side in pixels.
export const PHOTO_MAX_SIDE = 1600;

// What a file is by its first bytes, not by its name or the type the browser
// claims: a photo must be JPEG and a signature PNG.
export function sniffImage(bytes: Uint8Array): "jpg" | "png" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= png.length && png.every((byte, i) => bytes[i] === byte)) return "png";
  return null;
}

export const extensionFor: Record<JobFileKind, "jpg" | "png"> = { photo: "jpg", signature: "png" };
export const contentTypeFor: Record<"jpg" | "png", string> = { jpg: "image/jpeg", png: "image/png" };

// <organization>/<job>/<random id>.<ext>: the folder decides who may see it.
export function jobFilePath(organizationId: string, jobId: string, fileId: string, extension: "jpg" | "png") {
  return `${organizationId}/${jobId}/${fileId}.${extension}`;
}

// The signer's name as written, spaces tidied; undefined when empty or too long.
export function normalizeSigner(input: string) {
  const name = input.trim().replace(/\s+/g, " ");
  return name.length > 0 && name.length <= MAX_SIGNER_LENGTH ? name : undefined;
}
