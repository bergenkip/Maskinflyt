"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  COMPANY_PHOTOS_BUCKET,
  companyPhotoPath,
  contentTypeFor,
  extensionFor,
  imageSize,
  isCompanyPhotoKind,
  MAX_COMPANY_PHOTO_BYTES,
  normalizeAlt,
} from "@/lib/company-photos";
import { sniffImage } from "@/lib/job-files";
import { getCurrentMembership } from "@/lib/membership";
import { hasSecondStep } from "@/lib/mfa";
import { createClient } from "@/lib/supabase/server";

// The database decides who may change the photos (owners and admins, with the
// second step, of a company that is not read-only); these actions check the
// file first and translate the database's answers.

export type PhotoState = {
  error?: "notAllowed" | "readOnly" | "tooBig" | "wrongType" | "tooMany" | "altTooLong" | "unknown";
  savedAt?: number;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type DbError = { code?: string; hint?: string | null } | null;

function answer(error: DbError): PhotoState {
  if (!error) {
    revalidatePath("/app/public-page");
    revalidatePath("/firma", "layout");
    return { savedAt: Date.now() };
  }
  if (error.hint === "mfa_required") redirect("/mfa");
  if (error.hint === "read_only") return { error: "readOnly" };
  if (error.hint === "too_many" || error.code === "54000") return { error: "tooMany" };
  if (error.hint === "invalid_alt") return { error: "altTooLong" };
  if (error.code === "42501") return { error: "notAllowed" };
  return { error: "unknown" };
}

async function editor() {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  // Storage refuses an upload without the second step; send the person there first.
  if (!(await hasSecondStep())) redirect("/mfa");
  return membership;
}

// A logo (PNG) or a photo (JPEG), made smaller in the browser: checked here by
// its bytes, stored in the private bucket, then listed with the company.
export async function addCompanyPhoto(_prev: PhotoState, formData: FormData): Promise<PhotoState> {
  const membership = await editor();
  const kind = formData.get("kind");
  const file = formData.get("file");
  if (!isCompanyPhotoKind(kind) || !(file instanceof File)) return { error: "unknown" };
  if (file.size === 0 || file.size > MAX_COMPANY_PHOTO_BYTES) return { error: "tooBig" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = sniffImage(bytes);
  const size = imageSize(bytes);
  if (extension !== extensionFor[kind] || !size) return { error: "wrongType" };
  const alt = normalizeAlt(String(formData.get("alt") ?? ""));
  if (alt === undefined) return { error: "altTooLong" };

  const supabase = await createClient();
  const org = membership.organization.id;
  const path = companyPhotoPath(org, randomUUID(), extension);
  const bucket = supabase.storage.from(COMPANY_PHOTOS_BUCKET);
  const upload = await bucket.upload(path, bytes, { contentType: contentTypeFor[extension], upsert: false });
  if (upload.error) return { error: /row-level security|unauthorized|403/i.test(upload.error.message) ? "notAllowed" : "unknown" };

  const { data, error } = await supabase
    .rpc("add_company_photo", {
      org,
      photo_kind: kind,
      photo_path: path,
      photo_width: size.width,
      photo_height: size.height,
      photo_alt: alt,
    })
    .maybeSingle();
  if (error) {
    // Not listed, so never shown: remove it again.
    await bucket.remove([path]);
    return answer(error);
  }
  const replaced = (data as { replaced_path: string | null } | null)?.replaced_path;
  if (replaced) await bucket.remove([replaced]);
  return answer(null);
}

export async function updateCompanyPhoto(_prev: PhotoState, formData: FormData): Promise<PhotoState> {
  await editor();
  const photo = String(formData.get("photo") ?? "");
  const alt = normalizeAlt(String(formData.get("alt") ?? ""));
  if (!uuid.test(photo)) return { error: "unknown" };
  if (alt === undefined) return { error: "altTooLong" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_company_photo", { photo, photo_alt: alt });
  return answer(error);
}

export async function moveCompanyPhoto(_prev: PhotoState, formData: FormData): Promise<PhotoState> {
  await editor();
  const photo = String(formData.get("photo") ?? "");
  if (!uuid.test(photo)) return { error: "unknown" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_company_photo", { photo, earlier: formData.get("direction") === "earlier" });
  return answer(error);
}

export async function removeCompanyPhoto(_prev: PhotoState, formData: FormData): Promise<PhotoState> {
  await editor();
  const photo = String(formData.get("photo") ?? "");
  if (!uuid.test(photo)) return { error: "unknown" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_company_photo", { photo });
  if (!error && typeof data === "string") await supabase.storage.from(COMPANY_PHOTOS_BUCKET).remove([data]);
  return answer(error);
}
