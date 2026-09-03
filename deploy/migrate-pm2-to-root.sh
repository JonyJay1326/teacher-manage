#!/bin/bash
# 将发布/pm2 从 ubuntu 迁移到 root（一次性）
set -euo pipefail

export PATH="/usr/local/bin:/opt/nodejs-v24/bin:/usr/bin:/bin:${PATH:-}"

echo "==> 把当前 ubuntu 部署公钥写入 root authorized_keys"
mkdir -p /root/.ssh
chmod 700 /root/.ssh
UBUNTU_KEYS="/home/ubuntu/.ssh/authorized_keys"
if [[ -f "$UBUNTU_KEYS" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" =~ ^# ]] && continue
    if ! grep -qF "$line" /root/.ssh/authorized_keys 2>/dev/null; then
      echo "$line" >> /root/.ssh/authorized_keys
      echo "added key"
    fi
  done < "$UBUNTU_KEYS"
fi
chmod 600 /root/.ssh/authorized_keys

echo "==> 停止 ubuntu 用户下的 classpilot-backend"
if command -v runuser >/dev/null 2>&1; then
  runuser -u ubuntu -- pm2 delete classpilot-backend >/dev/null 2>&1 || true
  runuser -u ubuntu -- pm2 save >/dev/null 2>&1 || true
else
  sudo -u ubuntu pm2 delete classpilot-backend >/dev/null 2>&1 || true
  sudo -u ubuntu pm2 save >/dev/null 2>&1 || true
fi

echo "==> 确保 Node / pm2（root）"
if [[ ! -x /usr/local/bin/node ]]; then
  if [[ -x /opt/nodejs-v24/bin/node ]]; then
    ln -sfn /opt/nodejs-v24/bin/node /usr/local/bin/node
    ln -sfn /opt/nodejs-v24/bin/npm /usr/local/bin/npm
    ln -sfn /opt/nodejs-v24/bin/npx /usr/local/bin/npx
  fi
fi
node -v
if ! command -v pm2 >/dev/null 2>&1; then
  npm i -g pm2
fi

echo "==> 以 root 启动 classpilot-backend"
pm2 delete classpilot-backend >/dev/null 2>&1 || true
pm2 start /opt/classpilot/ecosystem.config.cjs
pm2 save
# 开机自启（忽略已配置失败）
STARTUP_CMD="$(pm2 startup systemd -u root --hp /root | tail -n 1 || true)"
if [[ "$STARTUP_CMD" == sudo* || "$STARTUP_CMD" == env* ]]; then
  eval "$STARTUP_CMD" || true
fi

pm2 status
curl -sS -m 5 http://127.0.0.1:3000/api/health
echo
echo "MIGRATE_OK"
