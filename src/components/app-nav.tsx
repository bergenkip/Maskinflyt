"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarIcon, ContactsIcon, HomeIcon, SettingsIcon, TruckIcon, UsersIcon } from "./icons";

type Props = {
  labels: { dashboard: string; jobs: string; customers: string; vehicles: string; team: string; settings: string; mainMenu: string };
  // Drivers see neither jobs, customers nor machines yet (they will see their own jobs).
  showJobs: boolean;
  showCustomers: boolean;
  showVehicles: boolean;
};

// Phones and tablets: a tab bar fixed to the bottom of the screen, within thumb
// reach; settings sit in the header there (SettingsLink), so five tabs fit.
// Computers: a row in the header.
export function AppNav({ labels, showJobs, showCustomers, showVehicles }: Props) {
  const pathname = usePathname();
  const links = [
    { href: "/app", label: labels.dashboard, icon: HomeIcon, active: pathname === "/app" },
    ...(showJobs ? [{ href: "/app/jobs", label: labels.jobs, icon: CalendarIcon, active: pathname.startsWith("/app/jobs") }] : []),
    ...(showCustomers
      ? [{ href: "/app/customers", label: labels.customers, icon: ContactsIcon, active: pathname.startsWith("/app/customers") }]
      : []),
    ...(showVehicles
      ? [{ href: "/app/vehicles", label: labels.vehicles, icon: TruckIcon, active: pathname.startsWith("/app/vehicles") }]
      : []),
    { href: "/app/team", label: labels.team, icon: UsersIcon, active: pathname.startsWith("/app/team") },
    { href: "/app/settings", label: labels.settings, icon: SettingsIcon, active: pathname.startsWith("/app/settings"), headerOnly: true },
  ];

  return (
    <nav
      aria-label={labels.mainMenu}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] shadow-[0_-1px_12px_rgb(0_0_0/0.06)] lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
    >
      <ul className="flex lg:gap-1">
        {links.map(({ href, label, icon: Icon, active, headerOnly }) => (
          <li key={href} className={`min-w-0 flex-1 lg:flex-none ${headerOnly ? "hidden lg:block" : ""}`}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className="group flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium text-muted hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent aria-[current=page]:text-accent sm:text-sm lg:min-h-11 lg:flex-row lg:gap-1.5 lg:rounded-lg lg:px-2 xl:text-base lg:hover:bg-accent-soft lg:focus-visible:outline-offset-2 lg:aria-[current=page]:bg-accent-soft"
            >
              <span className="flex h-7 w-12 items-center justify-center rounded-full transition-colors group-aria-[current=page]:bg-accent-soft lg:h-auto lg:w-auto lg:bg-transparent lg:group-aria-[current=page]:bg-transparent">
                <Icon className="size-5" />
              </span>
              <span className="max-w-full truncate">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// Phones and tablets: settings as an icon in the header, beside signing out.
export function SettingsLink({ label }: { label: string }) {
  const pathname = usePathname();
  return (
    <Link
      href="/app/settings"
      aria-label={label}
      aria-current={pathname.startsWith("/app/settings") ? "page" : undefined}
      className="flex size-11 items-center justify-center rounded-lg text-muted hover:bg-accent-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent lg:hidden"
    >
      <SettingsIcon className="size-5" />
    </Link>
  );
}
