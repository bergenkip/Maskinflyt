"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState, useState } from "react";
import { FormAlert } from "@/components/form";
import { ArrowDownIcon, ArrowUpIcon, ImageIcon, TrashIcon, UploadIcon } from "@/components/icons";
import { MAX_ALT_LENGTH, MAX_COMPANY_PHOTOS, MAX_SIDE, type CompanyPhotoKind } from "@/lib/company-photos";
import type { CompanyPhoto } from "@/lib/company-photos-server";
import {
  addCompanyPhoto,
  moveCompanyPhoto,
  removeCompanyPhoto,
  updateCompanyPhoto,
  type PhotoState,
} from "./photo-actions";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const secondary = `flex min-h-11 items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 font-semibold text-link hover:bg-accent-soft disabled:opacity-70 ${focusRing}`;
const iconButton = `flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-foreground hover:bg-accent-soft disabled:opacity-40 ${focusRing}`;

// A phone photo is several megabytes and carries hidden data such as the GPS
// position. Drawing it again on a canvas makes it smaller, turns it upright and
// leaves that data out. A logo stays a PNG, so a transparent background is kept.
async function prepare(file: File, kind: CompanyPhotoKind): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE[kind] / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise((resolve) =>
      kind === "logo" ? canvas.toBlob(resolve, "image/png") : canvas.toBlob(resolve, "image/jpeg", 0.82),
    );
  } catch {
    return null;
  }
}

function useErrorText() {
  const t = useTranslations("CompanyPhotos");
  return (state: PhotoState) => (state.error ? t(`errors.${state.error}`, { max: MAX_COMPANY_PHOTOS }) : null);
}

// "Choose a logo" / "Add a photo": the phone offers the camera or the photo library.
function AddButton({ kind, label }: { kind: CompanyPhotoKind; label: string }) {
  const t = useTranslations("CompanyPhotos");
  const errorText = useErrorText();
  const [state, action, pending] = useActionState<PhotoState, FormData>(addCompanyPhoto, {});
  const [preparing, setPreparing] = useState(false);
  const [unreadable, setUnreadable] = useState(false);
  const busy = pending || preparing;

  const onChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPreparing(true);
    const small = await prepare(file, kind);
    setPreparing(false);
    setUnreadable(!small);
    if (!small) return;
    const data = new FormData();
    data.set("kind", kind);
    data.set("file", small, kind === "logo" ? "logo.png" : "photo.jpg");
    startTransition(() => action(data));
  };

  const error = unreadable ? t("errors.unreadable") : errorText(state);
  return (
    <div className="grid gap-2">
      <label className={`${secondary} cursor-pointer has-[:disabled]:cursor-default has-[:disabled]:opacity-70 sm:justify-self-start`}>
        <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={onChange} />
        <UploadIcon />
        {busy ? t("sending") : label}
      </label>
      <div aria-live="polite">{error && <FormAlert kind="error">{error}</FormAlert>}</div>
    </div>
  );
}

function RemoveButton({ photo, label }: { photo: string; label: string }) {
  const t = useTranslations("CompanyPhotos");
  const errorText = useErrorText();
  const [state, action, pending] = useActionState<PhotoState, FormData>(removeCompanyPhoto, {});
  const error = errorText(state);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="photo" value={photo} />
      <button type="submit" disabled={pending} className={`${secondary} text-danger`}>
        <TrashIcon />
        {pending ? t("removing") : label}
      </button>
      {error && <FormAlert kind="error">{error}</FormAlert>}
    </form>
  );
}

function MoveButtons({ photo, first, last, number }: { photo: string; first: boolean; last: boolean; number: number }) {
  const t = useTranslations("CompanyPhotos");
  const [, action, pending] = useActionState<PhotoState, FormData>(moveCompanyPhoto, {});
  return (
    <form action={action} className="flex gap-2">
      <input type="hidden" name="photo" value={photo} />
      <button type="submit" name="direction" value="earlier" disabled={first || pending} className={iconButton} aria-label={t("moveEarlier", { number })}>
        <ArrowUpIcon />
      </button>
      <button type="submit" name="direction" value="later" disabled={last || pending} className={iconButton} aria-label={t("moveLater", { number })}>
        <ArrowDownIcon />
      </button>
    </form>
  );
}

