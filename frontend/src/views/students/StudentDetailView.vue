<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Lock, Unlock, ChatDotRound, Flag, User, CollectionTag, Phone, Plus, EditPen, Delete, Ticket, Male, Female } from '@element-plus/icons-vue';
import VChart from '@/components/VChart.vue';
import type { EChartsOption } from 'echarts';
import {
  CHART_COLORS,
  CHART_STYLE,
  chartTooltip,
} from '@/constants/chart';
import { ApiError } from '@/api/http';
import {
  createGuardianApi,
  deleteGuardianApi,
  deleteSensitiveApi,
  getSensitiveApi,
  getStudentApi,
  listGuardiansApi,
  listSensitiveApi,
  listTagsApi,
  createTagApi,
  replaceStudentTagsApi,
  updateGuardianApi,
  updateStudentApi,
  upsertSensitiveApi,
  listTimelineApi,
  getStudentImpressionApi,
  saveStudentImpressionApi,
  type GuardianDto,
  type SensitiveSummary,
  type StudentDetailDto,
  type TimelineItem,
} from '@/api/students';
import { pinStatusApi, verifyPinApi } from '@/api/auth';
import { getExamMatrixApi, listExamsApi, listTermsApi, type TermDto } from '@/api/scores';
import {
  createCommentApi,
  deleteCommentApi,
  listStudentCommentsApi,
  type CommentType,
  type CommentView,
} from '@/api/comments';
import type { Exam, ExamScoreRow, Subject, SubjectScoreCell, Tag } from '@/types';

/** 最近一次考试成绩汇总 */
interface LatestExamScores {
  exam: Exam;
  subjects: Subject[];
  scores: Record<number, SubjectScoreCell>;
  totalScore: number | null;
  totalRank: number | null;
  classAvgs: Record<number, number>;
}

/** 监护人表单 */
interface GuardianFormModel {
  name: string;
  relation: string;
  phone: string;
  contactPref: string;
  bestTime: string;
  isPrimary: boolean;
}

const route = useRoute();
const router = useRouter();
const studentId = Number(route.params.id);

const loading = ref(false);
const student = ref<StudentDetailDto | null>(null);
const tags = ref<Tag[]>([]);
const guardians = ref<GuardianDto[]>([]);
const focusLevel = ref<number>(0);
/** 考试下拉选项（按考试日期倒序） */
const scoreExamList = ref<Exam[]>([]);
/** 当前选中的考试 ID */
const selectedExamId = ref<number | null>(null);
/** 当前考试下该生成绩汇总 */
const latestExamScores = ref<LatestExamScores | null>(null);
/** 成绩区加载中 */
const scoresLoading = ref(false);

const activeTab = ref('archive');
const pinDialogVisible = ref(false);
const pinInput = ref('');
const pinSubmitting = ref(false);
const sensitiveUnlocked = ref(false);
const sensitiveSummaries = ref<SensitiveSummary[]>([]);
const pendingSensitiveCategory = ref('');
const sensitiveViewVisible = ref(false);
const sensitiveViewCategory = ref('');
const sensitiveViewContent = ref('');
const sensitiveViewSaving = ref(false);
const sensitiveViewLoading = ref(false);

const timelineItems = ref<TimelineItem[]>([]);
const timelineLoading = ref(false);
const timelineKind = ref('all');
const timelineKeyword = ref('');

const comments = ref<CommentView[]>([]);
const commentsLoading = ref(false);
const commentDialogVisible = ref(false);
const commentSubmitting = ref(false);
const commentTerms = ref<TermDto[]>([]);
const commentForm = ref({
  termId: undefined as number | undefined,
  commentType: '期末评语' as CommentType,
  finalText: '',
});

/** 班主任印象草稿与保存状态 */
const impressionContent = ref('');
const impressionSavedContent = ref('');
const impressionUpdatedAt = ref<string | null>(null);
const impressionLoading = ref(false);
const impressionSaving = ref(false);
const impressionLoaded = ref(false);

const guardianDialogVisible = ref(false);
const guardianSubmitting = ref(false);
const editingGuardianId = ref<number | null>(null);
const guardianForm = ref<GuardianFormModel>(emptyGuardianForm());

const tagDialogVisible = ref(false);
const tagSubmitting = ref(false);
/** 选中的标签 id；输入新建时短暂可为字符串名 */
const tagSelectedIds = ref<Array<number | string>>([]);

/** 关注等级选项 */
const focusLevelOptions = [
  { value: 0, label: '普通' },
  { value: 1, label: '关注' },
  { value: 2, label: '重点' },
  { value: 3, label: '最高' },
];

/** 高敏类别 */
const sensitiveCategories = ['健康', '心理', '家庭', '其他'];

/** 创建空监护人表单 */
function emptyGuardianForm(): GuardianFormModel {
  return {
    name: '',
    relation: '',
    phone: '',
    contactPref: '',
    bestTime: '',
    isPrimary: false,
  };
}

/** 按敏感级别过滤可见标签（档案页仅展示 L0） */
function getVisibleTags(tagIds: number[]): Tag[] {
  const idSet = new Set(tagIds);
  return tags.value.filter(
    (tag) => idSet.has(tag.id) && tag.sensitiveLevel === 0,
  );
}

/** 花名册可分配的标签（仅 L0 非敏感标签） */
const selectableTags = computed(() =>
  tags.value.filter((tag) => tag.sensitiveLevel === 0),
);

/** 标签按业务域分组，供多选下拉使用 */
const tagOptionGroups = computed(() => {
  const map = new Map<string, Tag[]>();
  for (const tag of selectableTags.value) {
    const list = map.get(tag.domain) ?? [];
    list.push(tag);
    map.set(tag.domain, list);
  }
  return [...map.entries()].map(([domain, domainTags]) => ({
    domain,
    tags: domainTags,
  }));
});

/** 脱敏手机号展示 */
function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  if (phone.length < 7) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

/** 组装监护人元信息文案 */
function guardianMetaText(guardian: GuardianDto): string {
  const parts: string[] = [];
  parts.push(maskPhone(guardian.phone));
  if (guardian.contactPref) {
    parts.push(`偏好：${guardian.contactPref}`);
  }
  if (guardian.bestTime) {
    parts.push(`最佳时段：${guardian.bestTime}`);
  }
  return parts.join(' · ');
}

/** 打开 PIN 解锁对话框 */
function openPinDialog(category: string): void {
  pendingSensitiveCategory.value = category;
  pinInput.value = '';
  pinDialogVisible.value = true;
}

/** 点击高敏卡片 */
async function handleSensitiveCardClick(category: string): Promise<void> {
  try {
    const status = await pinStatusApi();
    if (!status.hasPin) {
      ElMessage.warning('请先在系统设置中设置 PIN');
      await router.push('/settings');
      return;
    }
    if (status.unlocked) {
      sensitiveUnlocked.value = true;
      await openSensitiveView(category);
      return;
    }
    openPinDialog(category);
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '无法检查 PIN 状态');
  }
}

/** 提交 PIN 解锁 */
async function handlePinUnlock(): Promise<void> {
  if (!/^\d{6}$/.test(pinInput.value)) {
    ElMessage.warning('请输入 6 位数字 PIN');
    return;
  }
  pinSubmitting.value = true;
  try {
    await verifyPinApi(pinInput.value);
    sensitiveUnlocked.value = true;
    pinDialogVisible.value = false;
    ElMessage.success('已解锁，10 分钟内有效');
    if (pendingSensitiveCategory.value) {
      await openSensitiveView(pendingSensitiveCategory.value);
    }
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : 'PIN 校验失败');
  } finally {
    pinSubmitting.value = false;
  }
}

