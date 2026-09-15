#!/usr/bin/env bash
# backup.sh —— Phase 7 7c：PostgreSQL 备份（pg_dump 自定义格式 + 保留 N 份）。
# 用法：DATABASE_URL=... BACKUP_DIR=/path ./scripts/backup.sh [keep=7]
set -euo pipefail

DATABASE_URL="${DATABASE_URL:?DATABASE_URL required}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
KEEP="${1:-7}"
mkdir -p "$BACKUP_DIR"

# 从 DSN 提取 host/port/db/user（含常见无密码场景）
HOST=$(python3 -c "import sys,urllib.parse as u; p=u.urlparse('$DATABASE_URL'); print(p.hostname or 'localhost')")
PORT=$(python3 -c "import sys,urllib.parse as u; p=u.urlparse('$DATABASE_URL'); print(p.port or 5432)")
DB=$(python3 -c "import sys,urllib.parse as u; p=u.urlparse('$DATABASE_URL'); print(p.path.lstrip('/').split('?')[0])")
USER=$(python3 -c "import sys,urllib.parse as u; p=u.urlparse('$DATABASE_URL'); print(u.unquote(p.username) if p.username else 'postgres')")
export PGPASSWORD=$(python3 -c "import sys,urllib.parse as u; p=u.urlparse('$DATABASE_URL'); print(u.unquote(p.password) if p.password else '')")

STAMP=$(date +%Y%m%d-%H%M%S)
FILE="$BACKUP_DIR/ocean-$STAMP.dump"

# 优先用容器内 pg_dump（避免本地/服务器版本不匹配）
if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx ocean-postgres; then
  docker exec ocean-postgres pg_dump -U "$USER" -d "$DB" -Fc -f /tmp/ocean-backup.dump
  docker cp ocean-postgres:/tmp/ocean-backup.dump "$FILE" >/dev/null
  docker exec ocean-postgres rm -f /tmp/ocean-backup.dump
else
  pg_dump -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -Fc -f "$FILE"
fi
echo "backup written: $FILE ($(du -h "$FILE" | cut -f1))"

# 保留最近 KEEP 份
ls -1t "$BACKUP_DIR"/ocean-*.dump 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "kept newest $KEEP backups in $BACKUP_DIR"
