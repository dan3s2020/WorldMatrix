#!/usr/bin/env bash
# Applies supabase/migrations/*.sql to a throwaway PostgreSQL (with a minimal
# Supabase-like auth/roles shim) and checks grants, row-level security,
# constraints and the rate-limit trigger.
#   bash tests/supabase-migration.sh            (needs PostgreSQL 15+ binaries)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[ -x "$BIN/initdb" ] || { echo "PostgreSQL binaries not found (set PG_BIN)"; exit 1; }
TMP="$(mktemp -d)"; PORT=$((55000 + RANDOM % 1000))
RUN=""; [ "$(id -u)" = 0 ] && { chown postgres "$TMP"; RUN="su postgres -s /bin/bash -c"; }
run() { if [ -n "$RUN" ]; then $RUN "$*"; else bash -c "$*"; fi; }
cp "$ROOT"/tests/sql/*.sql "$TMP"/
cat "$ROOT"/supabase/migrations/*.sql | grep -v '^create extension' > "$TMP/migration.sql"
[ -n "$RUN" ] && chown postgres "$TMP"/*.sql
run "$BIN/initdb -D $TMP/data -A trust -U postgres >/dev/null"
run "$BIN/pg_ctl -D $TMP/data -o '-p $PORT -k $TMP -c listen_addresses=' -l $TMP/log -w start >/dev/null"
trap 'run "$BIN/pg_ctl -D $TMP/data -m immediate stop >/dev/null" || true' EXIT
P="$BIN/psql -h $TMP -p $PORT -U postgres -q -X"
run "$BIN/createdb -h $TMP -p $PORT -U postgres wm"
run "$P -d wm -v ON_ERROR_STOP=1 -f $TMP/supabase-shim.sql >/dev/null"
run "$P -d wm -v ON_ERROR_STOP=1 -f $TMP/migration.sql >/dev/null 2>&1"
OUT="$(run "$P -d wm -f $TMP/migration-check.sql" 2>&1)"
fail=0
expect() { grep -q -- "$1" <<<"$OUT" || { echo "MISSING: $1"; fail=1; }; }
expect 'own player row | Neo One | villain'
expect 'violates row-level security policy for table "players"'
expect 'violates check constraint "players_name_check"'
expect 'violates row-level security policy for table "actions"'
expect 'violates check constraint "actions_kind_check"'
expect 'permission denied for table world_private'
expect 'permission denied for table world_public'
expect 'ERROR:  rate limited'
expect 'anon public |     1'
expect 'permission denied for table actions'
expect 'worldmatrix-cleanup'
expect 'globe for player 1 |          1'
expect 'permission denied for table players'
expect 'globe for player 2 |          2'
[ $fail = 0 ] || { echo "$OUT"; exit 1; }
echo "supabase migration: OK (grants, RLS, constraints, rate limit)"
