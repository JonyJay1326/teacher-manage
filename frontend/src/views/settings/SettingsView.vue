<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ApiError } from '@/api/http';
import { changePasswordApi, pinStatusApi, setPinApi, type PinStatus } from '@/api/auth';
import { aiHealthApi, type AiHealthView } from '@/api/comments';
import {
  getThresholdsApi,
  listAuditLogsApi,
  listBackupsApi,
  restoreBackupApi,
  runBackupApi,
  updateThresholdsApi,
  type AuditLogItemDto,
  type BackupItemDto,
  type ThresholdsDto,
} from '@/api/settings';

const router = useRouter();
const activeTab = ref('thresholds');

const thresholds = ref<ThresholdsDto>({
  lowScoreRatio: 0.4,
  passRatio: 0.6,
  excellentRatio: 0.85,
  rankJumpThreshold: 8,
});
const thresholdsSaving = ref(false);

const pinStatus = ref<PinStatus | null>(null);
const pinPassword = ref('');
const pinNew = ref('');
const pinConfirm = ref('');
const pinSubmitting = ref(false);

const oldPassword = ref('');
const newPassword = ref('');
const newPasswordConfirm = ref('');
const pwdSubmitting = ref(false);

const backups = ref<BackupItemDto[]>([]);
const backupLoading = ref(false);
const backupListing = ref(false);
const restoreLoading = ref('');

const aiHealth = ref<AiHealthView | null>(null);

const auditItems = ref<AuditLogItemDto[]>([]);
const auditTotal = ref(0);
const auditPage = ref(1);
const auditPageSize = ref(20);
const auditQ = ref('');
const auditAction = ref('');
const auditLoading = ref(false);

/** 低分线百分比展示 */
const lowPct = computed({
  get: () => Math.round(thresholds.value.lowScoreRatio * 100),
  set: (v: number) => {
    thresholds.value.lowScoreRatio = v / 100;
  },
});

/** 及格线百分比 */
const passPct = computed({
  get: () => Math.round(thresholds.value.passRatio * 100),
  set: (v: number) => {
    thresholds.value.passRatio = v / 100;
  },
});

/** 优秀线百分比 */
const excellentPct = computed({
  get: () => Math.round(thresholds.value.excellentRatio * 100),
  set: (v: number) => {
    thresholds.value.excellentRatio = v / 100;
  },
});

/** 加载阈值 */
async function loadThresholds(): Promise<void> {
  try {
    thresholds.value = await getThresholdsApi();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载阈值失败');
  }
}

/** 保存阈值 */
async function saveThresholds(): Promise<void> {
  if (
    !(
      thresholds.value.lowScoreRatio < thresholds.value.passRatio
      && thresholds.value.passRatio < thresholds.value.excellentRatio
    )
  ) {
    ElMessage.warning('须满足：低分线 < 及格线 < 优秀线');
    return;
  }
  thresholdsSaving.value = true;
  try {
    thresholds.value = await updateThresholdsApi(thresholds.value);
    ElMessage.success('阈值已保存，分析页将即时生效');
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '保存失败');
  } finally {
    thresholdsSaving.value = false;
  }
}

/** 加载 PIN */
async function loadPinStatus(): Promise<void> {
  try {
    pinStatus.value = await pinStatusApi();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载 PIN 失败');
  }
}

/** 提交 PIN */
async function submitPin(): Promise<void> {
  if (!pinPassword.value) {
    ElMessage.warning('请输入登录密码');
    return;
  }
  if (!/^\d{6}$/.test(pinNew.value)) {
    ElMessage.warning('PIN 须为 6 位数字');
    return;
  }
  if (pinNew.value !== pinConfirm.value) {
    ElMessage.warning('两次 PIN 不一致');
    return;
  }
  pinSubmitting.value = true;
  try {
    await setPinApi(pinPassword.value, pinNew.value);
    ElMessage.success(pinStatus.value?.hasPin ? 'PIN 已更新' : 'PIN 已设置');
    pinPassword.value = '';
    pinNew.value = '';
    pinConfirm.value = '';
    await loadPinStatus();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '设置 PIN 失败');
  } finally {
    pinSubmitting.value = false;
  }
}

