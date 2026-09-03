import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** 事件类别枚举 */
export const INCIDENT_CATEGORIES = [
  '纪律违纪',
  '情绪行为',
  '伤病健康',
  '家校沟通',
  '表扬奖励',
  '学习问题',
  '其他',
] as const;

/** 事件类别类型 */
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

/** 事件状态 */
export const INCIDENT_STATUSES = ['draft', 'confirmed'] as const;

/** 列表查询 DTO */
export class ListIncidentsQueryDto {
  @IsOptional()
  @IsIn(INCIDENT_STATUSES)
  status?: (typeof INCIDENT_STATUSES)[number];

  @IsOptional()
  @IsIn(INCIDENT_CATEGORIES)
  category?: IncidentCategory;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 50;
}

/** 创建速记草稿 DTO */
export class CreateDraftDto {
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  studentIds!: number[];

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  content!: string;

  @IsOptional()
  @IsIn(INCIDENT_CATEGORIES)
  category?: IncidentCategory;

  @IsOptional()
  @IsString()
  occurredAt?: string;
}

/** 确认事件（草稿转正式）DTO */
export class ConfirmIncidentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  content!: string;

  @IsIn(INCIDENT_CATEGORIES)
  category!: IncidentCategory;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  severity!: number;

  @IsArray()
  @ArrayNotEmpty()
  @Type(() => Number)
  @IsInt({ each: true })
  studentIds!: number[];

  @IsOptional()
  @IsBoolean()
  followUpNeeded?: boolean;

  @IsOptional()
  @IsString()
  followUpDeadline?: string | null;
}

/** 更新事件 DTO（部分字段） */
export class UpdateIncidentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  content?: string;

  @IsOptional()
  @IsIn(INCIDENT_CATEGORIES)
  category?: IncidentCategory;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  severity?: number;

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  studentIds?: number[];

  @IsOptional()
  @IsString()
  occurredAt?: string;

  @IsOptional()
  @IsBoolean()
  followUpNeeded?: boolean;

  @IsOptional()
  @IsString()
  followUpDeadline?: string | null;

  @IsOptional()
  @IsBoolean()
  followUpDone?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  followUpResult?: string | null;
}

/** 直接新建正式事件 */
export class CreateIncidentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  content!: string;

  @IsIn(INCIDENT_CATEGORIES)
  category!: IncidentCategory;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  severity!: number;

  @IsArray()
  @ArrayNotEmpty()
  @Type(() => Number)
  @IsInt({ each: true })
  studentIds!: number[];

  @IsOptional()
  @IsString()
  occurredAt?: string;

  @IsOptional()
  @IsBoolean()
  followUpNeeded?: boolean;

  @IsOptional()
  @IsString()
  followUpDeadline?: string | null;
}
