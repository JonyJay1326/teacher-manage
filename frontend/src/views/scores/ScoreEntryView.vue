<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ApiError } from '@/api/http';
import {
  batchSaveScoresApi,
  commitScoreImportApi,
  downloadScoreImportTemplateApi,
  getExamApi,
  getScoreEntryApi,
  listSubjectsApi,
  parseScoreImportApi,
  recalcRanksApi,
  type ExcelImportParseResult,
} from '@/api/scores';
import type { Exam, ScoreCellStatus, Subject } from '@/types';

/** API 入库用中文成绩状态 */
type ScoreStatusCn = '正常' | '缺考' | '免考';

/** 单科录入单元格 */
interface SubjectEntryCell {
  lastScore: number | null;
  currentScore: number | null;
  status: ScoreCellStatus;
}

/** 多科合并录入行 */
interface MultiEntryRow {
  studentId: number;
  studentNo: string;
  name: string;
  cells: Record<number, SubjectEntryCell>;
}

/** 当前焦点位置 */
interface FocusedCell {
  rowIndex: number;
  subjectId: number;
}

/** localStorage 暂存载荷 */
interface ScoreDraftPayload {
  examId: number;
  savedAt: string;
  cells: Array<{
    studentId: number;
    subjectId: number;
    currentScore: number | null;
    status: ScoreCellStatus;
  }>;
}

/** 粘贴预览行 */
interface PastePreviewRow {
  lineNo: number;
  studentId: number | null;
  studentNo: string;
  name: string;
  raw: string;
  score: number | null;
  status: ScoreCellStatus;
  ok: boolean;
  message: string;
}

/** 粘贴对齐模式 */
type PasteAlignMode = 'order' | 'studentNo';

const route = useRoute();
const router = useRouter();

const examId = Number(route.params.id);
const loading = ref(false);
const saving = ref(false);
const exam = ref<Exam | null>(null);
const subjects = ref<Subject[]>([]);
const rows = ref<MultiEntryRow[]>([]);
const focusedCell = ref<FocusedCell | null>(null);
const dirty = ref(false);
const draftTimer = ref<ReturnType<typeof setTimeout> | null>(null);

const pasteVisible = ref(false);
const pasteSubjectId = ref<number | null>(null);
const pasteMode = ref<PasteAlignMode>('order');
const pasteText = ref('');
const pastePreview = ref<PastePreviewRow[]>([]);

const excelVisible = ref(false);
const excelParsing = ref(false);
const excelCommitting = ref(false);
const excelWriteMode = ref<'overwrite' | 'fillEmpty'>('fillEmpty');
const excelResult = ref<ExcelImportParseResult | null>(null);
const excelFileInput = ref<HTMLInputElement | null>(null);

/** 暂存 key */
function draftStorageKey(): string {
  return `cp-score-draft-${examId}`;
}

/** 总录入格数 */
const totalCellCount = computed(
  () => rows.value.length * subjects.value.length,
);

/** 已录入格数（含缺考/免考） */
const enteredCount = computed(() => {
  let count = 0;
  for (const row of rows.value) {
    for (const subject of subjects.value) {
      const cell = row.cells[subject.id];
      if (
        cell
        && (cell.status === 'normal'
          || cell.status === 'absent'
          || cell.status === 'exempt')
      ) {
        count += 1;
      }
    }
  }
  return count;
});

/** 满分说明文案 */
const fullScoreHint = computed(() =>
  subjects.value
    .map((subject) => `${subject.name}${subject.fullScore}`)
    .join(' · '),
);

/** 粘贴预览中可写入行数 */
const pasteOkCount = computed(
  () => pastePreview.value.filter((r) => r.ok).length,
);

/** UI 状态映射为 API 中文状态 */
function toApiStatus(status: ScoreCellStatus): ScoreStatusCn {
  if (status === 'absent') return '缺考';
  if (status === 'exempt') return '免考';
  return '正常';
}

/** 创建空录入单元格 */
function emptySubjectCell(): SubjectEntryCell {
  return {
    lastScore: null,
    currentScore: null,
    status: 'empty',
  };
}

/** 将录入单元格转为批量保存条目 */
function toBatchItem(
  studentId: number,
  cell: SubjectEntryCell,
): {
  studentId: number;
  score: number | null;
  status: ScoreStatusCn;
} {
  const status = toApiStatus(cell.status);
  if (status === '缺考' || status === '免考' || cell.status === 'empty') {
    return { studentId, score: null, status };
  }
  return {
    studentId,
    score: cell.currentScore,
    status,
  };
}

