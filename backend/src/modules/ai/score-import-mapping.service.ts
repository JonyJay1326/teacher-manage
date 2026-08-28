import { Injectable } from '@nestjs/common';
import { AiRepository } from './ai.repository';
import { DeepSeekService } from './deepseek.service';

/** 考试科目简要 */
export interface ImportSubjectRef {
  id: number;
  name: string;
  code: string;
  fullScore: number;
}

/** AI/规则识别出的列映射 */
export interface ScoreSheetMapping {
  headerRowIndex: number;
  studentNoCol: number | null;
  nameCol: number | null;
  subjects: Array<{ col: number; subjectId: number; header: string }>;
  source: 'ai' | 'rules';
  message?: string;
}

/** 成绩表列映射服务（AI 优先，规则降级） */
@Injectable()
export class ScoreImportMappingService {
  constructor(
    private readonly deepSeekService: DeepSeekService,
    private readonly aiRepository: AiRepository,
  ) {}

  /**
   * 识别表头与列映射。
   * AI 不可用或失败时自动降级为规则匹配。
   */
  async resolveMapping(input: {
    sampleRows: string[][];
    subjects: ImportSubjectRef[];
  }): Promise<ScoreSheetMapping> {
    const ruleMapping = this.mapByRules(input.sampleRows, input.subjects);
    if (!this.deepSeekService.isConfigured()) {
      return {
        ...ruleMapping,
        source: 'rules',
        message: 'AI 未配置，已用规则识别列；请在预览中核对',
      };
    }

    try {
      const aiMapping = await this.mapByAi(input.sampleRows, input.subjects);
      if (aiMapping.subjects.length === 0) {
        return {
          ...ruleMapping,
          source: 'rules',
          message: 'AI 未识别到科目列，已回退规则匹配',
        };
      }
      return aiMapping;
    } catch {
      return {
        ...ruleMapping,
        source: 'rules',
        message: 'AI 识别失败，已回退规则匹配；请仔细核对预览',
      };
    }
  }

  /** 调用 DeepSeek 输出 JSON 映射 */
  private async mapByAi(
    sampleRows: string[][],
    subjects: ImportSubjectRef[],
  ): Promise<ScoreSheetMapping> {
    const subjectCatalog = subjects.map((s) => ({
      id: s.id,
      name: s.name,
      aliases: this.buildAliases(s),
      fullScore: s.fullScore,
    }));

    const systemPrompt = `你是成绩表格结构识别助手。根据样例行识别：表头行、学号列、姓名列、各科目分数字列。
只输出 JSON，不要 markdown。格式：
{"headerRowIndex":0,"studentNoCol":0,"nameCol":1,"subjects":[{"col":2,"subjectId":1,"header":"语文"}]}
规则：
1. subjectId 必须来自给定科目清单；无法对应的列不要放入 subjects
2. 忽略总分、平均分、排名、班级等非单科分数字列
3. 列下标从 0 开始；headerRowIndex 为表头所在行
4. 若无学号列，studentNoCol 可为 null（将按姓名匹配）
5. 单科表也只映射识别到的科目`;

    const userPrompt = JSON.stringify({
      subjects: subjectCatalog,
      sampleRows,
    });

    const call = await this.deepSeekService.chatJson(systemPrompt, userPrompt);
    this.aiRepository.insertRecord({
      scene: 'score_import_map',
      contextSnapshot: userPrompt.slice(0, 8000),
      outputText: call.content,
      model: call.model,
      tokensIn: call.tokensIn,
      tokensOut: call.tokensOut,
      status: 'generated',
    });

    const parsed = this.parseAiJson(call.content, subjects);
    return { ...parsed, source: 'ai' };
  }