/** 打开并加载高敏内容编辑窗 */
async function openSensitiveView(category: string): Promise<void> {
  sensitiveViewCategory.value = category;
  sensitiveViewVisible.value = true;
  sensitiveViewLoading.value = true;
  sensitiveViewContent.value = '';
  try {
    const data = await getSensitiveApi(studentId, category);
    sensitiveViewContent.value = data.content;
  } catch (err: unknown) {
    if (err instanceof ApiError && err.code === 2004) {
      sensitiveUnlocked.value = false;
      sensitiveViewVisible.value = false;
      openPinDialog(category);
      return;
    }
    ElMessage.error(err instanceof ApiError ? err.message : '读取高敏失败');
  } finally {
    sensitiveViewLoading.value = false;
  }
}

/** 保存高敏内容 */
async function saveSensitiveContent(): Promise<void> {
  if (!sensitiveViewContent.value.trim()) {
    ElMessage.warning('内容不能为空');
    return;
  }
  sensitiveViewSaving.value = true;
  try {
    await upsertSensitiveApi(
      studentId,
      sensitiveViewCategory.value,
      sensitiveViewContent.value.trim(),
    );
    ElMessage.success('已保存');
    await loadSensitiveSummaries();
  } catch (err: unknown) {
    if (err instanceof ApiError && err.code === 2004) {
      sensitiveUnlocked.value = false;
      openPinDialog(sensitiveViewCategory.value);
      return;
    }
    ElMessage.error(err instanceof ApiError ? err.message : '保存失败');
  } finally {
    sensitiveViewSaving.value = false;
  }
}