/** 获取指定单元格 */
function getCell(row: MultiEntryRow, subjectId: number): SubjectEntryCell {
  return row.cells[subjectId] ?? emptySubjectCell();
}

/** 标记脏并调度 localStorage 暂存 */
function markDirty(): void {
  dirty.value = true;
  scheduleDraftSave();
}

/** 防抖写入 localStorage */
function scheduleDraftSave(): void {
  if (draftTimer.value) clearTimeout(draftTimer.value);
  draftTimer.value = setTimeout(() => {
    persistDraft();
  }, 800);
}

/** 序列化当前录入到 localStorage */
function persistDraft(): void {
  if (rows.value.length === 0 || subjects.value.length === 0) return;
  const cells: ScoreDraftPayload['cells'] = [];
  for (const row of rows.value) {
    for (const subject of subjects.value) {
      const cell = getCell(row, subject.id);
      cells.push({
        studentId: row.studentId,
        subjectId: subject.id,
        currentScore: cell.currentScore,
        status: cell.status,
      });
    }
  }
  const payload: ScoreDraftPayload = {
    examId,
    savedAt: new Date().toISOString(),
    cells,
  };
  try {
    localStorage.setItem(draftStorageKey(), JSON.stringify(payload));
  } catch {
    // 配额满等静默
  }
}

/** 清除暂存 */
function clearDraft(): void {
  localStorage.removeItem(draftStorageKey());
  dirty.value = false;
}

/** 读取暂存 */
function readDraft(): ScoreDraftPayload | null {
  const raw = localStorage.getItem(draftStorageKey());
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const draft = parsed as ScoreDraftPayload;
    if (draft.examId !== examId || !Array.isArray(draft.cells)) return null;
    return draft;
  } catch {
    return null;
  }
}

/** 将暂存应用到当前表格 */
function applyDraft(draft: ScoreDraftPayload): number {
  const byKey = new Map(
    draft.cells.map((c) => [`${c.studentId}:${c.subjectId}`, c]),
  );
  let applied = 0;
  for (const row of rows.value) {
    for (const subject of subjects.value) {
      const item = byKey.get(`${row.studentId}:${subject.id}`);
      if (!item) continue;
      const cell = getCell(row, subject.id);
      cell.currentScore = item.currentScore;
      cell.status = item.status;
      applied += 1;
    }
  }
  dirty.value = true;
  return applied;
}

/** 加载后若有暂存则提示恢复 */
async function maybeRestoreDraft(): Promise<void> {
  const draft = readDraft();
  if (!draft || draft.cells.length === 0) return;
  const timeLabel = new Date(draft.savedAt).toLocaleString('zh-CN');
  try {
    await ElMessageBox.confirm(
      `检测到本场考试未保存的录入暂存（${timeLabel}，共 ${draft.cells.length} 格）。是否恢复？`,
      '恢复暂存',
      {
        confirmButtonText: '恢复',
        cancelButtonText: '丢弃',
        type: 'info',
        distinguishCancelAndClose: true,
      },
    );
    const n = applyDraft(draft);
    ElMessage.success(`已恢复 ${n} 格暂存数据`);
  } catch (action: unknown) {
    if (action === 'cancel') {
      clearDraft();
      ElMessage.info('已丢弃暂存');
    }
  }
}

/** 加载考试与科目 */
async function loadExamAndSubjects(): Promise<void> {
  loading.value = true;
  try {
    const [examData, allSubjects] = await Promise.all([
      getExamApi(examId),
      listSubjectsApi(),
    ]);
    exam.value = examData;
    subjects.value = allSubjects.filter((s) =>
      examData.subjectIds.includes(s.id),
    );
    await loadAllEntryRows();
    await maybeRestoreDraft();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载考试失败');
  } finally {
    loading.value = false;
  }
}

/** 加载全部科目录入行并合并为一张表 */
async function loadAllEntryRows(): Promise<void> {
  const subjectList = subjects.value;
  if (subjectList.length === 0) {
    rows.value = [];
    focusedCell.value = null;
    return;
  }

  try {
    const entryLists = await Promise.all(
      subjectList.map((subject) => getScoreEntryApi(examId, subject.id)),
    );
    const baseRows = entryLists[0] ?? [];
    rows.value = baseRows.map((base) => {
      const cells: Record<number, SubjectEntryCell> = {};
      subjectList.forEach((subject, idx) => {
        const list = entryLists[idx] ?? [];
        const entry = list.find((item) => item.studentId === base.studentId);
        cells[subject.id] = entry
          ? {
              lastScore: entry.lastScore,
              currentScore: entry.currentScore,
              status: entry.status,
            }
          : emptySubjectCell();
      });
      return {
        studentId: base.studentId,
        studentNo: base.studentNo,
        name: base.name,
        cells,
      };
    });

    const firstSubject = subjectList[0];
    focusedCell.value =
      rows.value.length > 0 && firstSubject
        ? { rowIndex: 0, subjectId: firstSubject.id }
        : null;
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载录入数据失败');
  }
}

