#!/usr/bin/env bash
# يبني قاعدة نظيفة، يطبّق الـmigrations، يزرع البيانات، ثم يشغّل كل الاختبارات.
set -euo pipefail
PGH=${PGH:-/tmp/claude-0}; PGP=${PGP:-5433}; DB=${DB:-nile_test}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
Q="psql -h $PGH -p $PGP -U postgres -d $DB -v ON_ERROR_STOP=1"

"$ROOT/scripts/db-test.sh" >/dev/null
$Q -q -f "$ROOT/supabase/tests/helpers.sql"
$Q -q -f "$ROOT/supabase/tests/01_seed.sql"

fail=0
for f in "$ROOT"/supabase/tests/[1-9]*.sql; do
  if ! $Q -f "$f" 2>&1 | grep -v '^$'; then fail=1; fi
done
[ $fail -eq 0 ] && echo "══ كل اختبارات القاعدة مرّت ══" || { echo "══ فشل ══"; exit 1; }
