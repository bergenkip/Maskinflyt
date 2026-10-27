"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, SettingsIcon, TruckIcon, UsersIcon } from "./icons";

type Props = {
  labels: { dashboard: string; vehicles: string; team: string; settings: string; mainMenu: string };
  // Drivers do not see the machine list (they will see the machine of their own jobs).
  showVehicles: boolean;
};

// Phones: a tab bar fixed to the bottom of the screen, within thumb reach.
// Tablet and computer: a row in the header.
export function AppNav({ labels, showVehicles }: Props) {
  const pathname = usePathname();
  const links = [
    { href: "/app", label: labels.dashboard, icon: HomeIcon, active: pathname === "/app" },
    ...(showVehicles
      ? [{ href: "/app/vehicles", label: labels.vehicles, icon: TruckIcon, active: pathname.startsWith("/app/vehicles") }]
      : []),
    { href: "/app/team", label: labels.team, icon: UsersIcon, active: pathname.startsWith("/app/team") },
    { href: "/app/settings", label: labels.settings, icon: SettingsIcon, active: pathname.startsWith("/app/settings") },
  ];

  return (
    <nav
      aria-label={labels.mainMenu}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] shadow-[0_-1px_12px_rgb(0_0_0/0.06)] md:static md:border-0 md:bg-transparent md:p-0 md:shadow-none"
    >
      <ul className="flex md:gap-1">
        {links.map(({ href, label, icon: Icon, active }) => (
          <li key={href} className="min-w-0 flex-1 md:flex-none">
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className="group flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium text-muted hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent aria-[current=page]:text-accent md:min-h-11 md:flex-row md:gap-1.5 md:rounded-lg md:px-2 md:text-sm lg:gap-2 lg:px-3 lg:text-base md:hover:bg-accent-soft md:focus-visible:outline-offset-2 md:aria-[current=page]:bg-accent-soft"
            >
              <span className="flex h-7 w-12 items-center justify-center rounded-full transition-colors group-aria-[current=page]:bg-accent-soft md:h-auto md:w-auto md:bg-transparent md:group-aria-[current=page]:bg-transparent">
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