/** 设置焦点单元格并聚焦录入控件 */
function setFocusedCell(rowIndex: number, subjectId: number): void {
  focusedCell.value = { rowIndex, subjectId };
  void nextTick(() => {
    const el = document.querySelector<HTMLElement>(
      `[data-entry-row="${rowIndex}"][data-entry-subject="${subjectId}"]`,
    );
    el?.focus();
  });
}

/** 移动到下一行（同列） */
function focusNextRow(rowIndex: number, subjectId: number): void {
  const next = rowIndex + 1;
  if (next < rows.value.length) {
    setFocusedCell(next, subjectId);
  }
}

/** 更新指定单元格分数输入 */
function handleScoreInput(
  rowIndex: number,
  subjectId: number,
  raw: string,
): void {
  const row = rows.value[rowIndex];
  if (!row) return;
  const cell = getCell(row, subjectId);
  const trimmed = raw.trim();
  if (trimmed === '') {
    cell.currentScore = null;
    cell.status = 'empty';
    markDirty();
    return;
  }
  const num = Number(trimmed);
  if (Number.isNaN(num)) {
    return;
  }
  cell.currentScore = num;
  cell.status = 'normal';
  markDirty();
  const subject = subjects.value.find((item) => item.id === subjectId);
  const full = subject?.fullScore ?? 120;
  if (num < 0 || num > full) {
    ElMessage.warning(`${subject?.name ?? '该科'}分数应在 0–${full} 之间`);
  }
}

/** 处理录入格按键 */
function handleCellKeydown(
  event: KeyboardEvent,
  rowIndex: number,
  subjectId: number,
): void {
  const key = event.key;
  const row = rows.value[rowIndex];
  if (!row) return;
  const cell = getCell(row, subjectId);

  if (key === 'Enter' || key === 'ArrowDown') {
    event.preventDefault();
    focusNextRow(rowIndex, subjectId);
    return;
  }
  if (key === 'ArrowUp') {
    event.preventDefault();
    if (rowIndex > 0) setFocusedCell(rowIndex - 1, subjectId);
    return;
  }
  if (key === 'ArrowRight') {
    event.preventDefault();
    const idx = subjects.value.findIndex((item) => item.id === subjectId);
    const nextSubject = subjects.value[idx + 1];
    if (nextSubject) setFocusedCell(rowIndex, nextSubject.id);
    return;
  }
  if (key === 'ArrowLeft') {
    event.preventDefault();
    const idx = subjects.value.findIndex((item) => item.id === subjectId);
    const prevSubject = subjects.value[idx - 1];
    if (prevSubject) setFocusedCell(rowIndex, prevSubject.id);
    return;
  }
  if (key === 'x' || key === 'X') {
    event.preventDefault();
    cell.status = 'absent';
    cell.currentScore = null;
    markDirty();
    focusNextRow(rowIndex, subjectId);
    return;
  }
  if (key === 'm' || key === 'M') {
    event.preventDefault();
    cell.status = 'exempt';
    cell.currentScore = null;
    markDirty();
    focusNextRow(rowIndex, subjectId);
    return;
  }
  if (key === 'Escape') {
    event.preventDefault();
    cell.status = 'empty';
    cell.currentScore = null;
    markDirty();
  }
}

/** 获取格子 CSS 类 */
function getCellClass(
  row: MultiEntryRow,
  rowIndex: number,
  subjectId: number,
): string {
  const cell = getCell(row, subjectId);
  const classes = ['score-cell'];
  if (
    focusedCell.value?.rowIndex === rowIndex
    && focusedCell.value?.subjectId === subjectId
  ) {
    classes.push('score-cell--focused');
  }
  if (cell.status === 'empty') classes.push('score-cell--empty');
  if (cell.status === 'absent') classes.push('score-cell--absent');
  if (cell.status === 'exempt') classes.push('score-cell--exempt');
  const subject = subjects.value.find((s) => s.id === subjectId);
  const full = subject?.fullScore ?? 120;
  if (
    cell.status === 'normal'
    && cell.currentScore !== null
    && (cell.currentScore < 0 || cell.currentScore > full)
  ) {
    classes.push('score-cell--invalid');
  }
  return classes.join(' ');
}

