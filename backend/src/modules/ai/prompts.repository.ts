import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { nowIso } from '../../common/api';

/** 模板行 */
export interface AiPromptRow {
  id: number;
  scene: string;
  name: string;
  template: string;
  style_params: string | null;
  is_builtin: number;
  is_default: number;
  deleted_at: string | null;
}

/** Prompt 模板仓储 */
@Injectable()
export class PromptsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /** 列表（未软删） */
  list(scene?: string): AiPromptRow[] {
    if (scene) {
      return this.databaseService
        .getDb()
        .prepare(
          `SELECT * FROM ai_prompts
           WHERE deleted_at IS NULL AND scene = ?
           ORDER BY is_default DESC, is_builtin DESC, id ASC`,
        )
        .all(scene) as AiPromptRow[];
    }
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT * FROM ai_prompts
         WHERE deleted_at IS NULL
         ORDER BY scene ASC, is_default DESC, id ASC`,
      )
      .all() as AiPromptRow[];
  }

  /** 按 ID */
  findById(id: number): AiPromptRow | undefined {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT * FROM ai_prompts WHERE id = ? AND deleted_at IS NULL`,
      )
      .get(id) as AiPromptRow | undefined;
  }

  /** 场景默认模板 */
  findDefault(scene: string): AiPromptRow | undefined {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT * FROM ai_prompts
         WHERE scene = ? AND is_default = 1 AND deleted_at IS NULL
         ORDER BY id ASC LIMIT 1`,
      )
      .get(scene) as AiPromptRow | undefined;
  }

  /** 插入 */
  insert(input: {
    scene: string;
    name: string;
    template: string;
    styleParams: string | null;
    isBuiltin: boolean;
    isDefault: boolean;
  }): number {
    const result = this.databaseService
      .getDb()
      .prepare(
        `INSERT INTO ai_prompts (
           scene, name, template, style_params, is_builtin, is_default, deleted_at
         ) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        input.scene,
        input.name,
        input.template,
        input.styleParams,
        input.isBuiltin ? 1 : 0,
        input.isDefault ? 1 : 0,
      );
    return Number(result.lastInsertRowid);
  }

  /** 更新 */
  update(
    id: number,
    patch: {
      name?: string;
      template?: string;
      styleParams?: string | null;
      isDefault?: boolean;
    },
  ): void {
    const row = this.findById(id);
    if (!row) return;
    this.databaseService
      .getDb()
      .prepare(
        `UPDATE ai_prompts SET
           name = ?,
           template = ?,
           style_params = ?,
           is_default = ?
         WHERE id = ?`,
      )
      .run(
        patch.name ?? row.name,
        patch.template ?? row.template,
        patch.styleParams !== undefined ? patch.styleParams : row.style_params,
        patch.isDefault !== undefined
          ? patch.isDefault
            ? 1
            : 0
          : row.is_default,
        id,
      );
  }

  /** 清除场景默认 */
  clearDefault(scene: string): void {
    this.databaseService
      .getDb()
      .prepare(
        `UPDATE ai_prompts SET is_default = 0
         WHERE scene = ? AND deleted_at IS NULL`,
      )
      .run(scene);
  }

  /** 软删除 */
  softDelete(id: number): void {
    this.databaseService
      .getDb()
      .prepare(
        `UPDATE ai_prompts SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(nowIso(), id);
  }
}