/** 清空一类高敏 */
async function clearSensitiveContent(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定清空「${sensitiveViewCategory.value}」高敏内容？`,
      '清空确认',
      { type: 'warning', confirmButtonText: '清空', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  try {
    await deleteSensitiveApi(studentId, sensitiveViewCategory.value);
    sensitiveViewContent.value = '';
    ElMessage.success('已清空');
    await loadSensitiveSummaries();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '清空失败');
  }
}

/** 加载高敏摘要卡片 */
async function loadSensitiveSummaries(): Promise<void> {
  try {
    sensitiveSummaries.value = await listSensitiveApi(studentId);
  } catch {
    sensitiveSummaries.value = sensitiveCategories.map((category) => ({
      category,
      hasContent: false,
      updatedAt: null,
    }));
  }
}

/** 摘要是否有内容 */
function sensitiveHasContent(category: string): boolean {
  return sensitiveSummaries.value.some((s) => s.category === category && s.hasContent);
}

/** 时间线类型标签 */
function timelineKindLabel(item: TimelineItem): string {
  if (item.domain === 'contact') return '家校沟通';
  if (item.domain === 'praise') return '表扬';
  if (item.kind === 'score') return '成绩';
  if (item.kind === 'comment') return '评语';
  return item.category || '事件';
}

/** 格式化时间线日期 */
function formatTimelineDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/** 加载成长时间线 */
async function loadTimeline(): Promise<void> {
  timelineLoading.value = true;
  try {
    timelineItems.value = await listTimelineApi(studentId, {
      kind: timelineKind.value === 'all' ? undefined : timelineKind.value,
      q: timelineKeyword.value.trim() || undefined,
    });
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载时间线失败');
  } finally {
    timelineLoading.value = false;
  }
}

/** 加载评语列表 */
async function loadComments(): Promise<void> {
  commentsLoading.value = true;
  try {
    comments.value = await listStudentCommentsApi(studentId);
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载评语失败');
  } finally {
    commentsLoading.value = false;
  }
}

/** 打开手工新建评语 */
async function openCommentDialog(): Promise<void> {
  if (commentTerms.value.length === 0) {
    try {
      commentTerms.value = await listTermsApi();
    } catch {
      commentTerms.value = [];
    }
  }
  commentForm.value = {
    termId: commentTerms.value[0]?.id,
    commentType: '期末评语',
    finalText: '',
  };
  commentDialogVisible.value = true;
}

/** 提交手工评语 */
async function submitComment(): Promise<void> {
  const text = commentForm.value.finalText.trim();
  if (!text) {
    ElMessage.warning('请填写评语内容');
    return;
  }
  commentSubmitting.value = true;
  try {
    await createCommentApi({
      studentId,
      termId: commentForm.value.termId,
      commentType: commentForm.value.commentType,
      finalText: text,
    });
    ElMessage.success('评语已保存');
    commentDialogVisible.value = false;
    await loadComments();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '保存失败');
  } finally {
    commentSubmitting.value = false;
  }
}

/** 删除评语 */
async function handleDeleteComment(item: CommentView): Promise<void> {
  try {
    await ElMessageBox.confirm('确认软删除该条评语？', '删除确认', { type: 'warning' });
  } catch {
    return;
  }
  try {
    await deleteCommentApi(item.id);
    ElMessage.success('已删除');
    await loadComments();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '删除失败');
  }
}

/** 跳转评语工作台并选中本生 */
function goCommentWorkbench(): void {
  router.push({ path: '/ai/comments', query: { studentId: String(studentId) } });
}

/** 跳转学情问答并锁定本生 */
function goDataAsk(): void {
  router.push({ path: '/ai/ask', query: { studentId: String(studentId) } });
}

/** 格式化评语时间 */
function formatCommentDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleString('zh-CN');
}

/** 印象是否有未保存修改 */
const impressionDirty = computed(
  () => impressionContent.value !== impressionSavedContent.value,
);

/** 格式化印象更新时间 */
function formatImpressionUpdatedAt(iso: string | null): string {
  if (!iso) return '尚未保存';
  return `上次保存：${new Date(iso).toLocaleString('zh-CN')}`;
}

/** 加载班主任印象 */
async function loadImpression(): Promise<void> {
  impressionLoading.value = true;
  try {
    const data = await getStudentImpressionApi(studentId);
    impressionContent.value = data.content;
    impressionSavedContent.value = data.content;
    impressionUpdatedAt.value = data.updatedAt;
    impressionLoaded.value = true;
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载印象失败');
  } finally {
    impressionLoading.value = false;
  }
}

/** 保存班主任印象 */
async function saveImpression(): Promise<void> {
  impressionSaving.value = true;
  try {
    const data = await saveStudentImpressionApi(studentId, impressionContent.value);
    impressionContent.value = data.content;
    impressionSavedContent.value = data.content;
    impressionUpdatedAt.value = data.updatedAt;
    ElMessage.success('印象已保存');
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '保存印象失败');
  } finally {
    impressionSaving.value = false;
  }
}

/** 格式化单科展示 */
function formatSubjectCell(subject: {
  subjectName: string;
  score: number | null;
  status: string;
  classRank: number | null;
}): string {
  if (subject.status === '缺考') return '缺';
  if (subject.status === '免考') return '免';
  if (subject.score === null) return '—';
  return String(subject.score);
}

/** 渲染单科成绩 */
function formatSubjectScore(cell: SubjectScoreCell | undefined): string {
  if (!cell || cell.status === 'empty') return '—';
  if (cell.status === 'absent') return '缺';
  if (cell.status === 'exempt') return '免';
  return cell.score !== null ? String(cell.score) : '—';
}

/** 判断是否低分（< 满分 40%） */
function isLowScore(cell: SubjectScoreCell | undefined, fullScore: number): boolean {
  if (!cell || cell.status !== 'normal' || cell.score === null) return false;
  return cell.score < fullScore * 0.4;
}

/** 计算科目班均分 */
function calcClassAvgs(
  subjects: Subject[],
  rows: Array<{ subjectScores: Record<number, SubjectScoreCell> }>,
): Record<number, number> {
  const result: Record<number, number> = {};
  for (const subject of subjects) {
    const nums: number[] = [];
    for (const row of rows) {
      const cell = row.subjectScores[subject.id];
      if (cell && cell.status === 'normal' && cell.score !== null) {
        nums.push(cell.score);
      }
    }
    result[subject.id] =
      nums.length > 0 ? nums.reduce((sum, n) => sum + n, 0) / nums.length : 0;
  }
  return result;
}

/** 汇总单行各科正常分总分 */
function sumRowTotalScore(
  subjects: Subject[],
  scores: Record<number, SubjectScoreCell>,
): number | null {
  let total = 0;
  let hasNormal = false;
  for (const subject of subjects) {
    const cell = scores[subject.id];
    if (cell && cell.status === 'normal' && cell.score !== null) {
      total += cell.score;
      hasNormal = true;
    }
  }
  if (!hasNormal) return null;
  return Math.round(total * 100) / 100;
}

/** 竞赛式排名（并列同名次，下一名跳过空位） */
function assignCompetitionRanksLocal(
  items: Array<{ id: number; score: number }>,
): Map<number, number> {
  const sorted = [...items].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id - b.id;
  });
  const ranks = new Map<number, number>();
  let index = 0;
  while (index < sorted.length) {
    const rank = index + 1;
    const score = sorted[index]!.score;
    let end = index;
    while (end < sorted.length && sorted[end]!.score === score) {
      ranks.set(sorted[end]!.id, rank);
      end += 1;
    }
    index = end;
  }
  return ranks;
}

/** 根据矩阵各科成绩重算该生总分与班排（避免依赖接口聚合字段展示异常） */
function resolveStudentTotalAndRank(
  subjects: Subject[],
  rows: ExamScoreRow[],
  targetStudentId: number,
): {
  scores: Record<number, SubjectScoreCell>;
  totalScore: number | null;
  totalRank: number | null;
} {
  const withTotals = rows.map((row) => ({
    studentId: row.studentId,
    scores: row.subjectScores,
    totalScore: sumRowTotalScore(subjects, row.subjectScores),
  }));
  const eligible = withTotals
    .filter((row) => row.totalScore !== null)
    .map((row) => ({ id: row.studentId, score: row.totalScore as number }));
  const rankMap = assignCompetitionRanksLocal(eligible);
  const mine = withTotals.find((row) => row.studentId === targetStudentId);
  if (!mine) {
    return {
      scores: buildEmptySubjectScores(subjects),
      totalScore: null,
      totalRank: null,
    };
  }
  return {
    scores: mine.scores,
    totalScore: mine.totalScore,
    totalRank:
      mine.totalScore !== null ? (rankMap.get(targetStudentId) ?? null) : null,
  };
}

/** 总分/班排展示文案（显式区分无数据，避免误显示 0） */
function formatScoreStat(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  return String(value);
}

/** 班级平均分展示（保留一位小数；无数据为 —） */
function formatClassAvg(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value) || value <= 0) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** 加载标签字典 */
async function loadTags(): Promise<void> {
  try {
    tags.value = await listTagsApi();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载标签失败');
  }
}

/** 同步监护人列表（优先详情内嵌，否则单独拉取） */
async function syncGuardians(detail: StudentDetailDto): Promise<void> {
  if (Array.isArray(detail.guardians)) {
    guardians.value = detail.guardians;
    return;
  }
  try {
    guardians.value = await listGuardiansApi(studentId);
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载监护人失败');
  }
}

/** 按考试日期倒序排列考试列表 */
function sortExamsByDateDesc(exams: Exam[]): Exam[] {
  return [...exams].sort((a, b) =>
    (b.examDate || '').localeCompare(a.examDate || ''),
  );
}

/** 构造空科目成绩映射 */
function buildEmptySubjectScores(
  subjects: Subject[],
): Record<number, SubjectScoreCell> {
  const scores: Record<number, SubjectScoreCell> = {};
  for (const subject of subjects) {
    scores[subject.id] = { score: null, status: 'empty', classRank: null };
  }
  return scores;
}

/** 加载指定考试下该生的成绩、总分与班均 */
async function loadExamScores(examId: number): Promise<void> {
  scoresLoading.value = true;
  try {
    const exam = scoreExamList.value.find((item) => item.id === examId);
    if (!exam) {
      latestExamScores.value = null;
      return;
    }
    const matrix = await getExamMatrixApi(examId);
    const resolved = resolveStudentTotalAndRank(
      matrix.subjects,
      matrix.rows,
      studentId,
    );
    latestExamScores.value = {
      exam,
      subjects: matrix.subjects,
      scores: resolved.scores,
      totalScore: resolved.totalScore,
      totalRank: resolved.totalRank,
      classAvgs: calcClassAvgs(matrix.subjects, matrix.rows),
    };
  } catch (err: unknown) {
    latestExamScores.value = null;
    ElMessage.error(err instanceof ApiError ? err.message : '加载成绩失败');
  } finally {
    scoresLoading.value = false;
  }
}

/** 切换考试时同步刷新下方成绩数据 */
async function onScoreExamChange(examId: number): Promise<void> {
  selectedExamId.value = examId;
  await loadExamScores(examId);
}

/** 加载考试列表并默认选中最近一场 */
async function loadScoreExams(): Promise<void> {
  try {
    const exams = sortExamsByDateDesc(await listExamsApi());
    scoreExamList.value = exams;
    if (exams.length === 0) {
      selectedExamId.value = null;
      latestExamScores.value = null;
      return;
    }
    const prefer = selectedExamId.value;
    const keepCurrent =
      prefer !== null && exams.some((exam) => exam.id === prefer);
    const nextId = keepCurrent ? prefer : exams[0]!.id;
    selectedExamId.value = nextId;
    await loadExamScores(nextId);
  } catch (err: unknown) {
    scoreExamList.value = [];
    selectedExamId.value = null;
    latestExamScores.value = null;
    ElMessage.error(err instanceof ApiError ? err.message : '加载成绩失败');
  }
}

/** 加载学生详情与附属数据 */
async function loadDetail(): Promise<void> {
  loading.value = true;
  try {
    const detail = await getStudentApi(studentId);
    student.value = detail;
    focusLevel.value = detail.focusLevel;
    await Promise.all([syncGuardians(detail), loadScoreExams()]);
  } catch (err: unknown) {
    student.value = null;
    ElMessage.error(err instanceof ApiError ? err.message : '加载学生详情失败');
  } finally {
    loading.value = false;
  }
}

/** 更新关注等级 */
async function handleFocusLevelChange(level: number): Promise<void> {
  const previous = student.value?.focusLevel ?? 0;
  try {
    await updateStudentApi(studentId, { focusLevel: level });
    if (student.value) {
      student.value.focusLevel = level as 0 | 1 | 2 | 3;
    }
    ElMessage.success('关注等级已更新');
  } catch (err: unknown) {
    focusLevel.value = previous;
    ElMessage.error(err instanceof ApiError ? err.message : '更新关注等级失败');
  }
}

/** 打开编辑标签对话框 */
function openTagDialog(): void {
  if (!student.value) return;
  const allowedIds = new Set(selectableTags.value.map((tag) => tag.id));
  tagSelectedIds.value = student.value.tagIds.filter((id) => allowedIds.has(id));
  tagDialogVisible.value = true;
}

/**
 * 解析标签选择：数字为已有标签；字符串为新建名（回车创建后归入「其他」域）。
 */
async function resolveTagSelection(
  values: Array<number | string>,
): Promise<number[]> {
  const nextIds: number[] = [];
  for (const value of values) {
    if (typeof value === 'number') {
      nextIds.push(value);
      continue;
    }
    const name = String(value).trim();
    if (!name) continue;
    const existing = selectableTags.value.find((tag) => tag.name === name);
    if (existing) {
      nextIds.push(existing.id);
      continue;
    }
    const created = await createTagApi({ name, domain: '其他' });
    tags.value.push(created);
    nextIds.push(created.id);
  }
  return [...new Set(nextIds)];
}

/** 标签多选变更（支持输入新标签名后创建） */
async function onTagSelectionChange(
  values: Array<number | string>,
): Promise<void> {
  try {
    tagSelectedIds.value = await resolveTagSelection(values);
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '创建标签失败');
    if (student.value) {
      const allowedIds = new Set(selectableTags.value.map((tag) => tag.id));
      tagSelectedIds.value = student.value.tagIds.filter((id) =>
        allowedIds.has(id),
      );
    }
  }
}

/** 保存学生标签 */
async function submitTags(): Promise<void> {
  tagSubmitting.value = true;
  try {
    const tagIds = await resolveTagSelection(tagSelectedIds.value);
    tagSelectedIds.value = tagIds;
    const updated = await replaceStudentTagsApi(studentId, tagIds);
    if (student.value) {
      student.value.tagIds = updated.tagIds;
    }
    ElMessage.success('标签已更新');
    tagDialogVisible.value = false;
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '更新标签失败');
  } finally {
    tagSubmitting.value = false;
  }
}

/** 打开新建监护人对话框 */
function openCreateGuardian(): void {
  editingGuardianId.value = null;
  guardianForm.value = emptyGuardianForm();
  guardianDialogVisible.value = true;
}

/** 打开编辑监护人对话框 */
function openEditGuardian(guardian: GuardianDto): void {
  editingGuardianId.value = guardian.id;
  guardianForm.value = {
    name: guardian.name ?? '',
    relation: guardian.relation ?? '',
    phone: guardian.phone ?? '',
    contactPref: guardian.contactPref ?? '',
    bestTime: guardian.bestTime ?? '',
    isPrimary: guardian.isPrimary,
  };
  guardianDialogVisible.value = true;
}

/** 提交监护人新建/编辑 */
async function submitGuardian(): Promise<void> {
  const form = guardianForm.value;
  if (!form.name.trim()) {
    ElMessage.warning('请填写监护人姓名');
    return;
  }
  const body: Record<string, unknown> = {
    name: form.name.trim(),
    relation: form.relation.trim() || undefined,
    phone: form.phone.trim() || undefined,
    contactPref: form.contactPref.trim() || undefined,
    bestTime: form.bestTime.trim() || undefined,
    isPrimary: form.isPrimary ? 1 : 0,
  };
  guardianSubmitting.value = true;
  try {
    if (editingGuardianId.value === null) {
      await createGuardianApi(studentId, body);
      ElMessage.success('监护人已添加');
    } else {
      await updateGuardianApi(editingGuardianId.value, body);
      ElMessage.success('监护人已更新');
    }
    guardianDialogVisible.value = false;
    guardians.value = await listGuardiansApi(studentId);
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '保存监护人失败');
  } finally {
    guardianSubmitting.value = false;
  }
}

/** 删除监护人 */
async function handleDeleteGuardian(guardian: GuardianDto): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除监护人「${guardian.name ?? '未命名'}」吗？`,
      '删除确认',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await deleteGuardianApi(guardian.id);
    ElMessage.success('监护人已删除');
    guardians.value = await listGuardiansApi(studentId);
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '删除监护人失败');
  }
}

