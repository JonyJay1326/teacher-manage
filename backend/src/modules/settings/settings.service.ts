import { Injectable } from '@nestjs/common';
import { AppException, ErrorCodes } from '../../common/api';
import { AuditLogsRepository } from '../../audit/audit-logs.repository';
import { DatabaseService } from '../../database/database.service';
import type { UpdateThresholdsDto } from './settings.dto';

/** 阈值视图 */
export interface ThresholdsView {
  lowScoreRatio: number;
  passRatio: number;
  excellentRatio: number;
  rankJumpThreshold: number;
}

/** 系统设置业务 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditLogsRepository: AuditLogsRepository,
  ) {}

  /** 读取阈值 */
  getThresholds(): ThresholdsView {
    const map = this.readAllSettings();
    return {
      lowScoreRatio: Number(map.low_score_ratio ?? 0.4),
      passRatio: Number(map.pass_ratio ?? 0.6),
      excellentRatio: Number(map.excellent_ratio ?? 0.85),
      rankJumpThreshold: Number(map.rank_jump_threshold ?? 8),
    };
  }

  /** 更新阈值（即时生效） */
  updateThresholds(dto: UpdateThresholdsDto): ThresholdsView {
    if (!(dto.lowScoreRatio < dto.passRatio && dto.passRatio < dto.excellentRatio)) {
      throw new AppException(
        ErrorCodes.VALIDATION,
        '须满足：低分线 < 及格线 < 优秀线',
      );
    }
    const db = this.databaseService.getDb();
    const upsert = db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );
    const tx = db.transaction(() => {
      upsert.run('low_score_ratio', String(dto.lowScoreRatio));
      upsert.run('pass_ratio', String(dto.passRatio));
      upsert.run('excellent_ratio', String(dto.excellentRatio));
      upsert.run('rank_jump_threshold', String(dto.rankJumpThreshold));
    });
    tx();
    this.auditLogsRepository.insert({
      action: 'settings_thresholds_update',
      detail: JSON.stringify(dto),
    });
    return this.getThresholds();
  }

  /** 分页审计日志 */
  listAuditLogs(input: {
    page: number;
    pageSize: number;
    q?: string;
    action?: string;
  }): {
    items: Array<{
      id: number;
      action: string;
      targetStudentId: number | null;
      detail: string | null;
      createdAt: string;
    }>;
    total: number;
  } {
    const { rows, total } = this.auditLogsRepository.findPageFiltered(
      input.page,
      input.pageSize,
      input.q,
      input.action,
    );
    return {
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        targetStudentId: r.target_student_id,
        detail: r.detail,
        createdAt: r.created_at,
      })),
      total,
    };
  }

  /** 读取全部 settings */
  private readAllSettings(): Record<string, string> {
    const rows = this.databaseService
      .getDb()
      .prepare('SELECT key, value FROM settings')
      .all() as Array<{ key: string; value: string }>;
    const map: Record<string, string> = {};
    for (const row of rows) map[row.key] = row.value;
    return map;
  }
}
