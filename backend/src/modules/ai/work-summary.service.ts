import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AnalysisService } from '../analysis/analysis.service';
import { AiRepository } from './ai.repository';
import { DeepSeekService } from './deepseek.service';
import { PromptsRepository } from './prompts.repository';

/** 工作总结入参 */
export interface WorkSummaryInput {
  termId?: number | null;
  promptId?: number | null;
}

/** 工作总结结果 */
export interface WorkSummaryResult {
  available: boolean;
  message?: string;
  aiRecordId: number | null;
  draftText: string;
  contextText: string;
  termName: string;
  promptId: number | null;
}

/** 学期工作总结生成 */
@Injectable()
export class WorkSummaryService {
  constructor(
    private readonly deepSeekService: DeepSeekService,
    private readonly aiRepository: AiRepository,
    private readonly promptsRepository: PromptsRepository,
    private readonly databaseService: DatabaseService,
    private readonly analysisService: AnalysisService,
  ) {}

  /** 生成学期工作总结初稿 */
  async generate(input: WorkSummaryInput): Promise<WorkSummaryResult> {
    const term = this.resolveTerm(input.termId ?? null);
    const contextText = this.buildClassContext(term);
    const promptRow =
      (input.promptId
        ? this.promptsRepository.findById(input.promptId)
        : undefined)
      ?? this.promptsRepository.findDefault('work_summary');

    const vars: Record<string, string> = {
      term: term?.name ?? '本学期',
      context: contextText,
    };
    const systemPrompt = promptRow
      ? this.fillTemplate(promptRow.template, vars)
      : `请根据数据写学期工作总结。学期：${vars.term}\n${contextText}`;
    const userPrompt = `请撰写「${vars.term}」班主任工作总结初稿。`;
    const promptId = promptRow?.id ?? null;

    if (!this.deepSeekService.isConfigured()) {
      const draft = this.buildFallback(vars.term, contextText);
      const aiRecordId = this.aiRepository.insertRecord({
        scene: 'work_summary',
        promptId,
        studentId: null,
        contextSnapshot: `${systemPrompt}\n\n${userPrompt}`,
        outputText: draft,
        model: 'fallback',
        tokensIn: 0,
        tokensOut: 0,
        status: 'generated',
      });
      return {
        available: false,
        message: 'AI 未配置，已返回数据摘要占位稿',
        aiRecordId,
        draftText: draft,
        contextText,
        termName: vars.term,
        promptId,
      };
    }

    try {
      const result = await this.deepSeekService.chatText(systemPrompt, userPrompt);
      const aiRecordId = this.aiRepository.insertRecord({
        scene: 'work_summary',
        promptId,
        studentId: null,
        contextSnapshot: `${systemPrompt}\n\n${userPrompt}`,
        outputText: result.content,
        model: result.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        status: 'generated',
      });
      return {
        available: true,
        aiRecordId,
        draftText: result.content,
        contextText,
        termName: vars.term,
        promptId,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '生成失败';
      const draft = this.buildFallback(vars.term, contextText);
      const aiRecordId = this.aiRepository.insertRecord({
        scene: 'work_summary',
        promptId,
        studentId: null,
        contextSnapshot: `${systemPrompt}\n\n${userPrompt}`,
        outputText: draft,
        model: 'fallback',
        tokensIn: 0,
        tokensOut: 0,
        status: 'failed',
      });
      return {
        available: false,
        message: `AI 调用失败（${msg}），已降级为数据摘要`,
        aiRecordId,
        draftText: draft,
        contextText,
        termName: vars.term,
        promptId,
      };
    }
  }

  /** 解析学期 */
  private resolveTerm(termId: number | null): {
    id: number;
    name: string;
    start_date: string | null;
    end_date: string | null;
  } | null {
    const db = this.databaseService.getDb();
    if (termId != null) {
      const row = db
        .prepare(
          `SELECT id, name, start_date, end_date FROM terms WHERE id = ?`,
        )
        .get(termId) as
        | {
            id: number;
            name: string;
            start_date: string | null;
            end_date: string | null;
          }
        | undefined;
      return row ?? null;
    }
    const today = new Date().toISOString().slice(0, 10);
    const active = db
      .prepare(
        `SELECT id, name, start_date, end_date FROM terms
         WHERE start_date IS NOT NULL AND end_date IS NOT NULL
           AND start_date <= ? AND end_date >= ?
         ORDER BY id DESC LIMIT 1`,
      )
      .get(today, today) as
      | {
          id: number;
          name: string;
          start_date: string | null;
          end_date: string | null;
        }
      | undefined;
    if (active) return active;
    return (
      (db
        .prepare(
          `SELECT id, name, start_date, end_date FROM terms
           ORDER BY COALESCE(start_date, '') DESC, id DESC LIMIT 1`,
        )
        .get() as
        | {
            id: number;
            name: string;
            start_date: string | null;
            end_date: string | null;
          }
        | undefined) ?? null
    );
  }

  /** 组装班级聚合上下文 */
  private buildClassContext(
    term: {
      id: number;
      name: string;
      start_date: string | null;
      end_date: string | null;
    } | null,
  ): string {
    const overview = this.analysisService.getOverview();
    const lines: string[] = [];
    lines.push(`学期：${term?.name ?? '未指定'}`);
    const stuCount = this.databaseService
      .getDb()
      .prepare(
        `SELECT COUNT(*) AS c FROM students WHERE deleted_at IS NULL AND status = '在读'`,
      )
      .get() as { c: number };
    lines.push(`在读人数：${stuCount.c}`);

    const focus = this.databaseService
      .getDb()
      .prepare(
        `SELECT focus_level, COUNT(*) AS c FROM students
         WHERE deleted_at IS NULL AND status = '在读'
         GROUP BY focus_level ORDER BY focus_level`,
      )
      .all() as Array<{ focus_level: number; c: number }>;
    lines.push(
      `关注等级分布：${focus.map((f) => `L${f.focus_level}=${f.c}`).join('，') || '无'}`,
    );

    lines.push('【考试班均总分趋势】');
    for (const p of overview.totalTrend.slice(-8)) {
      lines.push(
        `- ${p.examName}（${p.examDate ?? ''}）：班均 ${p.classAvg ?? '—'}，参考 ${p.gradeAvg ?? '—'}，样本 ${p.studentCount}`,
      );
    }

    lines.push('【本学期事件类别】');
    for (const item of overview.categoryDistribution.items) {
      lines.push(`- ${item.category}：${item.count}`);
    }
    if (overview.categoryDistribution.items.length === 0) {
      lines.push('- 暂无');
    }

    const contactCount = overview.categoryDistribution.items.find(
      (i) => i.category === '家校沟通',
    )?.count;
    lines.push(`家校沟通次数（本学期口径）：${contactCount ?? 0}`);

    const praise = overview.categoryDistribution.items.find(
      (i) => i.category === '表扬奖励',
    )?.count;
    lines.push(`表扬奖励条数：${praise ?? 0}`);

    lines.push('【进退步（最近两场）】');
    lines.push(
      `进步：${overview.rankMovers.improve.map((i) => `${i.name}(+${i.delta})`).join('、') || '无'}`,
    );
    lines.push(
      `退步：${overview.rankMovers.decline.map((i) => `${i.name}(${i.delta})`).join('、') || '无'}`,
    );

    return lines.join('\n');
  }

  /** 填充模板 */
  private fillTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => vars[key] ?? '');
  }

  /** 降级草稿 */
  private buildFallback(term: string, context: string): string {
    return `## ${term} 工作总结（占位）\n\n以下为系统数据摘要，请手工扩写：\n\n${context}\n\n（AI 未可用）`;
  }
}
