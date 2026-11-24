"use client";

import { CheckIcon } from "@/components/icons";

// A yes/no row. The real checkbox covers the whole row (border included), so all of it is the tap target.
export function CheckRow({ name, label, hint, defaultChecked }: { name: string; label: string; hint: string; defaultChecked: boolean }) {
  return (
    <label
      htmlFor={name}
      className="relative flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-accent"
    >
      <input
        id={name}
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        aria-labelledby={`${name}-label`}
        aria-describedby={`${name}-hint`}
        className="peer absolute -inset-px m-0 cursor-pointer appearance-none rounded-lg opacity-0"
      />
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border-2 border-muted bg-surface text-transparent peer-checked:border-accent peer-checked:bg-accent peer-checked:text-on-accent"
      >
        <CheckIcon className="size-4" />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span id={`${name}-label`} className="font-medium">
          {label}
        </span>
        <span id={`${name}-hint`} className="text-sm text-muted">
          {hint}
        </span>
      </span>
    </label>
  );
}
