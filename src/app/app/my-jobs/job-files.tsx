"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState, useRef, useState } from "react";
import { FormAlert } from "@/components/form";
import { MAX_SIGNER_LENGTH, PHOTO_MAX_SIDE } from "@/lib/job-files";
import { addJobFile, type FileState } from "./actions";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const secondary = `flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 font-semibold text-accent hover:bg-accent-soft disabled:opacity-70 ${focusRing}`;

// A phone photo is several megabytes: it is made smaller (and turned upright)
// here before it is sent, as a JPEG with the longest side at most PHOTO_MAX_SIDE.
async function shrink(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  } catch {
    return null;
  }
}

function useFileAction() {
  const [state, action, pending] = useActionState<FileState, FormData>(addJobFile, {});
  const send = (job: string, kind: "photo" | "signature", file: Blob, signedBy?: string) => {
    const data = new FormData();
    data.set("job", job);
    data.set("kind", kind);
    data.set("file", file, kind === "photo" ? "photo.jpg" : "signature.png");
    if (signedBy !== undefined) data.set("signedBy", signedBy);
    startTransition(() => action(data));
  };
  return { state, pending, send };
}

// "Take a photo": the phone offers the camera or the photo library.
export function PhotoButton({ job }: { job: string }) {
  const t = useTranslations("JobFiles");
  const { state, pending, send } = useFileAction();
  const [preparing, setPreparing] = useState(false);
  const [unreadable, setUnreadable] = useState(false);
  const busy = pending || preparing;

  const onChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPreparing(true);
    const small = await shrink(file);
    setPreparing(false);
    setUnreadable(!small);
    if (small) send(job, "photo", small);
  };

  return (
    <div className="grid gap-2">
      <label className={`${secondary} cursor-pointer has-[:disabled]:cursor-default has-[:disabled]:opacity-70 sm:justify-self-start`}>
        <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={onChange} />
        <CameraGlyph />
        {busy ? t("sending") : t("addPhoto")}
      </label>
      <div aria-live="polite">
        {unreadable && <FormAlert kind="error">{t("errors.unreadable")}</FormAlert>}
        {!unreadable && state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}
      </div>
    </div>
  );
}

function CameraGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

// The customer signs with a finger; the name is written beside it.
export function SignaturePad({ job }: { job: string }) {
  const t = useTranslations("JobFiles");
  const { state, pending, send } = useFileAction();
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [signed, setSigned] = useState(false);
  const [name, setName] = useState("");
  const nameId = `signer-${job}`;

  // Sharp lines on high-density screens: the canvas gets as many pixels as the
  // screen shows. Set up when drawing starts, since the pad is hidden in a
  // closed section at first, and again if the phone was turned (which clears it).
  const ready = (element: HTMLCanvasElement) => {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(element.clientWidth * ratio);
    const height = Math.round(element.clientHeight * ratio);
    const context = element.getContext("2d");
    if (!context) return null;
    if (element.width !== width || element.height !== height) {
      element.width = width;
      element.height = height;
      context.scale(ratio, ratio);
      context.lineWidth = 2.5;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = "#111827";
    }
    return context;
  };

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top] as const;
  };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const context = ready(event.currentTarget);
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const [x, y] = point(event);
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 0.1, y + 0.1);
    context.stroke();
    setSigned(true);
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext("2d");
    const [x, y] = point(event);
    context?.lineTo(x, y);
    context?.stroke();
  };
  const end = () => {
    drawing.current = false;
  };
  const clear = () => {
    const element = canvas.current;
    element?.getContext("2d")?.clearRect(0, 0, element.width, element.height);
    setSigned(false);
  };
  const save = () => {
    canvas.current?.toBlob((blob) => blob && send(job, "signature", blob, name), "image/png");
  };

  return (
    <div className="grid gap-3">
      <p id={`${nameId}-pad`} className="text-sm text-muted">
        {t("signHint")}
      </p>
      {/* touch-none: the finger draws instead of scrolling the page. */}
      <canvas
        ref={canvas}
        role="img"
        aria-labelledby={`${nameId}-pad`}
        className="h-44 w-full touch-none rounded-lg border-2 border-dashed border-border bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
      />
      <div className="grid gap-1.5">
        <label htmlFor={nameId} className="font-medium">
          {t("signerName")}
        </label>
        <input
          id={nameId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={MAX_SIGNER_LENGTH}
          autoComplete="off"
          className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        />
      </div>
      <div aria-live="polite">{state.error && <FormAlert kind="error">{t(`errors.${state.error}`)}</FormAlert>}</div>
      <div className="grid gap-2 sm:flex">
        <button
          type="button"
          onClick={save}
          disabled={!signed || name.trim() === "" || pending}
          className={`flex min-h-11 items-center justify-center rounded-lg bg-accent px-5 font-semibold text-on-accent hover:bg-accent/90 disabled:opacity-60 ${focusRing}`}
        >
          {pending ? t("sending") : t("saveSignature")}
        </button>
        <button type="button" onClick={clear} disabled={!signed || pending} className={secondary}>
          {t("clear")}
        </button>
      </div>
    </div>
  );
}
