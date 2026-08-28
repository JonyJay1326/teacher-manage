#!/bin/bash
# 手动触发一次备份自检（服务器上执行）
# 用法：curl -X POST http://127.0.0.1:3000/api/v1/backup/run --cookie "cp_token=..."

set -euo pipefail
echo "请登录后调用 POST /api/v1/backup/run，或依赖每日 02:30 定时任务。"
