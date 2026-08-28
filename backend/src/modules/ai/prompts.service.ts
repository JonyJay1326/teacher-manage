import { Injectable } from '@nestjs/common';
import { AppException, ErrorCodes } from '../../common/api';
import type { CreatePromptDto, UpdatePromptDto } from './prompts.dto';
import { PromptsRepository, type AiPromptRow } from './prompts.repository';

/** 风格参数视图 */
export interface PromptStyleParamsView {
  tone?: '亲切' | '朴实' | '严肃';
  length?: '短' | '中' | '长';
  includeAdvice?: boolean;
}

/** 模板视图 */
export interface PromptView {
  id: number;
  scene: string;
  name: string;
  template: string;
  styleParams: PromptStyleParamsView;
  isBuiltin: boolean;
  isDefault: boolean;
}

/** 占位符说明 */
export interface PromptPlaceholderMeta {
  key: string;
  label: string;
  sample: string;
}

/** Prompt 业务 */
@Injectable()
export class PromptsService {
  constructor(private readonly promptsRepository: PromptsRepository) {}

  /** 场景可用占位符 */
  getPlaceholders(scene: string): PromptPlaceholderMeta[] {
    if (scene === 'comment') {
      return [
        { key: 'student_name', label: '学生姓名', sample: '李敏' },
        { key: 'term', label: '学期名', sample: '2026-2027 第一学期' },
        { key: 'style_tone', label: '语气', sample: '朴实' },
        { key: 'style_length', label: '篇幅', sample: '150-220字' },
        { key: 'style_advice', label: '是否含建议', sample: '是' },
        { key: 'score_trend', label: '成绩摘要', sample: '摸底考总分…' },
        { key: 'incident_summary', label: '事件摘要', sample: '本学期暂无…' },
        { key: 'praise_summary', label: '表扬摘要', sample: '无' },
        { key: 'last_comment', label: '上次评语', sample: '无历史评语' },
        { key: 'impression', label: '班主任印象', sample: '课堂活跃，乐于助人…' },
      ];
    }
    if (scene === 'data_qa') {
      return [
        { key: 'scope', label: '查询范围', sample: '全班 / 张三' },
        { key: 'context', label: '系统数据块', sample: '（规则组装的成绩、事件与印象）' },
      ];
    }
    if (scene === 'talk_script') {
      return [
        { key: 'scene', label: '场景描述', sample: '家长来电反映…' },
        { key: 'context', label: '学生资料', sample: '（可选注入）' },
        { key: 'student_name', label: '学生姓名', sample: '李敏' },
      ];
    }
    if (scene === 'work_summary') {
      return [
        { key: 'term', label: '学期名', sample: '2026-2027 第一学期' },
        { key: 'context', label: '班级数据', sample: '（考试趋势与事件统计）' },
      ];
    }
    return [
      { key: 'student_name', label: '学生姓名', sample: '李敏' },
      { key: 'context', label: '上下文', sample: '（系统注入）' },
    ];
  }

  /** 列表（隐藏已取消的事件整理场景） */
  list(scene?: string): PromptView[] {
    return this.promptsRepository
      .list(scene)
      .filter((r) => r.scene !== 'incident_extract')
      .map((r) => this.toView(r));
  }

  /** 详情 */
  getById(id: number): PromptView {
    return this.toView(this.requirePrompt(id));
  }

  /** 创建 */
  create(dto: CreatePromptDto): PromptView {
    if (dto.isDefault) {
      this.promptsRepository.clearDefault(dto.scene);
    }
    const id = this.promptsRepository.insert({
      scene: dto.scene,
      name: dto.name.trim(),
      template: dto.template,
      styleParams: dto.styleParams ? JSON.stringify(dto.styleParams) : null,
      isBuiltin: false,
      isDefault: Boolean(dto.isDefault),
    });
    return this.getById(id);
  }

  /** 克隆（含内置） */
  clone(id: number): PromptView {
    const src = this.requirePrompt(id);
    if (src.scene === 'incident_extract') {
      throw new AppException(
        ErrorCodes.FORBIDDEN,
        '事件整理场景已取消，不可克隆',
      );
    }
    const newId = this.promptsRepository.insert({
      scene: src.scene,
      name: `${src.name}（副本）`,
      template: src.template,
      styleParams: src.style_params,
      isBuiltin: false,
      isDefault: false,
    });
    return this.getById(newId);
  }

  /** 更新（内置可改正文但保留 builtin 标记；不可删） */
  update(id: number, dto: UpdatePromptDto): PromptView {
    const row = this.requirePrompt(id);
    if (row.scene === 'incident_extract') {
      throw new AppException(
        ErrorCodes.FORBIDDEN,
        '事件整理场景已取消，不可编辑',
      );
    }
    if (dto.isDefault === true) {
      this.promptsRepository.clearDefault(row.scene);
    }
    this.promptsRepository.update(id, {
      name: dto.name?.trim(),
      template: dto.template,
      styleParams:
        dto.styleParams !== undefined
          ? JSON.stringify(dto.styleParams)
          : undefined,
      isDefault: dto.isDefault,
    });
    return this.getById(id);
  }

  /** 软删除（内置不可删） */
  remove(id: number): { ok: boolean } {
    const row = this.requirePrompt(id);
    if (row.is_builtin === 1) {
      throw new AppException(ErrorCodes.FORBIDDEN, '内置模板不可删除，可克隆后编辑');
    }
    if (row.is_default === 1) {
      throw new AppException(
        ErrorCodes.STATE_INVALID,
        '默认模板请先改设其他默认再删除',
      );
    }
    this.promptsRepository.softDelete(id);
    return { ok: true };
  }

  /** 设为默认 */
  setDefault(id: number): PromptView {
    const row = this.requirePrompt(id);
    this.promptsRepository.clearDefault(row.scene);
    this.promptsRepository.update(id, { isDefault: true });
    return this.getById(id);
  }

  /** 必须存在 */
  requirePrompt(id: number): AiPromptRow {
    const row = this.promptsRepository.findById(id);
    if (!row) {
      throw new AppException(ErrorCodes.NOT_FOUND, '模板不存在', 404);
    }
    return row;
  }

  /** 行转视图 */
  private toView(row: AiPromptRow): PromptView {
    return {
      id: row.id,
      scene: row.scene,
      name: row.name,
      template: row.template,
      styleParams: this.parseStyle(row.style_params),
      isBuiltin: row.is_builtin === 1,
      isDefault: row.is_default === 1,
    };
  }

  /** 解析风格 JSON */
  private parseStyle(raw: string | null): PromptStyleParamsView {
    if (!raw) return {};
    try {
      const obj = JSON.parse(raw) as PromptStyleParamsView;
      return obj && typeof obj === 'object' ? obj : {};
    } catch {
      return {};
    }
  }
}
