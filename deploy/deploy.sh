#!/bin/bash
# ClassPilot 一键部署脚本
# 用法：在项目根目录执行 bash deploy/deploy.sh
# 环境变量可选：DEPLOY_HOST、DEPLOY_PATH（默认 /opt/classpilot）

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/classpilot}"

echo "==> 构建前端"
cd "$ROOT_DIR/frontend"
npm ci
npm run build

echo "==> 构建后端"
cd "$ROOT_DIR/backend"
npm ci
npm run build

if [[ -z "$DEPLOY_HOST" ]]; then
  echo "未设置 DEPLOY_HOST，仅完成本地构建。"
  echo "前端产物: $ROOT_DIR/frontend/dist"
  echo "后端产物: $ROOT_DIR/backend/dist"
  echo "示例: DEPLOY_HOST=user@server bash deploy/deploy.sh"
  exit 0
fi

echo "==> 同步到 $DEPLOY_HOST:$DEPLOY_PATH"
ssh "$DEPLOY_HOST" "mkdir -p '$DEPLOY_PATH/frontend' '$DEPLOY_PATH/backend' '$DEPLOY_PATH/data/backups'"
rsync -az --delete "$ROOT_DIR/frontend/dist/" "$DEPLOY_HOST:$DEPLOY_PATH/frontend/dist/"
rsync -az --delete "$ROOT_DIR/backend/dist/" "$DEPLOY_HOST:$DEPLOY_PATH/backend/dist/"
rsync -az "$ROOT_DIR/backend/package.json" "$ROOT_DIR/backend/package-lock.json" "$DEPLOY_HOST:$DEPLOY_PATH/backend/"
rsync -az "$ROOT_DIR/backend/migrations/" "$DEPLOY_HOST:$DEPLOY_PATH/backend/migrations/"
rsync -az "$ROOT_DIR/backend/.env.example" "$DEPLOY_HOST:$DEPLOY_PATH/backend/"
rsync -az "$ROOT_DIR/deploy/ecosystem.config.cjs" "$DEPLOY_HOST:$DEPLOY_PATH/"

ssh "$DEPLOY_HOST" "cd '$DEPLOY_PATH/backend' && npm ci --omit=dev && pm2 startOrReload '$DEPLOY_PATH/ecosystem.config.cjs'"

echo "==> 部署完成"
