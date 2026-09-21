#!/usr/bin/env bash
# يعيد بناء قاعدة اختبار محلية ويطبّق كل migrations المشروع عليها.
set -euo pipefail
PGH=${PGH:-/tmp/claude-0}
PGP=${PGP:-5433}
DB=${DB:-nile_test}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

psql -h "$PGH" -p "$PGP" -U postgres -q -c "drop database if exists $DB;" >/dev/null
psql -h "$PGH" -p "$PGP" -U postgres -q -c "create database $DB;" >/dev/null
psql -h "$PGH" -p "$PGP" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q \
     -f "$ROOT/supabase/tests/00_supabase_shim.sql"

for f in "$ROOT"/supabase/migrations/*.sql; do
  printf '  → %s\n' "$(basename "$f")"
  psql -h "$PGH" -p "$PGP" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f"
done
echo "✓ كل الـmigrations طُبّقت بنجاح"