/** 雷达图配置（该生 vs 班均 · 软几何） */
const radarOption = computed<EChartsOption>(() => {
  const data = latestExamScores.value;
  if (!data || data.subjects.length === 0) {
    return {};
  }
  const studentValues = data.subjects.map((subject) => {
    const cell = data.scores[subject.id];
    if (cell && cell.status === 'normal' && cell.score !== null) {
      return cell.score;
    }
    return 0;
  });
  const classValues = data.subjects.map(
    (subject) => data.classAvgs[subject.id] ?? 0,
  );
  const primary = CHART_COLORS[0];
  const secondary = CHART_COLORS[1];
  return {
    color: [primary, secondary],
    animationDuration: CHART_STYLE.animationDuration,
    tooltip: chartTooltip({
      trigger: 'item',
      appendToBody: true,
      confine: false,
      textStyle: { color: CHART_STYLE.text, fontSize: 13 },
      extraCssText:
        'box-shadow: 0 14px 36px rgba(91, 156, 255, 0.16); border-radius: 12px; z-index: 4000;',
      /** 数值统一保留两位小数 */
      formatter: (params: unknown) => {
        const p = params as {
          name?: string;
          value?: number[];
          marker?: string;
          color?: string;
        };
        const values = Array.isArray(p.value) ? p.value : [];
        const subjects = data.subjects;
        const lines = subjects.map((subject, index) => {
          const raw = values[index];
          const num = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
          return `${p.marker ?? ''}${subject.name}：${num.toFixed(2)}`;
        });
        return `${p.name ?? ''}<br/>${lines.join('<br/>')}`;
      },
    }),
    legend: {
      bottom: 8,
      itemWidth: 12,
      itemHeight: 12,
      icon: 'roundRect',
      textStyle: { fontSize: 14, color: CHART_STYLE.muted },
    },
    radar: {
      center: ['50%', '48%'],
      radius: '62%',
      indicator: data.subjects.map((subject) => ({
        name: subject.name,
        max: subject.fullScore,
      })),
      axisName: {
        fontSize: 13,
        color: primary,
        fontWeight: 600,
        padding: [3, 4],
      },
      axisLine: {
        lineStyle: { color: 'rgba(91, 156, 255, 0.35)', width: 1 },
      },
      splitLine: {
        lineStyle: { color: 'rgba(147, 197, 253, 0.55)', width: 1 },
      },
      splitArea: {
        show: true,
        areaStyle: {
          color: [
            'rgba(219, 234, 254, 0.55)',
            'rgba(255, 255, 255, 0.35)',
            'rgba(191, 219, 254, 0.45)',
            'rgba(255, 255, 255, 0.25)',
          ],
        },
      },
    },
    series: [
      {
        type: 'radar',
        symbol: 'circle',
        symbolSize: 6,
        data: [
          {
            value: studentValues,
            name: '该生',
            lineStyle: { color: primary, width: 2.5 },
            itemStyle: {
              color: primary,
              borderColor: '#FFFFFF',
              borderWidth: 2,
              shadowBlur: 8,
              shadowColor: CHART_STYLE.shadowColor,
            },
            areaStyle: { color: 'rgba(91, 156, 255, 0.28)' },
          },
          {
            value: classValues,
            name: '班均',
            lineStyle: { color: secondary, width: 2, type: 'dashed' },
            itemStyle: {
              color: secondary,
              borderColor: '#FFFFFF',
              borderWidth: 2,
            },
            areaStyle: { color: 'rgba(61, 207, 154, 0.12)' },
          },
        ],
      },
    ],
  };
});

onMounted(() => {
  void loadTags();
  void loadDetail();
  void loadSensitiveSummaries();
  void loadTimeline();
  void loadComments();
  void pinStatusApi()
    .then((s) => {
      sensitiveUnlocked.value = s.unlocked;
    })
    .catch(() => {
      // 忽略
    });
});

watch(activeTab, (tab) => {
  if (tab === 'comments' && comments.value.length === 0) {
    void loadComments();
  }
  if (tab === 'impression' && !impressionLoaded.value) {
    void loadImpression();
  }
});
</script>

