# Maskinflyt

Job planning, driver app and invoicing for Norwegian truck, crane and machine contractors:
job → driver and machine → hours worked → invoice. Status: early development.

The sign-up, sign-in, two-step sign-in, company, team, invitations, roles, settings and
languages come from [OrderFlow](https://github.com/bergenkip/Orderflow), where they were built and tested.

- Product brief: [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md)
- Where we left off: [`docs/HANDOFF.md`](docs/HANDOFF.md)
- Working agreements: [`CLAUDE.md`](CLAUDE.md)

## Stack

Next.js (App Router) · React · TypeScript (strict) · Tailwind CSS · next-intl (nb / en / lt).
Supabase (PostgreSQL + RLS, Auth with e-mail and password) · Vercel hosting. Planned: Supabase Storage.

## Getting started

Requires Node.js 22.

```bash
npm ci
npm run dev        # http://localhost:3000
```

Sign-in needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`
(never commit it). Without them the public pages work and the sign-in page says it is not available.
With the Supabase CLI, `supabase start` gives a local instance; `supabase status -o env` prints both values.

## Checks

```bash
npm run lint       # ESLint
npm run typecheck  # TypeScript
npm test           # unit tests (Vitest), incl. translation key parity
npm run build      # production build
npm run e2e        # Playwright: 3 languages × 5 widths, screenshots in test-results/screenshots
npm run db:test    # migrations + RLS tests (pgTAP) against an empty Supabase Postgres
```

For `db:test`, start a throwaway database first:

```bash
docker run -d --name maskinflyt-db -e POSTGRES_PASSWORD=postgres -p 54329:5432 supabase/postgres:17.11.0.004
DATABASE_URL=postgresql://postgres:postgres@localhost:54329/postgres npm run db:test
```

## Database

Supabase Postgres with row-level security. Migrations live in `supabase/migrations/`,
tests in `supabase/tests/database/`. Every tenant-owned table has `organization_id`,
RLS enabled and explicit grants; a test fails if any table in `public` lacks RLS.
Merged migrations are applied to the hosted project by `.github/workflows/db-deploy.yml`.

`npm run e2e` expects a finished `npm run build`. Where Chromium cannot be downloaded,
point to a local one with `CHROMIUM_PATH=/path/to/chrome npm run e2e`.
`e2e/auth.spec.ts` (sign-up, onboarding, settings) and `e2e/team.spec.ts` (invitation links, roles) are
skipped unless the Supabase variables are set; CI runs them in the `e2e-auth` job against a local `supabase start`.

## Languages

All UI text lives in `messages/{nb,en,lt}.json` with identical keys (a unit test enforces this).
For signed-in users the order is: the language saved in their profile (Settings), the cookie, the
company default, the browser's `Accept-Language`, then Norwegian Bokmål. Signed-out visitors get
the `NEXT_LOCALE` cookie set by the switcher, then `Accept-Language`, then Norwegian Bokmål.
