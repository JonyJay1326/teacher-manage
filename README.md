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

## 部署

```bash
# 仅本地构建
bash deploy/deploy.sh

# 同步到服务器（需 SSH）
DEPLOY_HOST=user@your-server bash deploy/deploy.sh
```

## 技术栈

详见 [需求文档](./班主任班级管理系统-需求文档.md) 第 2 节与附录 A `.cursorrules`。
