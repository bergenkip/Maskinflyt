import Image from "next/image";
import Link from "next/link";

// The MaskinGo name as in the logo: navy and blue letters on light screens,
// white letters when the phone is in dark mode (navy would not be readable).
// The full logo with the machines is kept in public/brand for later use.
export function Brand({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="-mx-1 flex min-h-11 shrink-0 items-center rounded-lg px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Image
        src="/brand/maskingo-wordmark.png"
        alt=""
        width={758}
        height={96}
        priority
        className="h-4 w-auto min-[400px]:h-5 sm:h-6 dark:hidden"
      />
      <Image
        src="/brand/maskingo-wordmark-on-dark.png"
        alt=""
        width={758}
        height={96}
        priority
        className="hidden h-4 w-auto min-[400px]:h-5 sm:h-6 dark:block"
      />
    </Link>
  );
}
