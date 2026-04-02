#!/usr/bin/env bash
# MyTA Personal — SQLite backup script
# Usage: ./scripts/backup.sh [backup_dir]
# Default backup dir: ./backups
# Designed to be run via cron: 0 */6 * * * /path/to/backup.sh

set -euo pipefail

DB_PATH="${DB_PATH:-./data/myta.db}"
BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
KEEP_DAYS="${KEEP_DAYS:-30}"

# Create backup dir
mkdir -p "$BACKUP_DIR"

# Use SQLite's .backup command for a safe, consistent copy
# This works even while the database is in use (WAL mode)
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/myta_$TIMESTAMP.db'"

# Compress
gzip "$BACKUP_DIR/myta_$TIMESTAMP.db"

# Prune old backups
find "$BACKUP_DIR" -name "myta_*.db.gz" -mtime +$KEEP_DAYS -delete

# Report
SIZE=$(du -h "$BACKUP_DIR/myta_$TIMESTAMP.db.gz" | cut -f1)
echo "Backup complete: myta_$TIMESTAMP.db.gz ($SIZE)"
