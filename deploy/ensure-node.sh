#!/bin/bash
# 在服务器上确保部署用户（root）与 pm2 可用的 Node >= 18。
# 背景：系统 apt 常为 Node 12；1Panel/root 的 nvm 可能装了 Node 24。
# 若 pm2 落到 Node 12，Nest 会启动失败 → Nginx 502。
set -euo pipefail

TARGET_NODE="/usr/local/bin/node"
MIN_MAJOR=18
OPT_NODE_DIR="/opt/nodejs-v24"

# 取主版本号
node_major() {
  local bin="$1"
  "$bin" -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0
}

# 将完整 Node 发行版落到 /opt，并链到 /usr/local/bin（避免只拷贝 node 导致 npm 残缺）
materialize_node_tree() {
  local src_bin="$1"
  local src_root
  src_root="$(cd "$(dirname "$src_bin")/.." && pwd)"
  rm -rf "$OPT_NODE_DIR"
  cp -a "$src_root" "$OPT_NODE_DIR"
  ln -sfn "$OPT_NODE_DIR/bin/node" /usr/local/bin/node
  ln -sfn "$OPT_NODE_DIR/bin/npm" /usr/local/bin/npm
  ln -sfn "$OPT_NODE_DIR/bin/npx" /usr/local/bin/npx
}

export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"

if [[ -x "$TARGET_NODE" ]] && [[ "$(node_major "$TARGET_NODE")" -ge "$MIN_MAJOR" ]]; then
  echo "ensure-node: 已有 $($TARGET_NODE -v) @ $TARGET_NODE"
  exit 0
fi

CANDIDATE=""
# 1) 已有 /opt 副本
if [[ -x "$OPT_NODE_DIR/bin/node" ]]; then
  CANDIDATE="$OPT_NODE_DIR/bin/node"
fi
# 2) root nvm 最新版
if [[ -z "${CANDIDATE}" ]]; then
  CANDIDATE="$(ls -1d /root/.nvm/versions/node/v*/bin/node 2>/dev/null | sort -V | tail -1 || true)"
fi
# 3) PATH 中的 node
if [[ -z "${CANDIDATE}" ]]; then
  CANDIDATE="$(command -v node || true)"
fi
if [[ -z "${CANDIDATE}" || ! -x "${CANDIDATE}" ]]; then
  echo "ensure-node: 未找到可用 Node 二进制" >&2
  exit 1
fi

MAJOR="$(node_major "$CANDIDATE")"
if [[ "${MAJOR}" -lt "$MIN_MAJOR" ]]; then
  echo "ensure-node: Node 主版本过低 (${MAJOR} < ${MIN_MAJOR})，来源 ${CANDIDATE}" >&2
  echo "ensure-node: 请用 nvm/NodeSource 安装 Node 18+（推荐 22/24）" >&2
  exit 1
fi

echo "ensure-node: 采用 $($CANDIDATE -v) @ ${CANDIDATE}"
if [[ "$CANDIDATE" == "$OPT_NODE_DIR/bin/node" ]]; then
  ln -sfn "$OPT_NODE_DIR/bin/node" /usr/local/bin/node
  ln -sfn "$OPT_NODE_DIR/bin/npm" /usr/local/bin/npm
  ln -sfn "$OPT_NODE_DIR/bin/npx" /usr/local/bin/npx
else
  materialize_node_tree "$CANDIDATE"
fi

echo "ensure-node: 生效 $($TARGET_NODE -v)"
