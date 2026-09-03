#!/bin/bash
# ClassPilot 一键部署（适配 1Panel + 无域名 IP 访问）
# 用法（在项目根目录）：
#   仅本地构建：  bash deploy/deploy.sh
#   构建并同步：  DEPLOY_HOST=root@公网IP bash deploy/deploy.sh
#
# 环境变量：
#   DEPLOY_HOST          必填才同步，如 root@1.2.3.4
#   DEPLOY_APP_PATH      后端与数据根目录，默认 /opt/classpilot
#   DEPLOY_WEB_PATH      1Panel 网站运行目录，默认 /opt/1panel/www/sites/classpilot/index
#   FORCE_NPM_CI=1       强制重新 npm ci（Windows 上若 esbuild 被占用会 EPERM，先关 Vite）
#
# 说明：整包一次 tar|ssh 上传（只需输一次密码）。勿用 ControlMaster（Git Bash/Windows 常失败）。
# 发布账号固定为 root（与 1Panel 终端一致，避免 ubuntu/root 双 pm2 互相看不到）。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_APP_PATH="${DEPLOY_APP_PATH:-/opt/classpilot}"
DEPLOY_WEB_PATH="${DEPLOY_WEB_PATH:-/opt/1panel/www/sites/classpilot/index}"
FORCE_NPM_CI="${FORCE_NPM_CI:-0}"

# 安装依赖：目录缺失或关键二进制不在时才 npm ci（避免残缺 node_modules）
install_deps() {
  local dir="$1"
  shift
  local need_ci=0
  if [[ "$FORCE_NPM_CI" == "1" || ! -d "$dir/node_modules" ]]; then
    need_ci=1
  else
    local bin
    for bin in "$@"; do
      if [[ ! -e "$dir/node_modules/.bin/$bin" && ! -e "$dir/node_modules/.bin/$bin.cmd" ]]; then
        echo "    缺少 $bin，将重新 npm ci"
        need_ci=1
        break
      fi
    done
  fi
  if [[ "$need_ci" == "1" ]]; then
    echo "    npm ci ($dir)"
    (cd "$dir" && npm ci)
  else
    echo "    跳过 npm ci（依赖完整）；强制重装加 FORCE_NPM_CI=1"
  fi
}

echo "==> 构建前端"
install_deps "$ROOT_DIR/frontend" vue-tsc vite
cd "$ROOT_DIR/frontend"
npm run build

echo "==> 构建后端"
install_deps "$ROOT_DIR/backend" nest
cd "$ROOT_DIR/backend"
npm run build

if [[ -z "$DEPLOY_HOST" ]]; then
  echo "未设置 DEPLOY_HOST，仅完成本地构建。"
  echo "前端产物: $ROOT_DIR/frontend/dist"
  echo "后端产物: $ROOT_DIR/backend/dist"
  echo "示例: DEPLOY_HOST=root@1.2.3.4 bash deploy/deploy.sh"
  exit 0
fi

echo "==> 打包部署产物"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/classpilot-deploy.XXXXXX")"
cleanup_stage() {
  rm -rf "$STAGE"
}
trap cleanup_stage EXIT

mkdir -p "$STAGE/web" "$STAGE/backend/dist" "$STAGE/backend/migrations"
# 复制时用 . 避免目录嵌套差异
cp -R "$ROOT_DIR/frontend/dist/." "$STAGE/web/"
cp -R "$ROOT_DIR/backend/dist/." "$STAGE/backend/dist/"
cp -R "$ROOT_DIR/backend/migrations/." "$STAGE/backend/migrations/"
cp "$ROOT_DIR/backend/package.json" "$ROOT_DIR/backend/package-lock.json" "$STAGE/backend/"
cp "$ROOT_DIR/backend/.env.example" "$STAGE/backend/"
cp "$ROOT_DIR/deploy/ecosystem.config.cjs" "$STAGE/"
cp "$ROOT_DIR/deploy/ensure-node.sh" "$STAGE/"

echo "==> 同步到 $DEPLOY_HOST（一次 SSH，输入一次密码）"
echo "    前端 → $DEPLOY_WEB_PATH"
echo "    后端 → $DEPLOY_APP_PATH/backend"

# 远端：解压 → 覆盖站点与后端 → 装依赖（lock 未变则跳过）→ 确保 Node>=18 → pm2
(
  cd "$STAGE"
  tar czf - .
) | ssh "$DEPLOY_HOST" "set -euo pipefail
APP='$DEPLOY_APP_PATH'
WEB='$DEPLOY_WEB_PATH'
TMP=\$(mktemp -d /tmp/classpilot-recv.XXXXXX)
trap 'rm -rf \"\$TMP\"' EXIT
mkdir -p \"\$TMP\" \"\$WEB\" \"\$APP/backend\" \"\$APP/data\" \"\$APP/uploads\" \"\$APP/backups\" \"\$APP/logs\"
tar xzf - -C \"\$TMP\"
rm -rf \"\$WEB\"
mkdir -p \"\$WEB\"
cp -R \"\$TMP/web/.\" \"\$WEB/\"
rm -rf \"\$APP/backend/dist\" \"\$APP/backend/migrations\"
mkdir -p \"\$APP/backend/dist\" \"\$APP/backend/migrations\"
cp -R \"\$TMP/backend/dist/.\" \"\$APP/backend/dist/\"
cp -R \"\$TMP/backend/migrations/.\" \"\$APP/backend/migrations/\"
cp \"\$TMP/backend/package.json\" \"\$TMP/backend/package-lock.json\" \"\$TMP/backend/.env.example\" \"\$APP/backend/\"
cp \"\$TMP/ecosystem.config.cjs\" \"\$APP/\"
cp \"\$TMP/ensure-node.sh\" \"\$APP/\"
bash \"\$APP/ensure-node.sh\"
export PATH=\"/usr/local/bin:\$PATH\"
cd \"\$APP/backend\"
LOCK_HASH=\$(sha256sum package-lock.json | awk '{print \$1}')
if [[ -d node_modules && -f .deps-lock-sha256 && \"\$(cat .deps-lock-sha256)\" == \"\$LOCK_HASH\" ]]; then
  echo '跳过 npm ci（package-lock 未变）'
else
  echo '执行 npm ci --omit=dev（依赖有变更或首次安装）'
  npm ci --omit=dev
  echo \"\$LOCK_HASH\" > .deps-lock-sha256
fi
if command -v pm2 >/dev/null 2>&1; then
  # delete+start 才能可靠切换 interpreter（仅 reload 可能仍用旧 Node 12）
  pm2 delete classpilot-backend >/dev/null 2>&1 || true
  pm2 start \"\$APP/ecosystem.config.cjs\"
  pm2 save || true
else
  echo '未安装 pm2。请执行: sudo npm i -g pm2 && pm2 start '\"\$APP/ecosystem.config.cjs\"
fi
echo REMOTE_OK
"

echo "==> 部署完成"
echo "    健康检查: http://公网IP/api/health"
echo "    若首次上线，请确认服务器已有 $DEPLOY_APP_PATH/backend/.env （含 COOKIE_SECURE=false）"