/** 修改登录密码 */
async function submitPassword(): Promise<void> {
  if (!oldPassword.value || !newPassword.value) {
    ElMessage.warning('请填写完整');
    return;
  }
  if (newPassword.value.length < 6) {
    ElMessage.warning('新密码至少 6 位');
    return;
  }
  if (newPassword.value !== newPasswordConfirm.value) {
    ElMessage.warning('两次新密码不一致');
    return;
  }
  pwdSubmitting.value = true;
  try {
    await changePasswordApi(oldPassword.value, newPassword.value);
    ElMessage.success('登录密码已修改');
    oldPassword.value = '';
    newPassword.value = '';
    newPasswordConfirm.value = '';
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '修改密码失败');
  } finally {
    pwdSubmitting.value = false;
  }
}

/** 加载备份列表 */
async function loadBackups(): Promise<void> {
  backupListing.value = true;
  try {
    backups.value = await listBackupsApi();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载备份列表失败');
  } finally {
    backupListing.value = false;
  }
}

/** 立即备份 */
async function runBackup(): Promise<void> {
  backupLoading.value = true;
  try {
    const result = await runBackupApi();
    ElMessage.success(
      result.ok ? `备份成功：${result.filename}` : '备份已写入但完整性检查未通过',
    );
    await loadBackups();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '备份失败');
  } finally {
    backupLoading.value = false;
  }
}

