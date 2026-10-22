#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# BumbleB Kidz ERP — nightly database backup
#
#   bash scripts/backup.sh                    # writes to ./backups
#   BACKUP_DIR=/srv/backups bash scripts/backup.sh
#   DATABASE_URL=postgresql://… bash scripts/backup.sh
#
# Produces two artefacts per run:
#   bumblebkidz_YYYY-MM-DD_HHMM.sql.gz        plain SQL, restorable anywhere
#   bumblebkidz_YYYY-MM-DD_HHMM.dump.manifest  checksum + row counts summary
#
# Cron (02:30 IST every night):
#   30 2 * * * cd /srv/bumbleb-erp && bash scripts/backup.sh >> /var/log/bumbleb-backup.log 2>&1
#
# The script fails loudly (non-zero exit) so cron/monitoring can alert.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date +%Y-%m-%d_%H%M)"
FILE="$BACKUP_DIR/bumblebkidz_$STAMP.sql.gz"

# Prefer an explicit DATABASE_URL; fall back to the repo .env file.
if [ -z "${DATABASE_URL:-}" ]; then
  for candidate in "$ROOT/.env" "$ROOT/api/.env"; do
    if [ -f "$candidate" ]; then
      DATABASE_URL="$(grep -E '^DATABASE_URL=' "$candidate" | tail -1 | cut -d= -f2- | tr -d '"')"
      [ -n "$DATABASE_URL" ] && break
    fi
  done
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "✖ DATABASE_URL is not set (and no .env provided one)" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
echo "── dumping $(date -Is)"
# --no-owner/--no-privileges keeps the dump portable between hosts and containers.
pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip -9 > "$FILE"

# A dump that doesn't contain the core tables is not a backup.
if ! gzip -dc "$FILE" | grep -q 'CREATE TABLE public.students'; then
  echo "✖ dump is missing core tables — refusing to keep it" >&2
  rm -f "$FILE"
  exit 1
fi

SIZE="$(du -h "$FILE" | cut -f1)"
SHA="$(sha256sum "$FILE" | cut -d' ' -f1)"
{
  echo "file=$FILE"
  echo "created=$(date -Is)"
  echo "size=$SIZE"
  echo "sha256=$SHA"
  echo "tables=$(gzip -dc "$FILE" | grep -c '^CREATE TABLE')"
} > "${FILE%.sql.gz}.manifest"

# Retention: keeps the last RETENTION_DAYS days of dumps (manifests follow).
find "$BACKUP_DIR" -maxdepth 1 -name 'bumblebkidz_*.sql.gz' -mtime "+$RETENTION_DAYS" -print -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'bumblebkidz_*.manifest' -mtime "+$RETENTION_DAYS" -print -delete

echo "✔ $FILE ($SIZE)"
echo "  sha256 $SHA"
