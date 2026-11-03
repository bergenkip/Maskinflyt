import { getFormatter, getTranslations } from "next-intl/server";
import type { JobFile } from "@/lib/job-files-server";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// A job's photos as tappable thumbnails (each opens full size), and the
// customer's signature with their name and when they signed.
export async function JobFilesView({ files, timeZone }: { files: JobFile[]; timeZone: string }) {
  const [t, format] = await Promise.all([getTranslations("JobFiles"), getFormatter()]);
  const time = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone });
  const photos = files.filter((file) => file.kind === "photo");
  const signature = files.find((file) => file.kind === "signature");

  return (
    <div className="grid gap-4">
      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo, i) => (
            <li key={photo.id}>
              {photo.url ? (
                <a href={photo.url} target="_blank" rel="noopener noreferrer" className={`block overflow-hidden rounded-lg ${focusRing}`}>
                  {/* Signed, short-lived links from private storage: no image optimiser in between. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={t("photoAlt", { number: i + 1, time: time(photo.created_at) })}
                    width={160}
                    height={160}
                    loading="lazy"
                    className="aspect-square w-full bg-border object-cover"
                  />
                </a>
              ) : (
                <span className="flex aspect-square items-center justify-center rounded-lg border border-border p-1 text-center text-xs text-muted">
                  {t("unavailable")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {signature && (
        <figure className="grid gap-1.5">
          {signature.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={signature.url}
              alt={t("signatureAlt", { name: signature.signed_by ?? "" })}
              width={480}
              height={176}
              className="h-auto w-full max-w-sm rounded-lg border border-border bg-white"
            />
          )}
          {/* The signer's name is data and is shown exactly as written. */}
          <figcaption className="text-sm [overflow-wrap:anywhere]">
            {t("signedBy", { name: signature.signed_by ?? "", time: time(signature.created_at) })}
          </figcaption>
        </figure>
      )}
    </div>
  );
}
