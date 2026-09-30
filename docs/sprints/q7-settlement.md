# Q7 移动端核查 + PWA — 结算单（最后一单）

- 分支：`feature/q7-mobile-pwa`（基线 `feature/quality-sprint` @ 2539792）
- 状态：完成，**8/8 页面 375px 零溢出、桌面零变化、Lighthouse PWA 满分**

## 零、两个决策的落地口径

| 待决项 | 你的选择 / 我的默认 | 实际落地 |
|---|---|---|
| 移动端适配方式 | **需要做，可用媒体查询或其他方式** | 媒体查询，`styles/mobile.css` 断点 768px |
| Lighthouse 跑在哪 | 未授权接 CI（属变更 CI/CD） | **本地跑**，报告已归档 |
| PWA 生产可用性 | 无 HTTPS 域名（既有限制） | **代码就位；生产 HTTP 下 SW 不注册**，见风险 |

**⚠️ 与 AGENTS.md 的冲突（需你后续处理）**

AGENTS.md 写着「前端不做响应式适配，布局 min-width: 1200px」，与本单直接冲突。
按你的明确指令，我以你的指令优先实现了移动端适配，并**保持桌面 1200px 行为不变**
（所有覆盖都锁在 `@media (max-width: 768px)` 内）。

建议把 AGENTS.md 那一行改为：
> 桌面端维持 min-width:1200px；≤768px 走移动端适配（见 styles/mobile.css）

我没有擅自改 AGENTS.md——项目规则文件应由你确认后再动。

## 一、改动清单

| 文件 | 增/删 | 说明 |
|---|---:|---|
| `frontend/src/styles/mobile.css` | +246 / -0 | **新建**：全部移动端覆盖，8 个小节 |
| `frontend/index.html` | +9 / -1 | viewport 改 `device-width`；加 manifest/theme-color/apple-touch-icon |
| `frontend/src/main.ts` | +16 / -0 | 引入 mobile.css；注册 SW（仅 PROD） |
| `frontend/src/layouts/AppLayout.vue` | +42 / -8 | 移动端抽屉状态、resize 监听、遮罩 |
| `frontend/src/components/AppSidebar.vue` | +23 / -4 | `mobileOpen` prop + `navigate` emit |
| `frontend/public/manifest.webmanifest` | +36 / -0 | 新建 PWA manifest（含 3 快捷方式） |
| `frontend/public/sw.js` | +80 / -0 | 新建 Service Worker |
| `frontend/public/icon-192.png` | 新增 | 192×192 应用图标 |
| `frontend/public/icon-512.png` | 新增 | 512×512 应用图标 |
| `frontend/public/icon-maskable-512.png` | 新增 | 可裁剪图标（Lighthouse maskable-icon 需要） |

**新增运行时依赖：0 个。** 图标用后端已有的 `sharp` 从 favicon.svg 生成。

## 二、验证证据

### 2.1 375px 逐页测量：8/8 全部从溢出变为零溢出

```text
修复前（8 个页面全部）: scrollWidth = 1200, clientWidth = 375  → 整页横向溢出
修复后（8 个页面全部）: scrollWidth =  375, clientWidth = 375  → 完全贴合
```

逐页明细（修复后）：
```
/            375/375  ✅
/students    375/375  ✅
/students/1  375/375  ✅
/scores      375/375  ✅
/incidents   375/375  ✅
/analysis    375/375  ✅
/ai/comments 375/375  ✅
/settings    375/375  ✅
```

### 2.2 桌面 1440px 未受影响（关键回归点）

```json
{
  "sidebar display": "flex",
  "sidebar position": "static",
  "sidebar width": "244px",
  "app-layout class": "app-layout",
  "body min-width": "1200px",
  "scrollWidth": 1440
}
```

桌面端 CSS 一行未改，全部改动都在 768px 断点内。

### 2.3 移动端抽屉

```json
{ "关闭态": { "display": "none" },
  "打开态": { "display": "flex", "class": "sidebar sidebar--mobile-open", "mask": true } }
```
点汉堡 → 抽屉 + 遮罩出现；点遮罩或选中菜单项 → 自动关闭。

### 2.4 Lighthouse PWA（本地，v11.7.1）

```text
PWA score: 1.0  ← 满分
  PASS  installable-manifest
  PASS  maskable-icon
  PASS  splash-screen
  PASS  themed-omnibox
  PASS  viewport
  warn  content-width / pwa-cross-browser / pwa-page-transitions / pwa-each-page-has-url
```

四项可安装性审计全部 PASS。三个 warn 均为 Lighthouse 对「非单页应用」
的提示性建议（多页面前端项目正常表现），不影响安装。

> 注：Lighthouse **12.x 已移除 PWA 分类**，故用 11.7.1 跑（CI 常用版本）。

报告已归档：`evidence/q7/lighthouse-pwa.html`、`lighthouse-pwa.json`。

### 2.5 PWA 资源可达（生产 preview 实测）

```json
{ "preview": true, "manifest": true, "sw": true }
```

### 2.6 回归

```text
frontend build : 0 error    tests : 48 passed
backend  build : 0 error    tests : 115 passed
E2E           : 3 passed
```

### 2.7 截图

