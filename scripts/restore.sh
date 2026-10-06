#!/usr/bin/env bash
# Restore a backup produced by scripts/backup.sh.
#   ./scripts/restore.sh backups/db-20261006-021500.sql.gz
# DESTRUCTIVE: drops and recreates the current data.
set -euo pipefail
DUMP="${1:?usage: restore.sh <backups/db-*.sql.gz>}"
DB_CONTAINER="${DB_CONTAINER:-bumbleb-db}"

read -rp "This overwrites the live database. Type RESTORE to continue: " ok
[ "$ok" = "RESTORE" ] || { echo "aborted"; exit 1; }

gunzip -c "$DUMP" | docker exec -i "$DB_CONTAINER" psql -U bumbleb -d bumblebkidz_erp
echo "restored from $DUMP"
