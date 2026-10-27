import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { SiteHeader } from "@/components/site-header";

const steps = ["receive", "check", "approve"] as const;

const stepIcons: Record<(typeof steps)[number], ReactNode> = {
  receive: <path d="M4 6h16v12H4zM4 7l8 6 8-6" />,
  check: <path d="M4 6h10M4 12h10M4 18h7M16 15l2 2 4-4" />,
  approve: <path d="M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6zM9 12l2 2 4-4" />,
};

export default function Home() {
  const t = useTranslations("Home");
  const tFooter = useTranslations("Footer");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteHeader />

      {/* The header reaches the screen edges; the content keeps clear of the notch in landscape. */}
      <div className="flex flex-1 flex-col pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-10 sm:px-6 sm:pt-6 sm:pb-16">
          <p className="inline-flex items-center gap-2 rounded-full bg-warning-soft px-3 py-1 text-sm font-medium text-warning">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" />
            </svg>
            {t("status")}
          </p>

          <h1 className="mt-5 max-w-3xl text-3xl leading-tight font-semibold tracking-tight [overflow-wrap:anywhere] hyphens-auto sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">{t("lead")}</p>

          <section aria-labelledby="steps-title" className="mt-12 sm:mt-16">
            <h2 id="steps-title" className="text-sm font-semibold tracking-wide text-muted uppercase">
              {t("stepsTitle")}
            </h2>
            <ol className="mt-4 grid gap-4 md:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step} className="rounded-xl border border-border bg-surface p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="size-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {stepIcons[step]}
                      </svg>
                    </span>
                    <h3 className="font-semibold [overflow-wrap:anywhere] hyphens-auto">
                      <span className="text-muted">{index + 1}. </span>
                      {t(`steps.${step}.title`)}
                    </h3>
                  </div>
                  <p className="mt-3 leading-relaxed text-muted">{t(`steps.${step}.body`)}</p>
                </li>
              ))}
            </ol>
          </section>

          <p
            role="note"
            className="mt-10 flex items-start gap-3 rounded-xl border border-border bg-surface p-4 text-muted"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="mt-0.5 size-5 shrink-0 text-accent"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5M12 8h.01" />
            </svg>
            {t("notice")}
          </p>
        </main>

        <footer className="border-t border-border pb-[env(safe-area-inset-bottom)]">
          <p className="mx-auto max-w-5xl px-4 py-6 text-sm text-muted sm:px-6">
            {tFooter("text")}
          </p>
        </footer>
      </div>
    </div>
  );
}