/** 解析单格粘贴值 */
function parsePasteToken(
  raw: string,
  fullScore: number,
): { score: number | null; status: ScoreCellStatus; ok: boolean; message: string } {
  const text = raw.trim();
  if (text === '') {
    return { score: null, status: 'empty', ok: false, message: '空行跳过' };
  }
  const upper = text.toUpperCase();
  if (upper === 'X' || text === '缺' || text === '缺考') {
    return { score: null, status: 'absent', ok: true, message: '缺考' };
  }
  if (upper === 'M' || text === '免' || text === '免考') {
    return { score: null, status: 'exempt', ok: true, message: '免考' };
  }
  const num = Number(text);
  if (Number.isNaN(num)) {
    return { score: null, status: 'empty', ok: false, message: '无法解析' };
  }
  if (num < 0 || num > fullScore) {
    return {
      score: num,
      status: 'normal',
      ok: false,
      message: `越界（满分 ${fullScore}）`,
    };
  }
  return { score: num, status: 'normal', ok: true, message: '✓' };
}

/** 打开粘贴导入弹窗 */
function openPasteDialog(): void {
  if (subjects.value.length === 0) {
    ElMessage.warning('该考试未配置科目');
    return;
  }
  pasteSubjectId.value = subjects.value[0]?.id ?? null;
  pasteMode.value = 'order';
  pasteText.value = '';
  pastePreview.value = [];
  pasteVisible.value = true;
}

/** 根据粘贴文本生成预览 */
function buildPastePreview(): void {
  const subjectId = pasteSubjectId.value;
  const subject = subjects.value.find((s) => s.id === subjectId);
  if (!subject) {
    pastePreview.value = [];
    return;
  }
  const fullScore = subject.fullScore;
  const lines = pasteText.value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const preview: PastePreviewRow[] = [];

  if (pasteMode.value === 'order') {
    lines.forEach((line, index) => {
      const student = rows.value[index];
      const parsed = parsePasteToken(line, fullScore);
      if (!student) {
        preview.push({
          lineNo: index + 1,
          studentId: null,
          studentNo: '—',
          name: '（超出学生数）',
          raw: line,
          score: parsed.score,
          status: parsed.status,
          ok: false,
          message: '无对应学生',
        });
        return;
      }
      preview.push({
        lineNo: index + 1,
        studentId: student.studentId,
        studentNo: student.studentNo,
        name: student.name,
        raw: line,
        score: parsed.score,
        status: parsed.status,
        ok: parsed.ok && parsed.status !== 'empty',
        message: parsed.message,
      });
    });
  } else {
    const byNo = new Map(rows.value.map((r) => [r.studentNo, r]));
    lines.forEach((line, index) => {
      const parts = line.split(/[\t,，\s]+/).filter(Boolean);
      const studentNo = parts[0] ?? '';
      const scoreRaw = parts.slice(1).join(' ');
      const student = byNo.get(studentNo);
      if (!student) {
        preview.push({
          lineNo: index + 1,
          studentId: null,
          studentNo,
          name: '—',
          raw: line,
          score: null,
          status: 'empty',
          ok: false,
          message: '学号不存在',
        });
        return;
      }
      const parsed = parsePasteToken(scoreRaw, fullScore);
      preview.push({
        lineNo: index + 1,
        studentId: student.studentId,
        studentNo: student.studentNo,
        name: student.name,
        raw: line,
        score: parsed.score,
        status: parsed.status,
        ok: parsed.ok && parsed.status !== 'empty',
        message: parsed.message,
      });
    });
  }

  pastePreview.value = preview;
}

/** 将预览中成功行写入表格 */
function applyPastePreview(): void {
  const subjectId = pasteSubjectId.value;
  if (subjectId === null) return;
  const okRows = pastePreview.value.filter((r) => r.ok && r.studentId !== null);
  if (okRows.length === 0) {
    ElMessage.warning('没有可写入的有效行');
    return;
  }
  const byId = new Map(rows.value.map((r) => [r.studentId, r]));
  for (const item of okRows) {
    const row = byId.get(item.studentId!);
    if (!row) continue;
    const cell = getCell(row, subjectId);
    cell.status = item.status;
    cell.currentScore = item.score;
  }
  markDirty();
  pasteVisible.value = false;
  ElMessage.success(`已写入 ${okRows.length} 行到「${subjects.value.find((s) => s.id === subjectId)?.name ?? ''}」，请核对后保存`);
}

/** 粘贴预览错误行样式 */
function pasteRowClassName({ row }: { row: PastePreviewRow }): string {
  return row.ok ? '' : 'score-paste__row--err';
}