function AltForm({ photo, alt, number }: { photo: string; alt: string | null; number: number }) {
  const t = useTranslations("CompanyPhotos");
  const errorText = useErrorText();
  const [state, action, pending] = useActionState<PhotoState, FormData>(updateCompanyPhoto, {});
  const id = `alt-${photo}`;
  const error = errorText(state);
  return (
    <form action={action} className="grid gap-1.5">
      <input type="hidden" name="photo" value={photo} />
      <label htmlFor={id} className="font-medium">
        {t("alt", { number })}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          name="alt"
          defaultValue={alt ?? ""}
          maxLength={MAX_ALT_LENGTH}
          placeholder={t("altPlaceholder")}
          aria-describedby={error ? `${id}-error` : undefined}
          className="min-h-11 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-base text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        />
        <button type="submit" disabled={pending} className={`${secondary} shrink-0`}>
          {t("saveAlt")}
        </button>
      </div>
      <div aria-live="polite">
        {error && <FormAlert kind="error">{error}</FormAlert>}
        {!error && state.savedAt && !pending && <p className="text-sm font-medium text-success">{t("altSaved")}</p>}
      </div>
    </form>
  );
}

export function CompanyPhotosForm({ photos }: { photos: CompanyPhoto[] }) {
  const t = useTranslations("CompanyPhotos");
  const logo = photos.find((photo) => photo.kind === "logo");
  const pictures = photos.filter((photo) => photo.kind === "photo");

  return (
    <div className="grid gap-8">
      <div className="grid gap-3">
        <h3 className="font-semibold">{t("logoTitle")}</h3>
        <p className="text-sm text-muted">{t("logoHint")}</p>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background p-2">
            {logo?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo.url} alt={t("logoAlt")} width={logo.width} height={logo.height} className="max-h-full max-w-full object-contain" />
            ) : (
              <ImageIcon className="size-8 text-muted" />
            )}
          </div>
          <div className="grid min-w-0 gap-2">
            <AddButton kind="logo" label={logo ? t("changeLogo") : t("addLogo")} />
            {logo && <RemoveButton photo={logo.id} label={t("removeLogo")} />}
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        <h3 className="font-semibold">{t("photosTitle")}</h3>
        <p className="text-sm text-muted">{t("photosHint", { max: MAX_COMPANY_PHOTOS })}</p>
        {pictures.length > 0 && (
          <ol className="grid gap-4 sm:grid-cols-2">
            {pictures.map((photo, index) => (
              <li key={photo.id} className="grid content-start gap-3 rounded-lg border border-border bg-background p-3">
                <div className="aspect-[4/3] overflow-hidden rounded-md bg-surface">
                  {photo.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo.url}
                      alt={photo.alt ?? t("photoAlt", { number: index + 1 })}
                      width={photo.width}
                      height={photo.height}
                      className="size-full object-cover"
                    />
                  )}
                </div>
                <AltForm photo={photo.id} alt={photo.alt} number={index + 1} />
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <MoveButtons photo={photo.id} first={index === 0} last={index === pictures.length - 1} number={index + 1} />
                  <RemoveButton photo={photo.id} label={t("removePhoto")} />
                </div>
              </li>
            ))}
          </ol>
        )}
        {pictures.length < MAX_COMPANY_PHOTOS ? (
          <AddButton kind="photo" label={t("addPhoto")} />
        ) : (
          <p className="text-sm font-medium text-muted">{t("photosFull", { max: MAX_COMPANY_PHOTOS })}</p>
        )}
      </div>
    </div>
  );
}