<template>
  <div v-loading="loading" class="student-detail cp-animate-in">
    <template v-if="student">
      <!-- 头部信息条 -->
      <el-card shadow="never" class="student-detail__header">
        <div class="student-detail__header-inner">
          <el-avatar :size="72" shape="square" class="student-detail__photo">
            {{ student.name.charAt(0) }}
          </el-avatar>
          <div class="student-detail__info">
            <div class="student-detail__name-row">
              <h2 class="student-detail__name">{{ student.name }}</h2>
              <span class="student-detail__no cp-tabular-nums">
                <el-icon class="student-detail__no-icon"><Ticket /></el-icon>
                {{ student.studentNo }}
              </span>
              <el-tag v-if="student.cadreRole" type="primary" effect="dark" size="default">
                {{ student.cadreRole }}
              </el-tag>
            </div>
            <el-space :size="8" wrap class="student-detail__meta">
              <el-tag effect="plain" class="student-detail__meta-tag">
                <el-icon>
                  <Male v-if="student.gender === 1" />
                  <Female v-else />
                </el-icon>
                {{ student.gender === 1 ? '男' : '女' }}
              </el-tag>
              <el-tag type="success" effect="plain" class="student-detail__meta-tag">
                {{ student.status }}
              </el-tag>
            </el-space>
          </div>
          <div class="student-detail__focus">
            <el-button type="primary" plain @click="goDataAsk">
              <el-icon><ChatDotRound /></el-icon>
              问该生学情
            </el-button>
            <div class="student-detail__focus-block">
              <span class="student-detail__focus-label">
                <el-icon><Flag /></el-icon>
                关注等级
              </span>
              <el-select
                v-model="focusLevel"
                style="width: 120px"
                @change="handleFocusLevelChange"
              >
                <el-option
                  v-for="opt in focusLevelOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </div>
          </div>
        </div>
      </el-card>

      <!-- Tab 白卡区 -->
      <el-card shadow="never" class="student-detail__tabs">
        <el-tabs v-model="activeTab">
          <!-- Tab1 档案 -->
          <el-tab-pane label="档案" name="archive">
            <transition name="cp-fade" mode="out-in">
              <div v-if="activeTab === 'archive'" class="archive-grid">
                <el-card shadow="never" class="archive-block">
                  <template #header>
                    <div class="archive-block__heading">
                      <el-icon class="archive-block__icon"><User /></el-icon>
                      <span class="archive-block__title">基本信息</span>
                    </div>
                  </template>
                  <div class="archive-info-grid">
                    <div class="archive-info-item">
                      <span class="archive-info-item__label">
                        <el-icon><Ticket /></el-icon>
                        学号
                      </span>
                      <span class="archive-info-item__value cp-tabular-nums">{{
                        student.studentNo
                      }}</span>
                    </div>
                    <div class="archive-info-item">
                      <span class="archive-info-item__label">
                        <el-icon>
                          <Male v-if="student.gender === 1" />
                          <Female v-else />
                        </el-icon>
                        性别
                      </span>
                      <span class="archive-info-item__value">{{
                        student.gender === 1 ? '男' : '女'
                      }}</span>
                    </div>
                    <div class="archive-info-item">
                      <span class="archive-info-item__label">
                        <el-icon><Flag /></el-icon>
                        班干部
                      </span>
                      <span class="archive-info-item__value">{{
                        student.cadreRole ?? '—'
                      }}</span>
                    </div>
                    <div class="archive-info-item">
                      <span class="archive-info-item__label">
                        <el-icon><User /></el-icon>
                        状态
                      </span>
                      <span class="archive-info-item__value">{{ student.status }}</span>
                    </div>
                  </div>
                </el-card>

                <el-card shadow="never" class="archive-block">
                  <template #header>
                    <div class="archive-block__heading archive-block__heading--spread">
                      <div class="archive-block__heading-main">
                        <el-icon class="archive-block__icon"><CollectionTag /></el-icon>
                        <span class="archive-block__title">标签</span>
                      </div>
                      <el-button text type="primary" @click="openTagDialog">
                        <el-icon><EditPen /></el-icon>
                        编辑标签
                      </el-button>
                    </div>
                  </template>
                  <el-space
                    v-if="getVisibleTags(student.tagIds).length > 0"
                    wrap
                    :size="8"
                  >
                    <el-tag
                      v-for="tag in getVisibleTags(student.tagIds)"
                      :key="tag.id"
                      type="info"
                      effect="plain"
                      size="default"
                    >
                      {{ tag.name }}
                    </el-tag>
                  </el-space>
                  <p v-else class="archive-empty">暂无标签，点击右上角添加</p>
                </el-card>

                <el-card shadow="never" class="archive-block">
                  <template #header>
                    <div class="archive-block__heading archive-block__heading--spread">
                      <div class="archive-block__heading-main">
                        <el-icon class="archive-block__icon"><Phone /></el-icon>
                        <span class="archive-block__title">监护人</span>
                      </div>
                      <el-button type="primary" text @click="openCreateGuardian">
                        <el-icon><Plus /></el-icon>
                        添加监护人
                      </el-button>
                    </div>
                  </template>
                  <el-empty
                    v-if="guardians.length === 0"
                    description="暂无监护人"
                    :image-size="64"
                  />
                  <div v-else class="guardian-list">
                    <div
                      v-for="guardian in guardians"
                      :key="guardian.id"
                      class="guardian-card"
                    >
                      <div class="guardian-card__avatar" aria-hidden="true">
                        {{ (guardian.name ?? '监').charAt(0) }}
                      </div>
                      <div class="guardian-card__body">
                        <div class="guardian-card__row">
                          <span class="guardian-card__name">
                            {{ guardian.name ?? '未命名' }}
                            <template v-if="guardian.relation"
                              >（{{ guardian.relation }}）</template
                            >
                          </span>
                          <el-tag
                            v-if="guardian.isPrimary"
                            type="primary"
                            effect="plain"
                            size="small"
                          >
                            主联系人
                          </el-tag>
                        </div>
                        <p class="guardian-card__meta">
                          <el-icon><Phone /></el-icon>
                          {{ guardianMetaText(guardian) }}
                        </p>
                      </div>
                      <el-space :size="4" class="guardian-card__actions">
                        <el-button
                          text
                          type="primary"
                          @click="openEditGuardian(guardian)"
                        >
                          <el-icon><EditPen /></el-icon>
                          编辑
                        </el-button>
                        <el-button
                          text
                          type="danger"
                          @click="handleDeleteGuardian(guardian)"
                        >
                          <el-icon><Delete /></el-icon>
                          删除
                        </el-button>
                      </el-space>
                    </div>
                  </div>
                </el-card>
              </div>
            </transition>
          </el-tab-pane>

          <!-- Tab2 高敏 -->
          <el-tab-pane label="高敏" name="sensitive">
            <div class="sensitive-grid">
              <el-card
                v-for="cat in sensitiveCategories"
                :key="cat"
                shadow="hover"
                class="sensitive-card cp-card--hoverable"
                @click="handleSensitiveCardClick(cat)"
              >
                <div class="sensitive-card__header">
                  <el-icon :size="22" color="var(--cp-warning)">
                    <Unlock v-if="sensitiveUnlocked" />
                    <Lock v-else />
                  </el-icon>
                  <span class="sensitive-card__title">{{ cat }}</span>
                  <el-tag
                    v-if="sensitiveHasContent(cat)"
                    size="small"
                    type="warning"
                    effect="plain"
                  >
                    已录入
                  </el-tag>
                </div>
                <p class="sensitive-card__hint">
                  {{
                    sensitiveUnlocked
                      ? '已解锁，点击查看或编辑'
                      : '点击查看需输入 PIN 码解锁'
                  }}
                </p>
              </el-card>
            </div>
          </el-tab-pane>

          <!-- Tab3 成绩 -->
          <el-tab-pane label="成绩" name="scores" lazy>
            <div
              v-if="scoreExamList.length > 0"
              v-loading="scoresLoading"
              class="scores-section"
            >
              <div class="scores-section__header">
                <el-select
                  v-model="selectedExamId"
                  class="scores-section__exam-select"
                  placeholder="选择考试"
                  @change="onScoreExamChange"
                >
                  <el-option
                    v-for="exam in scoreExamList"
                    :key="exam.id"
                    :label="`${exam.name}（${exam.examDate}）`"
                    :value="exam.id"
                  />
                </el-select>
                <div v-if="latestExamScores" class="scores-section__stats">
                  <div class="scores-section__stat">
                    <span class="scores-section__stat-label">总分</span>
                    <span class="cp-tabular-nums scores-section__stat-value">
                      {{ formatScoreStat(latestExamScores.totalScore) }}
                    </span>
                  </div>
                  <div class="scores-section__stat">
                    <span class="scores-section__stat-label">班排</span>
                    <span class="cp-tabular-nums scores-section__stat-value">
                      {{ formatScoreStat(latestExamScores.totalRank) }}
                    </span>
                  </div>
                </div>
              </div>
              <template v-if="latestExamScores">
                <el-table :data="[latestExamScores.scores]" :stripe="false" class="scores-section__table">
                  <el-table-column
                    v-for="subject in latestExamScores.subjects"
                    :key="subject.id"
                    :label="subject.name"
                    align="center"
                    min-width="90"
                  >
                    <template #header>
                      <div class="scores-section__col-header">
                        <span>{{ subject.name }}</span>
                        <span class="scores-section__col-full cp-tabular-nums">
                          班级平均分：{{ formatClassAvg(latestExamScores.classAvgs[subject.id]) }}
                        </span>
                      </div>
                    </template>
                    <template #default>
                      <span
                        class="cp-tabular-nums scores-section__score"
                        :class="{
                          'scores-section__score--low': isLowScore(latestExamScores.scores[subject.id], subject.fullScore),
                        }"
                      >
                        {{ formatSubjectScore(latestExamScores.scores[subject.id]) }}
                      </span>
                    </template>
                  </el-table-column>
                </el-table>
                <h3 class="scores-section__chart-title">雷达图 vs 班均分</h3>
                <div class="scores-section__chart-panel">
                  <VChart :option="radarOption" height="340px" />
                </div>
              </template>
            </div>
            <el-empty v-else description="暂无成绩数据" />
          </el-tab-pane>

          <!-- Tab4 时间线 -->
          <el-tab-pane label="时间线" name="timeline">
            <div class="timeline-toolbar">
              <el-radio-group v-model="timelineKind" size="small" @change="loadTimeline">
                <el-radio-button value="all">全部</el-radio-button>
                <el-radio-button value="score">成绩</el-radio-button>
                <el-radio-button value="incident">事件</el-radio-button>
                <el-radio-button value="contact">沟通</el-radio-button>
                <el-radio-button value="praise">表扬</el-radio-button>
                <el-radio-button value="comment">评语</el-radio-button>
              </el-radio-group>
              <el-input
                v-model="timelineKeyword"
                clearable
                placeholder="关键词"
                style="width: 200px"
                @keyup.enter="loadTimeline"
                @clear="loadTimeline"
              >
                <template #append>
                  <el-button @click="loadTimeline">搜索</el-button>
                </template>
              </el-input>
            </div>
            <div v-loading="timelineLoading">
              <div v-if="timelineItems.length > 0" class="timeline">
                <div
                  v-for="item in timelineItems"
                  :key="item.id"
                  class="timeline__item"
                >
                  <div class="timeline__axis">
                    <span
                      class="timeline__dot"
                      :class="`timeline__dot--${item.domain}`"
                    />
                  </div>
                  <el-card
                    shadow="never"
                    class="timeline__card"
                    :class="`timeline__card--${item.domain}`"
                  >
                    <div class="timeline__card-header">
                      <span class="timeline__date">{{ formatTimelineDate(item.occurredAt) }}</span>
                      <el-tag size="small" effect="plain">{{ timelineKindLabel(item) }}</el-tag>
                    </div>
                    <h4 class="timeline__title">{{ item.title }}</h4>
                    <template v-if="item.kind === 'score' && item.scoreDetail">
                      <div class="timeline__score-meta">
                        <span class="cp-tabular-nums">
                          总分
                          <strong>{{ item.scoreDetail.totalScore ?? '—' }}</strong>
                        </span>
                        <span class="cp-tabular-nums">
                          班排
                          <strong>
                            {{
                              item.scoreDetail.totalRank !== null
                                ? `第${item.scoreDetail.totalRank}名`
                                : '—'
                            }}
                          </strong>
                        </span>
                      </div>
                      <div class="timeline__score-grid">
                        <div
                          v-for="sub in item.scoreDetail.subjects"
                          :key="sub.subjectId"
                          class="timeline__score-cell"
                        >
                          <span class="timeline__score-name">{{ sub.subjectName }}</span>
                          <span class="timeline__score-value cp-tabular-nums">
                            {{ formatSubjectCell(sub) }}
                          </span>
                          <span
                            v-if="sub.classRank !== null && sub.status === '正常'"
                            class="timeline__score-rank cp-tabular-nums"
                          >
                            第{{ sub.classRank }}名
                          </span>
                          <span v-else class="timeline__score-rank">—</span>
                        </div>
                      </div>
                    </template>
                    <p v-else-if="item.summary" class="timeline__summary">{{ item.summary }}</p>
                  </el-card>
                </div>
              </div>
              <el-empty v-else description="暂无时间线记录" />
            </div>
          </el-tab-pane>

          <!-- Tab5 评语 -->
          <el-tab-pane label="评语" name="comments">
            <div class="comments-tab" v-loading="commentsLoading">
              <div class="comments-tab__actions">
                <el-button type="primary" @click="openCommentDialog">手工新建</el-button>
                <el-button @click="goCommentWorkbench">AI 工作台</el-button>
              </div>
              <div v-if="comments.length > 0" class="comments-tab__list">
                <el-card
                  v-for="item in comments"
                  :key="item.id"
                  shadow="never"
                  class="comments-tab__card"
                >
                  <div class="comments-tab__meta">
                    <el-tag size="small" type="primary" effect="plain">
                      {{ item.commentType || '评语' }}
                    </el-tag>
                    <span class="comments-tab__time">{{ formatCommentDate(item.createdAt) }}</span>
                    <el-tag
                      v-if="item.sourceAiRecordId"
                      size="small"
                      type="info"
                      effect="plain"
                    >
                      来自 AI
                    </el-tag>
                    <div class="comments-tab__spacer" />
                    <el-button link type="danger" @click="handleDeleteComment(item)">
                      删除
                    </el-button>
                  </div>
                  <p class="comments-tab__text">{{ item.finalText }}</p>
                </el-card>
              </div>
              <el-empty v-else description="暂无评语">
                <el-button type="primary" @click="openCommentDialog">新建评语</el-button>
              </el-empty>
            </div>
          </el-tab-pane>

          <!-- Tab6 我的印象 -->
          <el-tab-pane label="我的印象" name="impression" lazy>
            <div class="impression-tab" v-loading="impressionLoading">
              <p class="impression-tab__hint">
                记录你对该生的日常观察，或其他同学/任课教师的看法。保存后会注入学情问答与评语生成等 AI 上下文。
              </p>
              <el-input
                v-model="impressionContent"
                type="textarea"
                :rows="14"
                maxlength="10000"
                show-word-limit
                placeholder="例如：课堂参与积极；同桌反映其近期情绪低落；数学老师认为基础扎实但粗心…"
              />
              <div class="impression-tab__footer">
                <span class="impression-tab__meta">
                  {{ formatImpressionUpdatedAt(impressionUpdatedAt) }}
                  <template v-if="impressionDirty"> · 有未保存修改</template>
                </span>
                <el-button
                  type="primary"
                  :loading="impressionSaving"
                  :disabled="!impressionDirty"
                  @click="saveImpression"
                >
                  保存印象
                </el-button>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </template>
    <el-empty v-else-if="!loading" description="未找到该学生" />

    <!-- 新建评语 -->
    <el-dialog
      v-model="commentDialogVisible"
      title="新建评语"
      width="560px"
      append-to-body
      align-center
    >
      <el-form label-width="88px">
        <el-form-item label="学期">
          <el-select v-model="commentForm.termId" placeholder="选择学期" style="width: 100%">
            <el-option
              v-for="t in commentTerms"
              :key="t.id"
              :label="t.name"
              :value="t.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="commentForm.commentType" style="width: 100%">
            <el-option label="期末评语" value="期末评语" />
            <el-option label="期中评语" value="期中评语" />
            <el-option label="日常评语" value="日常评语" />
          </el-select>
        </el-form-item>
        <el-form-item label="正文" required>
          <el-input
            v-model="commentForm.finalText"
            type="textarea"
            :rows="8"
            placeholder="填写评语正文"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="commentDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="commentSubmitting" @click="submitComment">
          保存
        </el-button>
      </template>
    </el-dialog>

    <!-- PIN 解锁对话框 -->
    <el-dialog
      v-model="pinDialogVisible"
      title="解锁高敏信息"
      width="480px"
      append-to-body
      align-center
      :close-on-click-modal="false"
    >
      <p class="pin-dialog__hint">输入 6 位 PIN，解锁后 10 分钟内可连续查看高敏内容</p>
      <el-input
        v-model="pinInput"
        type="password"
        maxlength="6"
        placeholder="请输入 PIN 码"
        show-password
        size="large"
        style="margin-top: 16px"
        @keyup.enter="handlePinUnlock"
      />
      <template #footer>
        <el-button @click="pinDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="pinSubmitting" @click="handlePinUnlock">
          解锁
        </el-button>
      </template>
    </el-dialog>

    <!-- 高敏内容查看/编辑 -->
    <el-dialog
      v-model="sensitiveViewVisible"
      :title="`高敏 · ${sensitiveViewCategory}`"
      width="560px"
      append-to-body
      align-center
      :close-on-click-modal="false"
    >
      <div v-loading="sensitiveViewLoading">
        <el-input
          v-model="sensitiveViewContent"
          type="textarea"
          :rows="10"
          placeholder="记录健康/心理/家庭等敏感明细（加密存储）"
        />
      </div>
      <template #footer>
        <el-button
          v-if="sensitiveHasContent(sensitiveViewCategory)"
          type="danger"
          text
          @click="clearSensitiveContent"
        >
          清空
        </el-button>
        <el-button @click="sensitiveViewVisible = false">关闭</el-button>
        <el-button type="primary" :loading="sensitiveViewSaving" @click="saveSensitiveContent">
          保存
        </el-button>
      </template>
    </el-dialog>

    <!-- 监护人新建/编辑 -->
    <el-dialog
      v-model="guardianDialogVisible"
      :title="editingGuardianId === null ? '添加监护人' : '编辑监护人'"
      width="480px"
      append-to-body
      align-center
      :close-on-click-modal="false"
    >
      <el-form label-width="96px">
        <el-form-item label="姓名" required>
          <el-input v-model="guardianForm.name" maxlength="64" placeholder="监护人姓名" />
        </el-form-item>
        <el-form-item label="关系">
          <el-input v-model="guardianForm.relation" placeholder="如：父亲 / 母亲" />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="guardianForm.phone" placeholder="联系电话" />
        </el-form-item>
        <el-form-item label="沟通偏好">
          <el-input v-model="guardianForm.contactPref" placeholder="如：微信 / 电话" />
        </el-form-item>
        <el-form-item label="最佳时段">
          <el-input v-model="guardianForm.bestTime" placeholder="如：工作日 18 点后" />
        </el-form-item>
        <el-form-item label="主联系人">
          <el-switch v-model="guardianForm.isPrimary" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="guardianDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="guardianSubmitting" @click="submitGuardian">
          保存
        </el-button>
      </template>
    </el-dialog>

    <!-- 编辑标签 -->
    <el-dialog
      v-model="tagDialogVisible"
      title="编辑标签"
      width="520px"
      append-to-body
      align-center
      :close-on-click-modal="false"
    >
      <el-form label-width="72px">
        <el-form-item label="标签">
          <el-select
            v-model="tagSelectedIds"
            multiple
            filterable
            allow-create
            default-first-option
            :reserve-keyword="false"
            collapse-tags
            collapse-tags-tooltip
            placeholder="选择或输入新标签后回车"
            style="width: 100%"
            @change="onTagSelectionChange"
          >
            <el-option-group
              v-for="group in tagOptionGroups"
              :key="group.domain"
              :label="group.domain"
            >
              <el-option
                v-for="tag in group.tags"
                :key="tag.id"
                :label="tag.name"
                :value="tag.id"
              />
            </el-option-group>
          </el-select>
          <p class="tag-dialog__hint">新标签将归入「其他」域，敏感级别为普通</p>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="tagDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="tagSubmitting" @click="submitTags">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.tag-dialog__hint {
  margin: var(--cp-gap-2) 0 0;
  font-size: var(--cp-font-sm);
  color: var(--cp-text-3);
  line-height: 1.5;
}

