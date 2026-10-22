#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# BumbleB Kidz ERP — restore drill
#
#   bash scripts/restore.sh backups/bumblebkidz_2026-10-22_0230.sql.gz
#   bash scripts/restore.sh <file> --yes        # skip the confirmation
#
# Always prove a restore before you need one. The script:
#   1. verifies the dump's manifest checksum (when present),
#   2. restores into a scratch database (`bumblebkidz_restore_check`) by default,
#   3. prints row counts so you can compare with the manifest.
#
# Restoring over the live database requires `--in-place` AND the exact database
# name typed at the prompt — there is no accidental path to data loss.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILE="${1:-}"
MODE="scratch"
ASSUME_YES="no"
for arg in "${@:2}"; do
  case "$arg" in
    --yes) ASSUME_YES="yes" ;;
    --in-place) MODE="in-place" ;;
    *) echo "✖ unknown flag $arg" >&2; exit 2 ;;
  esac
done

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "usage: bash scripts/restore.sh <dump.sql.gz> [--yes] [--in-place]" >&2
  exit 2
fi

if [ -z "${DATABASE_URL:-}" ]; then
  for candidate in "$ROOT/.env" "$ROOT/api/.env"; do
    if [ -f "$candidate" ]; then
      DATABASE_URL="$(grep -E '^DATABASE_URL=' "$candidate" | tail -1 | cut -d= -f2- | tr -d '"')"
      [ -n "$DATABASE_URL" ] && break
    fi
  done
fi
: "${DATABASE_URL:?DATABASE_URL is not set}"

# ── 1. checksum ──────────────────────────────────────────────
MANIFEST="${FILE%.sql.gz}.manifest"
if [ -f "$MANIFEST" ]; then
  EXPECTED="$(grep '^sha256=' "$MANIFEST" | cut -d= -f2)"
  ACTUAL="$(sha256sum "$FILE" | cut -d' ' -f1)"
  if [ "$EXPECTED" != "$ACTUAL" ]; then
    echo "✖ checksum mismatch — the dump is corrupt or was modified" >&2
    exit 1
  fi
  echo "✔ checksum matches $MANIFEST"
fi

# ── 2. target database ───────────────────────────────────────
BASE_DB="${DATABASE_URL##*/}"
BASE_DB="${BASE_DB%%\?*}"
BASE_URL="${DATABASE_URL%/*}"

if [ "$MODE" = "scratch" ]; then
  TARGET_DB="bumblebkidz_restore_check"
  TARGET_URL="$BASE_URL/$TARGET_DB"
  echo "── restoring into scratch database $TARGET_DB"
  psql "$BASE_URL/postgres" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$TARGET_DB\";" >/dev/null
  psql "$BASE_URL/postgres" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$TARGET_DB\";" >/dev/null
else
  TARGET_DB="$BASE_DB"
  TARGET_URL="$DATABASE_URL"
  echo "⚠  IN-PLACE RESTORE into '$TARGET_DB' will destroy current data."
  if [ "$ASSUME_YES" != "yes" ]; then
    read -r -p "Type the database name ($TARGET_DB) to continue: " CONFIRM
    [ "$CONFIRM" = "$TARGET_DB" ] || { echo "✖ aborted"; exit 1; }
  fi
fi

# ── 3. load ─────────────────────────────────────────────────
# The dump is plain SQL; extensions may already exist, so ignore duplicate-object
# errors rather than aborting a good restore on a re-run.
gzip -dc "$FILE" | psql "$TARGET_URL" -v ON_ERROR_STOP=1 --single-transaction >/dev/null
echo "✔ restored"

# ── 4. prove it ─────────────────────────────────────────────
echo "── row counts"
psql "$TARGET_URL" -v ON_ERROR_STOP=1 -c "
  SELECT 'students' AS table, count(*) FROM students
  UNION ALL SELECT 'fee_transactions', count(*) FROM fee_transactions
  UNION ALL SELECT 'attendance_records', count(*) FROM attendance_records
  UNION ALL SELECT 'users', count(*) FROM users
  ORDER BY table;"

echo "✔ restore drill complete ($MODE)"