watch([pasteText, pasteMode, pasteSubjectId], () => {
  if (pasteVisible.value) buildPastePreview();
});

/** 打开 Excel 导入 */
function openExcelDialog(): void {
  excelResult.value = null;
  excelWriteMode.value = 'fillEmpty';
  excelVisible.value = true;
}

/** 触发文件选择 */
function triggerExcelPick(): void {
  excelFileInput.value?.click();
}

/** 下载导入模板 */
async function handleDownloadTemplate(): Promise<void> {
  try {
    const data = await downloadScoreImportTemplateApi(examId);
    const binary = atob(data.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: data.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '模板下载失败');
  }
}

/** 选择文件后上传解析 */
async function handleExcelFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    ElMessage.warning(file.name.toLowerCase().endsWith('.xls')
      ? '暂不支持 .xls，请另存为 .xlsx'
      : '仅支持 .xlsx 文件');
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    ElMessage.warning('文件不能超过 2MB');
    return;
  }

  excelParsing.value = true;
  excelResult.value = null;
  try {
    excelResult.value = await parseScoreImportApi(examId, file);
    if (excelResult.value.mapping.message) {
      ElMessage.warning(excelResult.value.mapping.message);
    } else if (excelResult.value.mapping.source === 'ai') {
      ElMessage.success('AI 已识别表格结构，请核对预览');
    } else {
      ElMessage.success('已用规则识别表格，请核对预览');
    }
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '解析失败');
  } finally {
    excelParsing.value = false;
  }
}

/** 查找预览中某科单元格 */
function findImportCell(
  row: ExcelImportParseResult['rows'][number],
  subjectId: number,
): ExcelImportParseResult['rows'][number]['cells'][number] | undefined {
  return row.cells.find((c) => c.subjectId === subjectId);
}

/** 预览单元格展示 */
function formatImportCell(
  cell:
    | {
        status: string;
        score: number | null;
        raw: string;
      }
    | undefined,
): string {
  if (!cell) return '—';
  if (cell.status === 'absent') return '缺';
  if (cell.status === 'exempt') return '免';
  if (cell.status === 'empty' || cell.raw === '') return '—';
  return cell.score !== null ? String(cell.score) : cell.raw;
}

/** Excel 预览错误行 */
function excelRowClassName({
  row,
}: {
  row: ExcelImportParseResult['rows'][number];
}): string {
  return row.ok ? '' : 'score-paste__row--err';
}

/** 确认写入数据库 */
async function handleExcelCommit(): Promise<void> {
  const result = excelResult.value;
  if (!result) return;

  const items: Array<{
    studentId: number;
    subjectId: number;
    score: number | null;
    status: '正常' | '缺考' | '免考';
  }> = [];

  for (const row of result.rows) {
    if (!row.ok || row.studentId === null) continue;
    for (const cell of row.cells) {
      if (!cell.willWrite || !cell.ok) continue;
      const statusCn: '正常' | '缺考' | '免考' =
        cell.status === 'absent'
          ? '缺考'
          : cell.status === 'exempt'
            ? '免考'
            : '正常';
      items.push({
        studentId: row.studentId,
        subjectId: cell.subjectId,
        score: cell.score,
        status: statusCn,
      });
    }
  }

  if (items.length === 0) {
    ElMessage.warning('没有可写入的成绩格');
    return;
  }

  excelCommitting.value = true;
  try {
    const res = await commitScoreImportApi(examId, {
      writeMode: excelWriteMode.value,
      items,
    });
    ElMessage.success(`已写入 ${res.written} 个成绩格`);
    excelVisible.value = false;
    clearDraft();
    await loadAllEntryRows();

    try {
      await ElMessageBox.confirm('是否立即重算排名？', '导入完成', {
        type: 'success',
        confirmButtonText: '重算排名',
        cancelButtonText: '稍后',
      });
      await recalcRanksApi(examId);
      ElMessage.success('排名已重算');
      await loadAllEntryRows();
    } catch {
      // 用户取消
    }
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '写入失败');
  } finally {
    excelCommitting.value = false;
  }
}

