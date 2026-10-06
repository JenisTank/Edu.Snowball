#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# BumbleB ERP — one-shot dev environment restore
# Run after any sandbox/VM reset:  bash scripts/dev-restore.sh
# Installs Postgres + Redis, restores DB (from backup if present,
# else schema+seed), reinstalls node deps.
# ─────────────────────────────────────────────────────────────
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "── 1/5 system packages"
sudo apt-get update -qq
sudo apt-get install -y -qq postgresql postgresql-client redis-server
# headless-Chrome libs (needed only for puppeteer PDF/screenshot work; safe to skip on servers)
sudo apt-get install -y -qq libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
  libpango-1.0-0 libcairo2 libasound2t64 2>/dev/null || true

echo "── 2/5 services"
sudo service postgresql start || true
sudo service redis-server start || redis-server --daemonize yes

echo "── 3/5 database role + db"
sudo -u postgres psql -c "CREATE ROLE bumbleb LOGIN PASSWORD 'bumbleb_dev' CREATEDB;" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE bumblebkidz_erp OWNER bumbleb;" 2>/dev/null || true

echo "── 4/5 node deps + prisma"
cd "$ROOT/api" && npm install --no-audit --no-fund
npx prisma generate
if [ -f "$ROOT/backups/latest.sql" ]; then
  echo "   restoring from backups/latest.sql"
  PGPASSWORD=bumbleb_dev psql -h localhost -U bumbleb -d bumblebkidz_erp -q -f "$ROOT/backups/latest.sql"
else
  echo "   no backup found → schema push + demo seed"
  npx prisma db push
  npx ts-node --transpile-only prisma/seed.ts
fi
cd "$ROOT/frontend" && npm install --no-audit --no-fund

echo "── 5/5 done. Start servers with:"
echo "   cd api && npm run dev        # :3000"
echo "   cd frontend && npm run dev   # :5173"
