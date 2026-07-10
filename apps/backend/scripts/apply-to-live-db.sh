#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# apply-to-live-db.sh
#
# Applies pending migrations to the LIVE database WITHOUT wiping data.
# Use this for first-time setup on a fresh live DB, or for incremental deploys.
#
# For a CLEAN live DB (first-time setup):
#   1. Make sure the database exists and DATABASE_URL points to it.
#   2. Run:  bash scripts/apply-to-live-db.sh
#
# For incremental deploys (DB already has tables):
#   Same command — prisma migrate deploy is safe and only runs new migrations.
#
# Run from: apps/backend/
#   DATABASE_URL="postgresql://..." bash scripts/apply-to-live-db.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌  DATABASE_URL is not set."
  echo "    Pass it inline:  DATABASE_URL='postgresql://...' bash scripts/apply-to-live-db.sh"
  exit 1
fi

echo "🔗  Target: $DATABASE_URL"
echo ""

echo "▶ Running prisma migrate deploy..."
npx prisma migrate deploy

echo ""
echo "▶ Generating Prisma client..."
npx prisma generate

echo ""
echo "✅  Live DB is up to date."
