import Image from "next/image";
import Link from "next/link";

// The MaskinGo logo: dark blue letters on light screens, white letters when the
// phone is in dark mode (dark blue would not be readable there).
export function Brand({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="-mx-1 flex min-h-11 shrink-0 items-center rounded-lg px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Image
        src="/brand/maskingo-logo.png"
        alt=""
        width={494}
        height={160}
        priority
        className="h-9 w-auto sm:h-11 dark:hidden"
      />
      <Image
        src="/brand/maskingo-logo-on-dark.png"
        alt=""
        width={492}
        height={160}
        priority
        className="hidden h-9 w-auto sm:h-11 dark:block"
      />
    </Link>
  );
}
