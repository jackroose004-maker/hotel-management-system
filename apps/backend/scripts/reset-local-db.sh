#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# reset-local-db.sh
#
# Wipes the LOCAL development database and applies the single init migration.
# Run from: apps/backend/
#   bash scripts/reset-local-db.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Load .env so DATABASE_URL is available
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌  DATABASE_URL not set. Add it to apps/backend/.env"
  exit 1
fi

echo "⚠️  This will DROP and recreate the database."
echo "    DATABASE_URL: $DATABASE_URL"
read -rp "    Type 'yes' to continue: " confirm
[ "$confirm" = "yes" ] || { echo "Aborted."; exit 0; }

echo ""
echo "▶ Dropping all tables via Prisma..."
npx prisma migrate reset --force --skip-seed

echo ""
echo "▶ Applying init migration..."
npx prisma migrate deploy

echo ""
echo "▶ Generating Prisma client..."
npx prisma generate

echo ""
echo "✅  Local DB is clean and up to date."