  /** 解析并校验 AI JSON */
  private parseAiJson(
    content: string,
    subjects: ImportSubjectRef[],
  ): Omit<ScoreSheetMapping, 'source' | 'message'> {
    const subjectIds = new Set(subjects.map((s) => s.id));
    let raw: unknown;
    try {
      raw = JSON.parse(content) as unknown;
    } catch {
      throw new Error('AI_JSON_INVALID');
    }
    if (typeof raw !== 'object' || raw === null) {
      throw new Error('AI_JSON_INVALID');
    }
    const obj = raw as Record<string, unknown>;
    const headerRowIndex = Number(obj.headerRowIndex ?? 0);
    const studentNoCol =
      obj.studentNoCol === null || obj.studentNoCol === undefined
        ? null
        : Number(obj.studentNoCol);
    const nameCol =
      obj.nameCol === null || obj.nameCol === undefined
        ? null
        : Number(obj.nameCol);

    const subjectsRaw = Array.isArray(obj.subjects) ? obj.subjects : [];
    const mapped: Array<{ col: number; subjectId: number; header: string }> = [];
    for (const item of subjectsRaw) {
      if (typeof item !== 'object' || item === null) continue;
      const row = item as Record<string, unknown>;
      const col = Number(row.col);
      const subjectId = Number(row.subjectId);
      const header = String(row.header ?? '');
      if (!Number.isFinite(col) || col < 0) continue;
      if (!subjectIds.has(subjectId)) continue;
      if (mapped.some((m) => m.subjectId === subjectId || m.col === col)) continue;
      mapped.push({ col, subjectId, header });
    }

    return {
      headerRowIndex: Number.isFinite(headerRowIndex) ? Math.max(0, headerRowIndex) : 0,
      studentNoCol:
        studentNoCol !== null && Number.isFinite(studentNoCol) ? studentNoCol : null,
      nameCol: nameCol !== null && Number.isFinite(nameCol) ? nameCol : null,
      subjects: mapped,
    };
  }

  /** 规则降级：按表头关键字匹配 */
  private mapByRules(
    sampleRows: string[][],
    subjects: ImportSubjectRef[],
  ): Omit<ScoreSheetMapping, 'source' | 'message'> {
    let headerRowIndex = 0;
    let bestScore = -1;
    const scanLimit = Math.min(sampleRows.length, 15);
    for (let r = 0; r < scanLimit; r += 1) {
      const row = sampleRows[r] ?? [];
      let score = 0;
      for (const cell of row) {
        const text = this.normalizeHeader(cell);
        if (!text) continue;
        if (text.includes('学号') || text.includes('考号')) score += 3;
        if (text.includes('姓名') || text === '名字') score += 3;
        for (const sub of subjects) {
          if (this.headerMatchesSubject(text, sub)) score += 2;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        headerRowIndex = r;
      }
    }

    const header = sampleRows[headerRowIndex] ?? [];
    let studentNoCol: number | null = null;
    let nameCol: number | null = null;
    const mapped: Array<{ col: number; subjectId: number; header: string }> = [];

    header.forEach((cell, col) => {
      const text = this.normalizeHeader(cell);
      if (!text) return;
      if (studentNoCol === null && (text.includes('学号') || text.includes('考号'))) {
        studentNoCol = col;
        return;
      }
      if (nameCol === null && (text.includes('姓名') || text === '名字' || text === '学生')) {
        nameCol = col;
        return;
      }
      if (
        text.includes('总分')
        || text.includes('合计')
        || text.includes('平均')
        || text.includes('排名')
        || text.includes('名次')
        || text.includes('班级')
      ) {
        return;
      }
      for (const sub of subjects) {
        if (!this.headerMatchesSubject(text, sub)) continue;
        if (mapped.some((m) => m.subjectId === sub.id || m.col === col)) continue;
        mapped.push({ col, subjectId: sub.id, header: cell });
        break;
      }
    });

    return { headerRowIndex, studentNoCol, nameCol, subjects: mapped };
  }

  /** 科目别名 */
  private buildAliases(subject: ImportSubjectRef): string[] {
    const aliases = [subject.name, subject.code];
    const map: Record<string, string[]> = {
      语文: ['语'],
      数学: ['数'],
      英语: ['英', '外语'],
      道法: ['道德与法治', '政治', '思品'],
      历史: ['史'],
      地理: ['地'],
      生物: ['生'],
      体育: ['体', '体育与健康'],
    };
    const extra = map[subject.name];
    if (extra) aliases.push(...extra);
    return aliases;
  }

  /** 表头是否匹配科目 */
  private headerMatchesSubject(header: string, subject: ImportSubjectRef): boolean {
    const aliases = this.buildAliases(subject).map((a) => this.normalizeHeader(a));
    return aliases.some((a) => a.length > 0 && (header === a || header.includes(a)));
  }

  /** 规范化表头文本 */
  private normalizeHeader(value: string): string {
    return value.replace(/\s+/g, '').replace(/[（(].*?[）)]/g, '').trim();
  }
}
