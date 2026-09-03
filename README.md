# ClassPilot（班级领航员）

班主任班级管理系统 — 单人驾驶舱，三年周期班级管理工具。

## 项目结构

```
teacher-manage/
├── frontend/     # Vue 3.5 + Vite + Element Plus
├── backend/      # NestJS + SQLite（better-sqlite3）
├── deploy/       # Nginx / pm2 / 部署脚本
└── 班主任班级管理系统-需求文档.md
```

## 本地开发

### 1. 后端

```bash
cd backend
cp .env.example .env   # 首次
npm install
npm run cli:create-user -- admin admin123 王老师   # 单用户，仅首次
npm run dev
```

- 健康检查：http://localhost:3000/api/health
- API 前缀：`/api/v1/**`（需登录 Cookie）

### 2. 前端

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:5173 ，使用上面创建的账号登录。Vite 已代理 `/api` → `3000`。

## M0 已交付能力

- 登录 / 登出 / 修改密码（HttpOnly JWT Cookie）
- 学生花名册 CRUD、标签、监护人、粘贴导入
- 考试配置、成绩录入、保存并重算班排、考试详情排序
- 事件 Alt+Q 速记草稿池 + 手工确认入库
- 每日 02:30 自动备份 + 设置页手动备份
- 部署：`deploy/deploy.sh`、`deploy/ecosystem.config.cjs`、`deploy/nginx.conf`

## 部署（1Panel + 公网 IP）

目录约定：

- 前端：`/opt/1panel/www/sites/classpilot/index/`
- 后端与数据：`/opt/classpilot/`

```bash
# 仅本地构建（Git Bash / WSL）
bash deploy/deploy.sh

# 构建并同步到服务器（需本机已配置 SSH；发布账号为 root）
DEPLOY_HOST=root@你的公网IP bash deploy/deploy.sh
```

首次上线还需在服务器写好 `backend/.env`（含 `COOKIE_SECURE=false`）、创建管理员：

```bash
cd /opt/classpilot/backend
node dist/cli/create-user.js <username> <password> [displayName]
```

### GitHub 自动发布（push main）

1. 本机生成**专用**部署密钥（不要用登录密码反复输）：

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519_classpilot_deploy
ssh-copy-id -i ~/.ssh/id_ed25519_classpilot_deploy.pub root@你的公网IP
```

2. 仓库 **Settings → Secrets and variables → Actions** 新增/更新：

| Name | 值 |
|------|-----|
| `DEPLOY_HOST` | `root@你的公网IP` |
| `DEPLOY_SSH_KEY` | `~/.ssh/id_ed25519_classpilot_deploy` **私钥全文**（含 `BEGIN`/`END` 行） |

可选：`DEPLOY_APP_PATH`、`DEPLOY_WEB_PATH`（默认已是上面目录）。

3. 把 `.github/workflows/deploy.yml` 推到 `main` 后，每次 push `main` 会自动构建并发布；也可在 Actions 页手动 **Run workflow**。

**不会**覆盖服务器上的 `.env`、`data/`、`uploads/`。

> **运行时 Node**：服务器 apt 自带的 `/usr/bin/node` 可能是 v12，而 1Panel/root 的 nvm 才是 v24。  
> pm2 若落到 Node 12，Nest 会启动失败，表现为登录/`/api/health` **502**。  
> 部署脚本会把可用的 Node≥18 落到 `/usr/local/bin/node`，并用它启动 pm2；**不是**打包机 Node 版本问题。  
> **发布与 pm2 统一使用 root**，避免 1Panel 终端（root）与部署账号（曾用 ubuntu）互相看不到进程。

## 技术栈

详见 [需求文档](./班主任班级管理系统-需求文档.md) 第 2 节与附录 A `.cursorrules`。
