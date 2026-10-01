#!/usr/bin/env bash
# Run every supabase/*_verification.sql against a database that already has
# all migrations applied. Each script is self-contained and rolls back.
#
# Usage: scripts/db-verify.sh "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
# CI runs this after `supabase start`. Never point it at production.
set -euo pipefail

db_url="${1:?database URL required}"
cd "$(dirname "$0")/.."

# Scripts to skip, each with the reason. Keep this list empty if possible.
skip=()

failed=0
for file in supabase/*_verification.sql; do
  if [ "${#skip[@]}" -gt 0 ] && printf '%s\n' "${skip[@]}" | grep -qx "$file"; then
    echo "SKIP $file"
    continue
  fi
  if psql "$db_url" -X -q -v ON_ERROR_STOP=1 -f "$file" >/dev/null 2>/tmp/db-verify.err; then
    echo "PASS $file"
  else
    echo "FAIL $file"
    sed 's/^/    /' /tmp/db-verify.err
    failed=1
  fi
done

exit "$failed"
