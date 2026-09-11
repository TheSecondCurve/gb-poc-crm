#!/bin/sh
# 一键部署/升级：构建新镜像 + up -d；数据库迁移随容器启动自动执行。
# 回滚：docker compose 切回上一个镜像 tag + 恢复最近一次 .backup 快照（见 deployment.md）。
# skill 更新不走部署：客户本机重跑 install.sh 现取（agent-integration.md）。
set -e

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "缺少 .env：请 cp .env.example .env 并填写 SESSION_SECRET 与 ADMIN_PASSWORD" >&2
  exit 1
fi

docker compose build
docker compose up -d
docker compose ps
echo "部署完成。每日备份请配置 cron：DB_PATH=/data/app.db BACKUP_DIR=/data/backups（见 scripts/backup.sh 头部注释）"