.student-detail__header {
  margin-bottom: var(--cp-gap-4);
  border: 1px solid var(--cp-border);
  border-radius: var(--cp-radius-card);
  background:
    linear-gradient(135deg, var(--cp-primary-bg) 0%, transparent 42%),
    var(--cp-bg-card);
}

.student-detail__header-inner {
  display: flex;
  align-items: center;
  gap: var(--cp-gap-5);
}

.student-detail__photo {
  border-radius: var(--cp-radius-card);
  background: linear-gradient(145deg, var(--cp-primary) 0%, var(--cp-primary-active) 100%);
  color: #fff;
  font-size: 28px;
  font-weight: 700;
  flex-shrink: 0;
  box-shadow: var(--cp-shadow-1);
}

.student-detail__info {
  flex: 1;
}

.student-detail__name-row {
  display: flex;
  align-items: center;
  gap: var(--cp-gap-3);
  margin-bottom: var(--cp-gap-2);
}

.student-detail__name {
  margin: 0;
  font-size: var(--cp-font-lg);
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.01em;
}

.student-detail__name-row :deep(.el-tag) {
  flex-shrink: 0;
}

.student-detail__no {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--cp-font-base);
  color: var(--cp-text-2);
}

.student-detail__no-icon {
  font-size: 14px;
  color: var(--cp-primary);
}

