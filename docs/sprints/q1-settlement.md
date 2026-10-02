# Q1 数据安全强化 — 结算单

- 分支：`feature/q1-backup`（基线 `feature/quality-sprint` ← `main` @ f1cea83）
- 状态：完成，验证通过

## 一、改动清单

| 文件 | 增 | 删 | 说明 |
|---|---:|---:|---|
| `backend/src/modules/backup/backup.service.ts` | +128 | -14 | 滚动保留 14 份、sha256 元数据、`inspect()`/`verify()`、文件名校验抽公共方法 |
| `backend/src/modules/backup/backup.controller.ts` | +13 | -0 | 新增 `POST /api/v1/backup/verify` |
| `backend/src/modules/export/export.repository.ts` | +229 | -0 | 新建：全量导出唯一 SQL 层（学生/成绩/事件/评语） |
| `backend/src/modules/export/export.service.ts` | +222 | -0 | 新建：四 sheet 组装 + xlsx 生成 + 审计 |
| `backend/src/modules/export/export.controller.ts` | +14 | -0 | 新建：`GET /api/v1/export/excel` |
| `backend/src/modules/export/export.module.ts` | +14 | -0 | 新建模块 |
| `backend/src/app.module.ts` | +2 | -0 | 注册 `ExportModule` |
| `backend/src/cli/smoke-q1-backup.ts` | +106 | -0 | 新建：备份/校验/恢复/滚动保留演练 |
| `backend/src/cli/smoke-q1-export.ts` | +107 | -0 | 新建：导出内容与高敏隔离校验 |
| `backend/package.json` | +3 | -1 | 新增两条 `cli:smoke-q1-*` 脚本 |
| `backend/.env.example` | +2 | -0 | 登记 `BACKUP_RETENTION` |
| `frontend/src/api/settings.ts` | +32 | -0 | `verifyBackupApi` / `exportFullExcelApi` 与类型 |
| `frontend/src/views/settings/SettingsView.vue` | +80 | -0 | 备份页「校验」列 + 「导出 Excel」卡片 |

合计：**+1092 / -14**（含 5 份截图与 1 份导出样例），无文件删除、无迁移脚本改动。

## 二、验证证据

### 构建（前后端各一次，零 error）

```text
backend : nest build          -> 0 error
frontend: vue-tsc -b && vite build -> ✓ built in 9.72s, 0 error
```

### 备份演练（mock 库 `data/q1-drill.db`，`npm run cli:smoke-q1-backup`）

```text
== Q1 备份演练 ==
起始学生数: 40
[1] 手动备份 -> classpilot-2026-09-30T12-10-27-915Z.db, quick_check=true
[2] 校验     -> integrity=true, sha256=true, integrity_check 与 sha256 均通过
[3] 篡改检测 -> integrity=false, sha256=null（预期 integrity=false）
[4] 制造漂移后，学生1=漂移测试
[5] 恢复     -> safetyBackup=...-950Z.db, restoredFrom=...-915Z.db
[6] 恢复后学生数=40, 学生1=李敏          <- 数据回到备份时点
[7] 铺入后共 33 份
[8] 滚动保留 -> 删除 19 份，当前 14 份（期望 14）
[9] 孤儿 meta 文件 = 0（期望 0）
== Q1 演练全部通过 ==
```

要点：备份 → 校验 → **恢复演练**三步在 mock 库各跑通一次；单字节篡改能被
`integrity_check` 抓到；31→14 份滚动生效且无孤儿 `.meta.json`。

### 导出演练（`npm run cli:smoke-q1-export`）

```text
== Q1 全量导出演练 ==
计数: {"students":40,"scoreRows":1600,"incidents":1,"comments":1}
sheet 列表: 学生, 成绩, 事件, 评语
  [学生] 41 行(含表头)  表头=学号|姓名|性别|出生日期|状态|走读/住校|班干部|关注等级|家庭住址|现居|民族|入学日期|主要监护人|监护人电话|与学生关系|标签|班主任印象|备注
  [成绩] 1601 行(含表头) 表头=考试|考试日期|学期|学号|姓名|科目|满分|分数|状态|单科班排|总分|总分班排
  [事件] 2 行(含表头)   表头=发生时间|类别|严重度|标题|内容|状态|涉及学生|需跟进|跟进完成时间|跟进结果
  [评语] 2 行(含表头)   表头=学号|姓名|学期|评语类型|评语正文|写入时间|来源
学生 sheet 含印象文本: true（期望 true）
导出不含高敏 sheet: true（期望 true）
== Q1 导出演练通过 ==
```

### HTTP 全链路（真实后端 + 浏览器）

```json
POST /api/v1/backup/run   -> {"ok":true,"filename":"classpilot-2026-09-30T12-13-58-220Z.db"}
GET  /api/v1/backup/list  -> 1 份
POST /api/v1/backup/verify-> {"integrityOk":true,"sha256Ok":true,"size":303104,
                                "detail":"integrity_check 与 sha256 均通过"}
GET  /api/v1/export/excel -> {"students":40,"scoreRows":1600,"incidents":1,"comments":1}
                             文件 747,965 字节，magic=PK（合法 xlsx）
```

