import { SiteHeader } from "@/components/site-header";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteHeader showLogin={false} />
      {/* The header reaches the screen edges; the content keeps clear of the notch in landscape. */}
      <div className="flex flex-1 flex-col pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        <main className="mx-auto w-full max-w-md flex-1 px-4 pt-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:pt-6 sm:pb-16">
          {children}
        </main>
      </div>
    </div>
  );
}