.student-detail__meta-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.student-detail__focus {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  gap: var(--cp-gap-3);
}

.student-detail__focus-block {
  display: flex;
  flex-direction: column;
  gap: var(--cp-gap-2);
  align-items: flex-end;
}

.student-detail__focus-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--cp-font-sm);
  font-weight: 500;
  color: var(--cp-text-2);
}

.student-detail__tabs {
  border: 1px solid var(--cp-border);
  border-radius: var(--cp-radius-card);
}

.student-detail__tabs :deep(.el-tabs__item) {
  font-size: var(--cp-font-base);
  font-weight: 500;
}

.student-detail__tabs :deep(.el-tabs__item.is-active) {
  font-weight: 600;
  color: var(--cp-primary);
}

.archive-grid {
  display: flex;
  flex-direction: column;
  gap: var(--cp-gap-4);
}

.archive-block {
  border: 1px solid var(--cp-divider);
  border-radius: var(--cp-radius-card);
}

.archive-block :deep(.el-card__header) {
  padding: var(--cp-gap-3) var(--cp-gap-4);
  border-bottom: 1px solid var(--cp-divider);
  background: var(--cp-bg-page);
}

.archive-block__heading {
  display: flex;
  align-items: center;
  gap: var(--cp-gap-2);
}

.archive-block__heading--spread {
  justify-content: space-between;
}

.archive-block__heading-main {
  display: inline-flex;
  align-items: center;
  gap: var(--cp-gap-2);
}

.archive-block__icon {
  font-size: 18px;
  color: var(--cp-primary);
}

.archive-block__title {
  font-size: var(--cp-font-base);
  font-weight: 600;
  color: var(--cp-text-1);
}

.archive-info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cp-gap-3);
}

.archive-info-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--cp-gap-3);
  border-radius: var(--cp-radius-ctl);
  background: var(--cp-bg-page);
  border: 1px solid var(--cp-divider);
}

.archive-info-item__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--cp-font-sm);
  color: var(--cp-text-3);
}

.archive-info-item__value {
  font-size: var(--cp-font-base);
  font-weight: 600;
  color: var(--cp-text-1);
  line-height: 1.35;
}

.archive-empty {
  margin: 0;
  font-size: var(--cp-font-sm);
  color: var(--cp-text-3);
  line-height: 1.6;
}

.guardian-list {
  display: flex;
  flex-direction: column;
  gap: var(--cp-gap-3);
}

