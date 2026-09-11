#!/bin/sh
# 每日备份：sqlite3 .backup（禁止 cp 热库）→ gzip → chmod 600，本地滚动保留 RETENTION_DAYS 天。
# 用法：DB_PATH=/data/app.db BACKUP_DIR=/data/backups sh scripts/backup.sh
# cron 示例：17 3 * * * DB_PATH=/data/app.db BACKUP_DIR=/data/backups /bin/sh /app/scripts/backup.sh
set -e

DB_PATH="${DB_PATH:-/data/app.db}"
BACKUP_DIR="${BACKUP_DIR:-/data/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

if [ ! -f "$DB_PATH" ]; then
  echo "backup.sh: 数据库不存在：$DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP=$(date -u +%Y-%m-%dT%H%M%SZ)
OUT="$BACKUP_DIR/xhs-$STAMP.db"
TMP_GZ="$OUT.gz.tmp.$$"

# .backup 是 SQLite 官方热备份接口：在线一致快照，不阻塞读写
sqlite3 "$DB_PATH" ".backup '$OUT'"
chmod 600 "$OUT"
gzip -c "$OUT" > "$TMP_GZ"
chmod 600 "$TMP_GZ"
mv "$TMP_GZ" "$OUT.gz"
rm -f "$OUT"

# 滚动清理：删除超过保留天数的旧备份
find "$BACKUP_DIR" -name 'xhs-*.db.gz' -mtime "+$RETENTION_DAYS" -delete

echo "backup.sh: $OUT.gz（保留 ${RETENTION_DAYS} 天）"