/** 恢复备份 */
async function restoreBackup(item: BackupItemDto): Promise<void> {
  if (item.quickCheckOk === false) {
    ElMessage.warning('该备份完整性检查未通过，不能恢复');
    return;
  }
  try {
    await ElMessageBox.confirm(
      `将用「${item.filename}」覆盖当前数据库。恢复前会先自动备份当前库。此操作不可撤销，是否继续？`,
      '恢复确认',
      { type: 'warning', confirmButtonText: '确认恢复', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  restoreLoading.value = item.filename;
  try {
    const res = await restoreBackupApi(item.filename);
    ElMessage.success(
      `已恢复。安全备份：${res.safetyBackup}。建议刷新页面。`,
    );
    await loadBackups();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '恢复失败');
  } finally {
    restoreLoading.value = '';
  }
}

/** 加载 AI */
async function loadAiHealth(): Promise<void> {
  try {
    aiHealth.value = await aiHealthApi();
  } catch {
    aiHealth.value = null;
  }
}

/** 加载审计日志 */
async function loadAuditLogs(): Promise<void> {
  auditLoading.value = true;
  try {
    const data = await listAuditLogsApi({
      page: auditPage.value,
      pageSize: auditPageSize.value,
      q: auditQ.value.trim() || undefined,
      action: auditAction.value.trim() || undefined,
    });
    auditItems.value = data.items;
    auditTotal.value = data.total;
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载安全日志失败');
  } finally {
    auditLoading.value = false;
  }
}

/** 文件大小 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** 本地时间 */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN');
}

/** 跳转评语模板（占位页） */
function goPrompts(): void {
  router.push('/ai/prompts');
}

watch(activeTab, (tab) => {
  if (tab === 'backup') void loadBackups();
  if (tab === 'audit') void loadAuditLogs();
  if (tab === 'ai') void loadAiHealth();
});

onMounted(() => {
  void loadThresholds();
  void loadPinStatus();
  void loadAiHealth();
});
</script>

<template>
  <div class="settings cp-animate-in">
    <div class="cp-page-header">
      <div>
        <h2 class="cp-page-header__title">系统设置</h2>
        <p class="cp-page-header__desc">阈值 · 安全 · 备份 · 日志 · AI 用量</p>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="settings__tabs">
      <!-- 基础阈值 -->
      <el-tab-pane label="基础阈值" name="thresholds">
        <div class="cp-card cp-content-card settings__block">
          <h3 class="cp-section-title">成绩分析阈值</h3>
          <p class="settings__hint">
            修改后分析中心即时按新阈值计算；历史成绩存档本身不变。
          </p>
          <el-form label-width="140px" class="settings__form" @submit.prevent>
            <el-form-item label="低分线（满分比）">
              <el-input-number v-model="lowPct" :min="5" :max="95" />
              <span class="settings__unit">% · 当前 {{ thresholds.lowScoreRatio }}</span>
            </el-form-item>
            <el-form-item label="及格线（满分比）">
              <el-input-number v-model="passPct" :min="10" :max="99" />
              <span class="settings__unit">%</span>
            </el-form-item>
            <el-form-item label="优秀线（满分比）">
              <el-input-number v-model="excellentPct" :min="20" :max="100" />
              <span class="settings__unit">%</span>
            </el-form-item>
            <el-form-item label="进退步名次阈值">
              <el-input-number
                v-model="thresholds.rankJumpThreshold"
                :min="1"
                :max="50"
              />
              <span class="settings__unit">名</span>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="thresholdsSaving" @click="saveThresholds">
                保存阈值
              </el-button>
            </el-form-item>
          </el-form>
        </div>
        <div class="cp-card cp-content-card settings__block">
          <h3 class="cp-section-title">评语模板</h3>
          <p class="settings__hint">模板管理页后续完善；当前工作台使用内置语气/篇幅参数。</p>
          <el-button @click="goPrompts">打开模板管理</el-button>
        </div>
      </el-tab-pane>

      <!-- 安全 -->
      <el-tab-pane label="安全" name="security">
        <div class="cp-card cp-content-card settings__block">
          <h3 class="cp-section-title">修改登录密码</h3>
          <el-form label-width="110px" class="settings__form" @submit.prevent>
            <el-form-item label="当前密码" required>
              <el-input v-model="oldPassword" type="password" show-password />
            </el-form-item>
            <el-form-item label="新密码" required>
              <el-input v-model="newPassword" type="password" show-password />
            </el-form-item>
            <el-form-item label="确认新密码" required>
              <el-input v-model="newPasswordConfirm" type="password" show-password />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="pwdSubmitting" @click="submitPassword">
                更新密码
              </el-button>
            </el-form-item>
          </el-form>
        </div>

        <div class="cp-card cp-content-card settings__block">
          <h3 class="cp-section-title">高敏 PIN</h3>
          <p class="settings__hint">
            6 位数字 PIN，用于解锁学生 L2 高敏明细；与登录密码独立。
            <span v-if="pinStatus">
              当前：{{ pinStatus.hasPin ? '已设置' : '未设置' }}
              <template v-if="pinStatus.unlocked">
                · 已解锁至 {{ new Date(pinStatus.unlockedUntil!).toLocaleTimeString('zh-CN') }}
              </template>
            </span>
          </p>
          <el-form label-width="110px" class="settings__form" @submit.prevent>
            <el-form-item label="登录密码" required>
              <el-input
                v-model="pinPassword"
                type="password"
                show-password
                autocomplete="current-password"
              />
            </el-form-item>
            <el-form-item :label="pinStatus?.hasPin ? '新 PIN' : 'PIN'" required>
              <el-input
                v-model="pinNew"
                type="password"
                maxlength="6"
                show-password
                autocomplete="new-password"
              />
            </el-form-item>
            <el-form-item label="确认 PIN" required>
              <el-input
                v-model="pinConfirm"
                type="password"
                maxlength="6"
                show-password
                autocomplete="new-password"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="pinSubmitting" @click="submitPin">
                {{ pinStatus?.hasPin ? '更新 PIN' : '设置 PIN' }}
              </el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <!-- 备份 -->
      <el-tab-pane label="备份" name="backup">
        <div class="cp-card cp-content-card settings__block">
          <div class="settings__row">
            <div>
              <h3 class="cp-section-title">数据备份</h3>
              <p class="settings__hint">
                每日 02:30 自动备份；恢复前会强制先备份当前库。
              </p>
            </div>
            <div class="settings__row-actions">
              <el-button @click="loadBackups" :loading="backupListing">刷新列表</el-button>
              <el-button type="primary" :loading="backupLoading" @click="runBackup">
                立即备份
              </el-button>
            </div>
          </div>
          <el-table :data="backups" v-loading="backupListing" empty-text="暂无备份">
            <el-table-column prop="filename" label="文件名" min-width="260" />
            <el-table-column label="大小" width="100">
              <template #default="{ row }">{{ formatSize(row.size) }}</template>
            </el-table-column>
            <el-table-column label="时间" width="180">
              <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="完整性" width="100" align="center">
              <template #default="{ row }">
                <el-tag
                  v-if="row.quickCheckOk === true"
                  type="success"
                  size="small"
                  effect="plain"
                >
                  通过
                </el-tag>
                <el-tag
                  v-else-if="row.quickCheckOk === false"
                  type="danger"
                  size="small"
                  effect="plain"
                >
                  失败
                </el-tag>
                <el-tag v-else size="small" effect="plain">未知</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="trigger" label="来源" width="110" />
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button
                  link
                  type="danger"
                  :loading="restoreLoading === row.filename"
                  @click="restoreBackup(row as BackupItemDto)"
                >
                  恢复
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- 安全日志 -->
      <el-tab-pane label="安全日志" name="audit">
        <div class="cp-card cp-content-card settings__block">
          <h3 class="cp-section-title">审计日志</h3>
          <p class="settings__hint">只读浏览；含 PIN、高敏读写、备份恢复、阈值变更等。</p>
          <div class="settings__filters">
            <el-input
              v-model="auditQ"
              clearable
              placeholder="搜索 action / detail"
              style="width: 240px"
              @keyup.enter="loadAuditLogs"
            />
            <el-input
              v-model="auditAction"
              clearable
              placeholder="精确 action"
              style="width: 200px"
              @keyup.enter="loadAuditLogs"
            />
            <el-button type="primary" @click="() => { auditPage = 1; loadAuditLogs(); }">
              查询
            </el-button>
          </div>
          <el-table :data="auditItems" v-loading="auditLoading" empty-text="暂无日志">
            <el-table-column prop="id" label="ID" width="72" />
            <el-table-column prop="action" label="动作" width="200" />
            <el-table-column label="学生" width="90">
              <template #default="{ row }">
                {{ row.targetStudentId ?? '—' }}
              </template>
            </el-table-column>
            <el-table-column prop="detail" label="详情" min-width="240" show-overflow-tooltip />
            <el-table-column label="时间" width="180">
              <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
            </el-table-column>
          </el-table>
          <div class="settings__pager">
            <el-pagination
              v-model:current-page="auditPage"
              v-model:page-size="auditPageSize"
              :total="auditTotal"
              layout="total, prev, pager, next"
              @current-change="loadAuditLogs"
            />
          </div>
        </div>
      </el-tab-pane>

      <!-- AI -->
      <el-tab-pane label="AI 用量" name="ai">
        <div class="cp-card cp-content-card settings__block">
          <h3 class="cp-section-title">DeepSeek 用量</h3>
          <p class="settings__hint">
            API Key 仅存服务器环境变量；未配置时评语/Excel 列识别走降级，核心 CRUD 不受影响。
          </p>
          <template v-if="aiHealth">
            <ul class="settings__stats">
              <li>状态：{{ aiHealth.configured ? '已配置' : '未配置' }}</li>
              <li>当月调用：{{ aiHealth.month.callCount }} 次</li>
              <li>失败：{{ aiHealth.month.failCount }} 次</li>
              <li>
                失败率：
                {{
                  aiHealth.month.callCount > 0
                    ? `${((aiHealth.month.failCount / aiHealth.month.callCount) * 100).toFixed(1)}%`
                    : '—'
                }}
              </li>
              <li>
                tokens 入 / 出：{{ aiHealth.month.tokensIn }} / {{ aiHealth.month.tokensOut }}
              </li>
            </ul>
          </template>
          <el-button @click="loadAiHealth">刷新</el-button>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.settings__tabs :deep(.el-tabs__header) {
  margin-bottom: var(--cp-gap-4);
}

.settings__block {
  margin-bottom: var(--cp-gap-4);
}

.settings__hint {
  margin: var(--cp-gap-2) 0 var(--cp-gap-4);
  font-size: var(--cp-font-sm);
  color: var(--cp-text-2);
}

.settings__form {
  max-width: 520px;
}

.settings__unit {
  margin-left: var(--cp-gap-2);
  color: var(--cp-text-3);
  font-size: var(--cp-font-sm);
}

.settings__row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cp-gap-4);
  margin-bottom: var(--cp-gap-3);
}

.settings__row-actions {
  display: flex;
  gap: var(--cp-gap-2);
  flex-shrink: 0;
}

.settings__filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cp-gap-3);
  margin-bottom: var(--cp-gap-3);
}

.settings__pager {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--cp-gap-3);
}

.settings__stats {
  margin: 0 0 var(--cp-gap-4);
  padding-left: 1.2em;
  color: var(--cp-text-2);
  font-size: var(--cp-font-sm);
  line-height: 1.8;
}
</style>
