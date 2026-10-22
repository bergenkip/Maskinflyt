#!/usr/bin/env bash
# Applies all migrations to an empty Supabase Postgres and runs the pgTAP tests.
# Usage: DATABASE_URL=postgresql://postgres:postgres@localhost:54329/postgres scripts/db-test.sh
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to an empty test database}"
cd "$(dirname "$0")/.."

psql_run() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X "$@"; }

psql_run -c "create extension if not exists pgtap with schema extensions;"

# Mirror the hosted project setting "Automatically expose new tables" = off,
# so tests fail if a migration forgets its explicit grants.
psql_run -c "alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;"

# The bare Postgres image has an older auth.users than hosted Supabase (where
# GoTrue adds email_confirmed_at). Add it so migrations see the same columns.
# Only the image's superuser may alter auth tables; it shares the password.
admin_url="${ADMIN_DATABASE_URL:-${DATABASE_URL/:\/\/postgres:/:\/\/supabase_admin:}}"
psql "$admin_url" -v ON_ERROR_STOP=1 -q -X \
  -c "alter table auth.users add column if not exists email_confirmed_at timestamptz;"

for file in supabase/migrations/*.sql; do
  echo "migrate: $file"
  psql_run -f "$file"
done

status=0
for file in supabase/tests/database/*.test.sql; do
  echo "test:    $file"
  if ! psql_run -c "set search_path = public, extensions;" -f "$file"; then
    status=1
  fi
done
exit $status