/** 保存全部科目并重算排名 */
async function saveAndRecalc(): Promise<void> {
  if (subjects.value.length === 0) {
    ElMessage.warning('该考试未配置科目');
    return;
  }
  if (rows.value.length === 0) {
    ElMessage.warning('暂无学生可保存');
    return;
  }

  saving.value = true;
  try {
    for (const subject of subjects.value) {
      await batchSaveScoresApi({
        examId,
        subjectId: subject.id,
        items: rows.value.map((row) =>
          toBatchItem(row.studentId, getCell(row, subject.id)),
        ),
      });
    }
    await recalcRanksApi(examId);
    clearDraft();
    ElMessage.success('已保存并重算排名');
    await loadAllEntryRows();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

/** 退出录入页 */
async function exitEntry(): Promise<void> {
  if (dirty.value) {
    try {
      await ElMessageBox.confirm(
        '还有未保存到服务器的修改（已自动暂存在本机）。确定离开？',
        '离开确认',
        { type: 'warning', confirmButtonText: '离开', cancelButtonText: '留下' },
      );
    } catch {
      return;
    }
  }
  router.push('/scores');
}

/** 浏览器关闭/刷新前提示 */
function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!dirty.value) return;
  event.preventDefault();
  event.returnValue = '';
}

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload);
  void loadExamAndSubjects().then(() => {
    if (route.query.import === 'excel') {
      openExcelDialog();
    }
  });
});

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload);
  if (draftTimer.value) clearTimeout(draftTimer.value);
  if (dirty.value) persistDraft();
});
</script>

