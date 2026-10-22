import { getTranslations } from "next-intl/server";

// Shown the moment a menu link is tapped, while the server fetches the page.
// The grey blocks only hint at the layout; screen readers hear "Loading".
export default async function AppLoading() {
  const t = await getTranslations("Nav");

  return (
    <div role="status" className="grid gap-8">
      <span className="sr-only">{t("loading")}</span>
      <div aria-hidden="true" className="grid animate-pulse gap-3 motion-reduce:animate-none">
        <div className="h-4 w-24 rounded bg-border" />
        <div className="h-8 w-2/3 max-w-sm rounded bg-border" />
        <div className="h-4 w-1/2 max-w-xs rounded bg-border" />
      </div>
      <div aria-hidden="true" className="grid animate-pulse gap-3 motion-reduce:animate-none">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-16 rounded-xl border border-border bg-surface" />
        ))}
      </div>
    </div>
  );
}