.guardian-card {
  display: flex;
  align-items: center;
  gap: var(--cp-gap-3);
  padding: var(--cp-gap-3);
  border: 1px solid var(--cp-divider);
  border-radius: var(--cp-radius-card);
  background: var(--cp-bg-card);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.guardian-card:hover {
  border-color: var(--cp-primary-border);
  box-shadow: var(--cp-shadow-1);
}

.guardian-card__avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--cp-primary-bg);
  color: var(--cp-primary);
  font-weight: 700;
  font-size: var(--cp-font-base);
}

.guardian-card__body {
  flex: 1;
  min-width: 0;
}

.guardian-card__row {
  display: flex;
  align-items: center;
  gap: var(--cp-gap-2);
  margin-bottom: 4px;
}

.guardian-card__actions {
  flex-shrink: 0;
}

.guardian-card__name {
  font-size: var(--cp-font-base);
  font-weight: 600;
}

.guardian-card__meta {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--cp-font-sm);
  color: var(--cp-text-2);
  line-height: 1.6;
}

.sensitive-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--cp-gap-4);
}

.sensitive-card {
  cursor: pointer;
  border: 1px solid var(--cp-border);
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.sensitive-card:hover {
  border-color: var(--cp-warning);
  transform: translateY(-2px);
}

.sensitive-card__header {
  display: flex;
  align-items: center;
  gap: var(--cp-gap-2);
  margin-bottom: var(--cp-gap-2);
}

.sensitive-card__title {
  font-size: var(--cp-font-base);
  font-weight: 600;
}

.sensitive-card__hint {
  margin: 0;
  font-size: var(--cp-font-sm);
  color: var(--cp-text-3);
}

.scores-section__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--cp-gap-4);
  margin-bottom: var(--cp-gap-4);
}

.scores-section__exam-select {
  width: 280px;
}

.scores-section__stats {
  display: flex;
  align-items: flex-end;
  gap: var(--cp-gap-5);
}

.scores-section__stat {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  min-width: 56px;
}

.scores-section__stat-label {
  font-size: var(--cp-font-xs);
  color: var(--cp-text-3);
  line-height: 1.2;
}

.scores-section__stat-value {
  font-size: var(--cp-font-lg);
  font-weight: 600;
  color: var(--cp-text-1);
  line-height: 1.2;
}

.scores-section__table {
  margin-bottom: var(--cp-gap-5);
}

.scores-section__col-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.4;
  font-size: var(--cp-font-base);
}

.scores-section__col-full {
  font-size: var(--cp-font-xs);
  font-weight: 400;
  color: var(--cp-text-3);
}

.scores-section__score {
  font-size: var(--cp-font-md);
  font-weight: 600;
}

.scores-section__score--low {
  color: var(--cp-danger);
}

.scores-section__chart-title {
  margin: var(--cp-gap-4) 0 var(--cp-gap-3);
  font-size: var(--cp-font-base);
  font-weight: 600;
  color: var(--cp-text-1);
}

.scores-section__chart-panel {
  position: relative;
  padding: var(--cp-gap-3) var(--cp-gap-4) var(--cp-gap-2);
  border-radius: var(--cp-radius-card);
  border: 1px solid var(--cp-primary-border);
  background:
    radial-gradient(520px 220px at 12% 0%, rgba(37, 99, 235, 0.12), transparent 60%),
    radial-gradient(480px 200px at 92% 100%, rgba(14, 165, 233, 0.1), transparent 55%),
    linear-gradient(180deg, var(--cp-primary-bg) 0%, #ffffff 72%);
  box-shadow: var(--cp-shadow-1);
  overflow: visible;
}

.timeline {
  position: relative;
  padding-left: 28px;
}

.timeline-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--cp-gap-3);
  margin-bottom: var(--cp-gap-4);
}

.timeline__item {
  display: flex;
  gap: var(--cp-gap-4);
  margin-bottom: var(--cp-gap-4);
  position: relative;
  transition: transform 0.2s ease;
}

.timeline__item:hover {
  transform: translateX(4px);
}

.timeline__item::before {
  content: '';
  position: absolute;
  left: -20px;
  top: 20px;
  bottom: -16px;
  width: 2px;
  background: var(--cp-divider);
}

.timeline__item:last-child::before {
  display: none;
}

.timeline__axis {
  position: absolute;
  left: -28px;
  top: 12px;
}

.timeline__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--cp-text-3);
  box-shadow: 0 0 0 3px var(--cp-bg-card);
}

.timeline__dot--score { background: var(--cp-domain-score); }
.timeline__dot--incident { background: var(--cp-domain-incident); }
.timeline__dot--contact { background: var(--cp-domain-contact); }
.timeline__dot--comment { background: var(--cp-domain-comment); }
.timeline__dot--praise { background: var(--cp-domain-praise); }

.timeline__card {
  flex: 1;
  border-left: 5px solid var(--cp-border);
  transition: box-shadow 0.2s ease;
}

.timeline__card--score { border-left-color: var(--cp-domain-score); }
.timeline__card--incident { border-left-color: var(--cp-domain-incident); }
.timeline__card--contact { border-left-color: var(--cp-domain-contact); }
.timeline__card--comment { border-left-color: var(--cp-domain-comment); }
.timeline__card--praise { border-left-color: var(--cp-domain-praise); }

.timeline__card-header {
  display: flex;
  align-items: center;
  gap: var(--cp-gap-2);
  margin-bottom: var(--cp-gap-2);
}

.timeline__date {
  font-size: var(--cp-font-sm);
  color: var(--cp-text-3);
}

.timeline__title {
  margin: 0 0 var(--cp-gap-2);
  font-size: var(--cp-font-base);
  font-weight: 600;
}

.timeline__summary {
  margin: 0;
  font-size: var(--cp-font-sm);
  color: var(--cp-text-2);
  line-height: 1.65;
}

.timeline__score-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cp-gap-4);
  margin-bottom: var(--cp-gap-3);
  font-size: var(--cp-font-sm);
  color: var(--cp-text-2);
}

.timeline__score-meta strong {
  margin-left: 4px;
  color: var(--cp-domain-score);
  font-size: var(--cp-font-base);
}

.timeline__score-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: var(--cp-gap-2);
}

.timeline__score-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--cp-gap-2);
  background: var(--cp-bg-page);
  border-radius: var(--cp-radius-ctl);
  border: 1px solid var(--cp-divider);
}

.timeline__score-name {
  font-size: var(--cp-font-xs);
  color: var(--cp-text-3);
}

.timeline__score-value {
  font-size: var(--cp-font-md);
  font-weight: 700;
  color: var(--cp-text-1);
}

.timeline__score-rank {
  font-size: 12px;
  color: var(--cp-text-2);
}

.pin-dialog__hint {
  margin: 0;
  font-size: var(--cp-font-base);
  color: var(--cp-text-2);
}

.comments-tab__actions {
  display: flex;
  gap: var(--cp-gap-2);
  margin-bottom: var(--cp-gap-4);
}

.comments-tab__list {
  display: flex;
  flex-direction: column;
  gap: var(--cp-gap-3);
}

.comments-tab__card {
  border: 1px solid var(--cp-border);
  border-radius: var(--cp-radius-md);
}

.comments-tab__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--cp-gap-2);
  margin-bottom: var(--cp-gap-2);
}

.comments-tab__time {
  font-size: var(--cp-font-sm);
  color: var(--cp-text-3);
}

.comments-tab__spacer {
  flex: 1;
}

.comments-tab__text {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.7;
  color: var(--cp-text-1);
  font-size: var(--cp-font-base);
}

.impression-tab__hint {
  margin: 0 0 var(--cp-gap-3);
  font-size: var(--cp-font-sm);
  color: var(--cp-text-3);
  line-height: 1.6;
}

.impression-tab__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cp-gap-3);
  margin-top: var(--cp-gap-3);
}

.impression-tab__meta {
  font-size: var(--cp-font-sm);
  color: var(--cp-text-3);
}
</style>