<template>
  <div v-loading="loading" class="score-entry">
    <!-- 吸顶顶栏 -->
    <header class="score-entry__header">
      <div class="score-entry__header-left">
        <span class="score-entry__exam-name">{{ exam?.name ?? '成绩录入' }}</span>
        <el-tag v-if="dirty" type="warning" size="small" effect="plain">未保存</el-tag>
      </div>
      <div class="score-entry__header-center">
        <span class="score-entry__progress cp-tabular-nums">
          已录 {{ enteredCount }}/{{ totalCellCount }}
        </span>
      </div>
      <div class="score-entry__header-right">
        <el-button @click="openPasteDialog">粘贴导入</el-button>
        <el-button @click="openExcelDialog">Excel 导入</el-button>
        <el-button type="primary" :loading="saving" @click="saveAndRecalc">
          保存并重算排名
        </el-button>
        <el-button @click="exitEntry">完成退出</el-button>
      </div>
    </header>

    <!-- 表格区：每科一列 -->
    <div class="score-entry__table-wrap">
      <el-table
        :data="rows"
        class="score-entry__table"
        :row-class-name="() => 'score-entry__row'"
        height="100%"
      >
        <el-table-column prop="studentNo" label="学号" width="100" fixed>
          <template #default="{ row }">
            <span class="cp-tabular-nums">{{ row.studentNo }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="姓名" width="100" fixed />
        <el-table-column
          v-for="subject in subjects"
          :key="subject.id"
          :label="`${subject.name}(${subject.fullScore})`"
          min-width="120"
          align="center"
        >
          <template #default="{ row, $index }">
            <div class="score-entry__subject-cell">
              <span
                v-if="getCell(row as MultiEntryRow, subject.id).lastScore !== null"
                class="score-entry__last-score cp-tabular-nums"
              >
                上次 {{ getCell(row as MultiEntryRow, subject.id).lastScore }}
              </span>
              <span v-else class="score-entry__last-score">上次 —</span>
              <div
                :class="getCellClass(row as MultiEntryRow, $index, subject.id)"
                @click="setFocusedCell($index, subject.id)"
              >
                <template
                  v-if="getCell(row as MultiEntryRow, subject.id).status === 'absent'"
                >
                  <span
                    class="score-cell__absent-text"
                    :data-entry-row="$index"
                    :data-entry-subject="subject.id"
                    tabindex="0"
                    @keydown="handleCellKeydown($event, $index, subject.id)"
                    @focus="focusedCell = { rowIndex: $index, subjectId: subject.id }"
                  >缺</span>
                </template>
                <template
                  v-else-if="getCell(row as MultiEntryRow, subject.id).status === 'exempt'"
                >
                  <span
                    class="score-cell__exempt-text"
                    :data-entry-row="$index"
                    :data-entry-subject="subject.id"
                    tabindex="0"
                    @keydown="handleCellKeydown($event, $index, subject.id)"
                    @focus="focusedCell = { rowIndex: $index, subjectId: subject.id }"
                  >免</span>
                </template>
                <template v-else>
                  <input
                    type="text"
                    class="score-cell__input cp-tabular-nums"
                    :data-entry-row="$index"
                    :data-entry-subject="subject.id"
                    :value="getCell(row as MultiEntryRow, subject.id).currentScore ?? ''"
                    @focus="focusedCell = { rowIndex: $index, subjectId: subject.id }"
                    @input="
                      handleScoreInput(
                        $index,
                        subject.id,
                        ($event.target as HTMLInputElement).value,
                      )
                    "
                    @keydown="handleCellKeydown($event, $index, subject.id)"
                  />
                </template>
              </div>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 底部提示 -->
    <footer class="score-entry__footer">
      <span class="score-entry__hint">
        快捷键：Enter/↓ 下一行 · ←/→ 切换科目 · X 缺考 · M 免考 · Esc 清空 · 自动暂存本机
      </span>
      <span class="score-entry__full-score">满分：{{ fullScoreHint }}</span>
    </footer>

    <!-- 粘贴导入 -->
    <el-dialog
      v-model="pasteVisible"
      title="粘贴导入"
      width="720px"
      append-to-body
      align-center
      destroy-on-close
    >
      <el-form label-width="96px">
        <el-form-item label="科目" required>
          <el-select v-model="pasteSubjectId" style="width: 220px">
            <el-option
              v-for="s in subjects"
              :key="s.id"
              :label="`${s.name}（满分 ${s.fullScore}）`"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="对齐方式">
          <el-radio-group v-model="pasteMode">
            <el-radio value="order">按名单顺序（一列分数）</el-radio>
            <el-radio value="studentNo">按学号对齐（学号+分数）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="粘贴内容">
          <el-input
            v-model="pasteText"
            type="textarea"
            :rows="8"
            :placeholder="
              pasteMode === 'order'
                ? '从 Excel 复制一列分数粘贴，每行一个；可用 缺/X、免/M'
                : '每行：学号\\t分数，或学号 分数'
            "
          />
        </el-form-item>
      </el-form>
      <el-table
        v-if="pastePreview.length > 0"
        :data="pastePreview"
        max-height="280"
        size="small"
        :row-class-name="pasteRowClassName"
      >
        <el-table-column prop="lineNo" label="#" width="48" />
        <el-table-column prop="studentNo" label="学号" width="100" />
        <el-table-column prop="name" label="姓名" width="90" />
        <el-table-column prop="raw" label="原文" min-width="120" />
        <el-table-column label="解析" width="80" align="center">
          <template #default="{ row }">
            <span v-if="row.status === 'absent'">缺</span>
            <span v-else-if="row.status === 'exempt'">免</span>
            <span v-else class="cp-tabular-nums">{{ row.score ?? '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="message" label="状态" width="120" />
      </el-table>
      <p v-if="pastePreview.length > 0" class="score-paste__summary">
        有效 {{ pasteOkCount }} / {{ pastePreview.length }} 行（错误行标红，确认时跳过）
      </p>
      <template #footer>
        <el-button @click="pasteVisible = false">取消</el-button>
        <el-button type="primary" :disabled="pasteOkCount === 0" @click="applyPastePreview">
          写入表格
        </el-button>
      </template>
    </el-dialog>

    <!-- Excel 导入（AI 识别 → 预览 → 确认入库） -->
    <el-dialog
      v-model="excelVisible"
      title="Excel 导入"
      width="920px"
      append-to-body
      align-center
      destroy-on-close
    >
      <input
        ref="excelFileInput"
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        class="score-excel__file"
        @change="handleExcelFileChange"
      />
      <div class="score-excel__toolbar">
        <el-button @click="handleDownloadTemplate">下载模板</el-button>
        <el-button type="primary" :loading="excelParsing" @click="triggerExcelPick">
          上传 .xlsx
        </el-button>
        <el-radio-group v-model="excelWriteMode" class="score-excel__mode">
          <el-radio value="fillEmpty">仅填空格</el-radio>
          <el-radio value="overwrite">覆盖已有</el-radio>
        </el-radio-group>
      </div>
      <p class="score-excel__hint">
        支持单科或多科汇总表；后端 AI 识别列结构（失败则规则降级）。空单元格不写入；缺/X=缺考，免/M=免考。核对无误后再提交入库。
      </p>

      <template v-if="excelResult">
        <div class="score-excel__meta">
          <el-tag
            size="small"
            :type="excelResult.mapping.source === 'ai' ? 'success' : 'info'"
            effect="plain"
          >
            {{ excelResult.mapping.source === 'ai' ? 'AI 识别' : '规则识别' }}
          </el-tag>
          <span>
            有效行 {{ excelResult.summary.okRows }}/{{ excelResult.summary.totalRows }}
            · 可写格 {{ excelResult.summary.writableCells }}
          </span>
          <span v-if="excelResult.mapping.message" class="score-excel__warn">
            {{ excelResult.mapping.message }}
          </span>
        </div>
        <el-table
          :data="excelResult.rows"
          max-height="360"
          size="small"
          :row-class-name="excelRowClassName"
        >
          <el-table-column prop="rowIndex" label="行" width="48" fixed />
          <el-table-column prop="studentNo" label="学号" width="100" fixed />
          <el-table-column prop="nameInFile" label="表内姓名" width="90" fixed />
          <el-table-column
            v-for="sub in excelResult.subjects"
            :key="sub.id"
            :label="sub.name"
            min-width="72"
            align="center"
          >
            <template #default="{ row }">
              <span
                class="cp-tabular-nums"
                :class="{
                  'score-excel__cell--bad': !findImportCell(
                    row as ExcelImportParseResult['rows'][number],
                    sub.id,
                  )?.ok,
                }"
              >
                {{
                  formatImportCell(
                    findImportCell(
                      row as ExcelImportParseResult['rows'][number],
                      sub.id,
                    ),
                  )
                }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="message" label="状态" width="140" fixed="right" />
        </el-table>
      </template>
      <el-empty v-else description="上传 Excel 后显示识别预览" :image-size="72" />

      <template #footer>
        <el-button @click="excelVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="excelCommitting"
          :disabled="!excelResult || excelResult.summary.writableCells === 0"
          @click="handleExcelCommit"
        >
          确认写入数据库
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.score-entry {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--cp-bg-page);
}

.score-entry__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 var(--cp-gap-5);
  background: var(--cp-bg-card);
  border-bottom: 1px solid var(--cp-border);
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 10;
}

.score-entry__header-left {
  display: flex;
  align-items: center;
  gap: var(--cp-gap-3);
}

.score-entry__exam-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--cp-text-1);
  white-space: nowrap;
}