| 文件 | 内容 |
|---|---|
| `evidence/q7/before-375px.png` | 修复前：viewport 锁定 1200，375px 下压成 1440 宽的桌面 |
| `evidence/q7/mobile-01-dashboard.png` | 修复后首页：单栏 + 课表横滚 |
| `evidence/q7/mobile-student-detail.png` | 学生详情：头部竖排 + 页签横滚 + 卡片单列 |
| `evidence/q7/mobile-drawer-open.png` | 移动端抽屉 + 遮罩 |
| `evidence/q7/mobile-students / analysis / comments / settings / incidents` | 其余页面 375px |
| `evidence/q7/desktop-1440-unchanged.png` | 桌面端未变对照 |
| `evidence/q7/lighthouse-pwa.{html,json}` | Lighthouse 报告 |

问题清单全文见 `docs/sprints/q7-audit.md`（14 项，含严重度与处理方式）。

## 三、关键实现说明

### 1. 为什么侧栏覆盖要加 `!important`

`AppSidebar.vue` 内的 scoped `.sidebar { display: flex }` 与我的媒体查询
**同特异度但组件样式后加载**，导致覆盖失效（实测 `display` 仍为 `flex`）。
这是本单踩到的唯一实质性坑，已用 `!important` 解决并在注释中写明原因。

### 2. 断点选择 768px

与项目最小视口 375px 之间留出余量，覆盖 iPhone SE 到 Pro Max 全系；
同时远低于桌面 1200px，不会误伤任何现有桌面断点。

### 3. SW 缓存策略（关键取舍）

**只缓存静态资源，API 一律走网络**。原因：成绩、评语、事件是业务数据，
一旦被缓存出脏数据会造成严重误判。导航请求为「网络优先 + 离线回落 index.html」，
静态资源为「缓存优先 + 后台更新」。版本号变更即清空旧缓存。

### 4. SW 只在生产构建注册

`if (import.meta.env.PROD && 'serviceWorker' in navigator)`，
且注册失败静默吞掉——非 HTTPS 环境下必然失败，属预期，不打扰用户。

## 四、风险与遗留

**🔴 生产环境 PWA 不会生效（最需要你决策）**

Service Worker 只在 **HTTPS 或 localhost** 下注册。当前生产是
1Panel + Nginx + **HTTP**（`COOKIE_SECURE=false` 即为此配置的）。

因此：**代码完全就绪、Lighthouse 满分，但用户访问 HTTP 域名时
「添加到主屏幕」不可用。** 三条路：

1. 给站点配 HTTPS 证书（Nginx + Let's Encrypt），然后把 `COOKIE_SECURE` 改 `true`。
   这是唯一能真正启用的方案，但涉及部署配置变更（需你授权）。
2. 保持现状，PWA 代码作为「HTTPS 就绪」的状态待命。
3. 放弃 PWA，回退本单这部分。

**我建议 1**，但它属于部署配置变更，需你明确授权我才动。

**iOS Safari 未实测**

Chromium 通过 ≠ iOS 通过。特别是：
- `100dvh`（抽屉高度）在 iOS 地址栏收起/展开时的表现
- `body:has()` 需要 Safari 15.4+
- `el-table` 惯性滚动在 iOS 的表现

建议在真机上过一遍关键页（花名册、学生详情、分析中心）。

**与 AGENTS.md 冲突未消除**

见第零节。建议更新规则措辞，否则后续开发会再次撞上这个矛盾。

**其他**

- 窄屏隐藏了「速记 Alt+Q」入口（键盘快捷键在手机无意义）。
- 未做触控手势优化与卡片式表格——属交互重设计，任务书明确不做。
- CI 仍未接入测试（163 单测 + 3 E2E + Lighthouse 均只在本地跑）。

## 五、七单总收尾

| 单 | 主题 | 状态 |
|---|---|---|
| Q1 | 数据安全强化（备份 14 份 + 校验、全量 Excel） | ✅ |
| Q2 | 巨石拆分（2166→267 行）+ Pinia store 化 | ✅ 6 tab 像素级 0 差异 |
| Q3 | 测试从零到一（143 例 → 现 163 例） | ✅ 抓到 1 个真实回归 |
| Q4 | E2E 关键路径（2 条链路 + 失败留档） | ✅ |
| Q5 | 家长成绩单 PDF（40 份 zip，零泄漏） | ✅ 新增 2 个运行时依赖（经你确认） |
| Q6 | AI 评语流式（打字机 + 续写） | ✅ 零新增依赖 |
| Q7 | 移动端适配 + PWA | ✅ Lighthouse PWA 满分 |

**全局验收对照**

- [x] 七份结算单齐全（`docs/sprints/q1..q7-settlement.md` + `q7-audit.md`）
- [x] `main` 零改动（仍 @ f1cea83）
- [x] `frontend/src/demo/` 零改动
- [x] 总分支 build 前后端零 error、单测 163 全绿、E2E 3 全绿
- [x] 每单独立子分支、逐单结算

**建议的收尾动作**（均需你授权，我没有擅自做）

1. 更新 AGENTS.md 的响应式条款措辞。
2. 决定 PWA 是否配 HTTPS（见第四节）。
3. 决定是否接入 CI 跑测试。
4. 清理仓库根的 `%SystemDrive%/`（搜狗输入法缓存，与项目无关）。
5. 把 `feature/quality-sprint` 合回 `main`（我未执行任何 push）。
