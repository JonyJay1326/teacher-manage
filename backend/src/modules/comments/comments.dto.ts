import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** 评语类型 */
export const COMMENT_TYPES = ['期中评语', '期末评语', '日常评语'] as const;

/** 语气 */
export const COMMENT_TONES = ['亲切', '朴实', '严肃'] as const;

/** 篇幅 */
export const COMMENT_LENGTHS = ['短', '中', '长'] as const;

/** 工作台查询 */
export class WorkbenchQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  termId!: number;

  @IsString()
  @IsIn(COMMENT_TYPES)
  commentType!: (typeof COMMENT_TYPES)[number];
}

/** 生成评语 */
export class GenerateCommentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  studentId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  termId?: number;

  @IsString()
  @IsIn(COMMENT_TYPES)
  commentType!: (typeof COMMENT_TYPES)[number];

  @IsOptional()
  @IsIn(COMMENT_TONES)
  tone?: (typeof COMMENT_TONES)[number];

  @IsOptional()
  @IsIn(COMMENT_LENGTHS)
  length?: (typeof COMMENT_LENGTHS)[number];

  @IsOptional()
  @IsBoolean()
  includeAdvice?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  promptId?: number;
}

/** 采纳评语 */
export class AdoptCommentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  studentId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  termId?: number;

  @IsString()
  @IsIn(COMMENT_TYPES)
  commentType!: (typeof COMMENT_TYPES)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  finalText!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  aiRecordId?: number;
}

/** 手工新建评语 */
export class CreateCommentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  studentId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  termId?: number;

  @IsString()
  @IsIn(COMMENT_TYPES)
  commentType!: (typeof COMMENT_TYPES)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  finalText!: string;
}

/** 上下文预览查询 */
export class ContextQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  termId?: number;
}