.score-entry__progress {
  font-size: 14px;
  color: var(--cp-text-2);
}

.score-entry__header-right {
  display: flex;
  align-items: center;
  gap: var(--cp-gap-2);
}

.score-entry__table-wrap {
  flex: 1;
  overflow: hidden;
  padding: var(--cp-gap-4) var(--cp-gap-5);
}

.score-entry__table {
  height: 100%;
}

.score-entry__table :deep(.score-entry__row) {
  height: 56px;
}

.score-entry__table :deep(td.el-table__cell) {
  font-size: var(--cp-font-base);
  vertical-align: middle;
}

.score-entry__subject-cell {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
}

.score-entry__last-score {
  color: var(--cp-text-3);
  font-size: 12px;
  line-height: 1.2;
  text-align: center;
}

.score-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  padding: 0 var(--cp-gap-2);
  border: 2px solid transparent;
  border-radius: var(--cp-radius-ctl);
  transition: border-color 0.15s;
}

.score-cell--focused {
  border-color: var(--cp-primary);
}

.score-cell--empty {
  background: var(--cp-divider);
}

.score-cell--absent,
.score-cell--exempt {
  background: var(--cp-bg-page);
}

.score-cell--invalid {
  border-color: var(--cp-danger);
  background: var(--cp-danger-bg);
}

.score-cell__input {
  width: 100%;
  height: 100%;
  padding: 0;
  font-size: var(--cp-font-md);
  font-weight: 600;
  color: var(--cp-text-1);
  text-align: center;
  background: transparent;
  border: none;
  outline: none;
}

.score-cell__absent-text,
.score-cell__exempt-text {
  font-size: var(--cp-font-base);
  color: var(--cp-text-3);
}

.score-entry__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 var(--cp-gap-5);
  background: var(--cp-bg-card);
  border-top: 1px solid var(--cp-border);
  flex-shrink: 0;
}

.score-entry__hint {
  font-size: 12px;
  color: var(--cp-text-3);
}

.score-entry__full-score {
  font-size: 12px;
  color: var(--cp-text-2);
}

.score-paste__summary {
  margin: var(--cp-gap-2) 0 0;
  font-size: var(--cp-font-sm);
  color: var(--cp-text-2);
}

:deep(.score-paste__row--err > td.el-table__cell) {
  background-color: var(--cp-danger-bg) !important;
}

.score-excel__file {
  display: none;
}

.score-excel__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cp-gap-3);
  margin-bottom: var(--cp-gap-3);
}

.score-excel__mode {
  margin-left: auto;
}

.score-excel__hint {
  margin: 0 0 var(--cp-gap-3);
  font-size: var(--cp-font-sm);
  color: var(--cp-text-2);
  line-height: 1.5;
}

.score-excel__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cp-gap-3);
  margin-bottom: var(--cp-gap-2);
  font-size: var(--cp-font-sm);
  color: var(--cp-text-2);
}

.score-excel__warn {
  color: var(--cp-warning);
}

.score-excel__cell--bad {
  color: var(--cp-danger);
  font-weight: 600;
}
</style>