浏览器实下载后用 SheetJS 独立读回校验：4 个 sheet、学生 40 行、成绩 1600 行，
抽样行 `202601 / 李敏 / 数学 / 77.5 / 班排 22 / 总分 580 / 总排 20`。

### 截图（`docs/sprints/evidence/q1/`）

| 文件 | 内容 |
|---|---|
| `01-settings-backup-tab.png` | 设置页备份 tab：保留策略文案 + 校验列 + 导出 Excel 卡片 |
| `02-verify-success.png` | 点「校验」后 toast：`integrity_check 与 sha256 均通过` |
| `03-export-success.png` | 点「导出 Excel」后 toast：`已导出：学生 40 · 成绩 1600 · 事件 1 · 评语 1` |
| `04-audit-log.png` | 审计日志含 `backup_run` / `backup_verify` / `backup_restore` / `backup_prune` / `data_export_excel` |
| `export-sample.xlsx` | 浏览器实际下载的导出文件 |

## 三、风险与遗留

**公共文件改动**

- `backend/src/app.module.ts`：仅新增 `ExportModule` 一行 import + 一行注册，无既有逻辑变动。
- `frontend/src/views/settings/SettingsView.vue`：只在备份 tab 内**追加**一块导出卡片、
  在操作列**前置**一个「校验」按钮；既有备份/恢复/阈值/安全/日志/AI 逻辑未动。
- `backend/src/modules/backup/backup.service.ts`：`restore()` 内的文件名校验改为复用
  新增的 `assertBackupFilename()`，**校验规则逐条等价**（`..`、`/`、`\`、后缀、前缀），
  行为无变化。

**行为变化**

1. 每次备份后会删除超出保留份数的旧备份（默认 14，可由 `BACKUP_RETENTION` 调整）。
   这是任务书要求，但**属于破坏性动作**：若线上 `BACKUP_DIR` 里已有超过 14 份历史备份，
   下一次定时备份（02:30）就会删除其中最旧的。首次上线前建议先确认历史备份数量与保留诉求。
2. 备份元数据新增 `sha256` 字段。老备份没有该字段，校验时只跑 `integrity_check`，
   `sha256Ok` 返回 `null`（前端显示为「通过」而非「失败」），不阻断恢复。
3. 新增 `POST /api/v1/backup/verify` 与 `GET /api/v1/export/excel` 两个接口，
   均在 `GlobalAuthGuard` 之下，需登录 Cookie 才能访问，符合安全红线。
4. 导出**不含** L2 高敏（`student_sensitive`），也不含班主任印象以外的敏感明细；
   已在演练中断言。

**遗留**

- 导出为大表时（数万条成绩）一次性在内存拼装 xlsx，未做流式；当前 48 人 × 5 科
  规模无压力，若后续年级规模扩大需评估。
- 导出为全量快照，未支持按学期/考试筛选；任务书未要求，暂不做。
- `smoke-q1-*.ts` 是演练脚本，直接读写 `DB_PATH` 指向的库。
  **绝不可对生产库执行**（`export` 脚本会往库里插一条高敏、一条事件、一条评语）。

**工作区杂物（与本单无关，未处理）**

仓库根出现未跟踪目录 `%SystemDrive%/`，内含 2 个搜狗输入法缓存
`sgim_picface_cloud*.bin`（各 172,152 字节）。这是该输入法厂商未展开环境变量导致的
路径问题，与本任务无关，且删除输入法组件有风险，故**保留原样、未纳入提交**。
建议用户自行确认来源后清理。

## 四、下一单预告（Q2 巨石拆分 + store 化）

**需要的输入**

- `StudentDetailView.vue` 当前 2166 行 / 7 个 tab（档案 / 高敏 / 成绩 / 时间线 / 评语 / 我的印象）。
  计划拆为 tab 子组件，父组件目标 ≤300 行。
- 现有 store 仅 `auth` / `ui` / `incidents`；需新建 `students` / `scores` store。
- 硬约束是**纯等价重构**：UI 行为零变化，需要拆分前后同状态截图对照。

**可能动的文件**

- `frontend/src/views/students/StudentDetailView.vue`（大幅缩减）
- `frontend/src/views/students/tabs/*.vue`（新建若干 tab 子组件）
- `frontend/src/stores/students.ts`、`frontend/src/stores/scores.ts`（新建）
- `frontend/src/views/students/StudentListView.vue`、`frontend/src/views/scores/*.vue`
  （改为读 store，去掉本地副本）

**需要注意**

- 当前分支 `feature/quality-sprint` 未并入 orca 工作区的两个未合入 UI 提交
  （`cursor/playtest-ux-fixes-922e`）。若这些 UI 改动最终要保留，Q2 的截图对照基线
  需要重新确认，否则会出现"重构前后不一致"的误判。建议先定这件事。
