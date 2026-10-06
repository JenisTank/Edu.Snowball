#!/usr/bin/env bash
# ── BumbleB Kidz ERP · nightly backup ───────────────────────────────
# Dumps Postgres + the document vault, keeps N days, prunes the rest.
#   ./scripts/backup.sh                 # run once
#   crontab -e →  15 2 * * *  cd /srv/bumbleb-erp && ./scripts/backup.sh >> /var/log/bumbleb-backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-$(pwd)/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DB_CONTAINER="${DB_CONTAINER:-bumbleb-db}"
API_CONTAINER="${API_CONTAINER:-bumbleb-api}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

echo "[$(date -Is)] dumping database…"
docker exec "$DB_CONTAINER" pg_dump -U bumbleb -d bumblebkidz_erp --clean --if-exists \
  | gzip -9 > "$BACKUP_DIR/db-$STAMP.sql.gz"

echo "[$(date -Is)] archiving document vault…"
docker run --rm \
  --volumes-from "$API_CONTAINER" \
  -v "$BACKUP_DIR:/backup" \
  busybox tar czf "/backup/storage-$STAMP.tar.gz" -C /app storage

# Convenience symlink for the restore script.
ln -sf "db-$STAMP.sql.gz" "$BACKUP_DIR/latest.sql.gz"

echo "[$(date -Is)] pruning backups older than ${KEEP_DAYS} days…"
find "$BACKUP_DIR" -name 'db-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'storage-*.tar.gz' -mtime +"$KEEP_DAYS" -delete

echo "[$(date -Is)] done → $BACKUP_DIR"
ls -lh "$BACKUP_DIR" | tail -5
