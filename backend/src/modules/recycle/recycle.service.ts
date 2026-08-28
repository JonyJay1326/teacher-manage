import { Injectable } from '@nestjs/common';
import { AppException, ErrorCodes } from '../../common/api';
import {
  RecycleEntityType,
  RecycleRepository,
} from './recycle.repository';

/** 回收站条目视图 */
export interface RecycleItemView {
  id: number;
  entityType: string;
  title: string;
  deletedAt: string;
  extra: string | null;
}

/** 回收站业务 */
@Injectable()
export class RecycleService {
  constructor(private readonly recycleRepository: RecycleRepository) {}

  /** 列表 */
  list(type: RecycleEntityType): RecycleItemView[] {
    return this.recycleRepository.listByType(type).map((row) => ({
      id: row.id,
      entityType: row.entity_type,
      title: row.title,
      deletedAt: row.deleted_at,
      extra: row.extra,
    }));
  }

  /** 恢复 */
  restore(type: RecycleEntityType, id: number): { ok: boolean } {
    const ok = this.recycleRepository.restore(type, id);
    if (!ok) {
      throw new AppException(ErrorCodes.NOT_FOUND, '回收站中未找到该记录', 404);
    }
    this.recycleRepository.insertAudit(
      'recycle_restore',
      JSON.stringify({ type, id }),
    );
    return { ok: true };
  }
}
