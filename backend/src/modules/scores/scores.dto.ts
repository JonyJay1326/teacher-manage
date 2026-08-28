import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/** 成绩状态（入库中文） */
export type ScoreStatusCn = '正常' | '缺考' | '免考';

/** 成绩单元格状态（API 输出英文） */
export type ScoreCellStatus = 'normal' | 'absent' | 'exempt' | 'empty';

/** 创建考试 */
export class CreateExamDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  examType!: string;

  @IsInt()
  termId!: number;

  @IsString()
  @MinLength(1)
  examDate!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  subjectIds!: number[];
}

/** 更新考试（字段均可选） */
export class UpdateExamDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  examType?: string;

  @IsOptional()
  @IsInt()
  termId?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  examDate?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  subjectIds?: number[];
}

/** 批量录入单条 */
export class ScoreBatchItemDto {
  @IsInt()
  studentId!: number;

  /** 分数；缺考/免考或清空时可为 null */
  @ValidateIf((_, value: unknown) => value !== null && value !== undefined)
  @IsNumber()
  score!: number | null;

  @IsIn(['正常', '缺考', '免考'])
  status!: ScoreStatusCn;
}

/** 批量保存成绩 */
export class BatchUpsertScoresDto {
  @IsInt()
  examId!: number;

  @IsInt()
  subjectId!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ScoreBatchItemDto)
  items!: ScoreBatchItemDto[];
}

/** 重算排名请求体 */
export class RecalcRanksDto {
  @IsOptional()
  @IsInt()
  subjectId?: number;
}

/** Excel 导入写入模式 */
export const EXCEL_WRITE_MODES = ['overwrite', 'fillEmpty'] as const;

/** Excel 导入提交单格 */
export class ExcelImportCommitItemDto {
  @IsInt()
  studentId!: number;

  @IsInt()
  subjectId!: number;

  @ValidateIf((_, value: unknown) => value !== null && value !== undefined)
  @IsNumber()
  score!: number | null;

  @IsIn(['正常', '缺考', '免考'])
  status!: ScoreStatusCn;
}

/** Excel 导入确认提交 */
export class ExcelImportCommitDto {
  @IsIn(EXCEL_WRITE_MODES)
  writeMode!: (typeof EXCEL_WRITE_MODES)[number];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExcelImportCommitItemDto)
  items!: ExcelImportCommitItemDto[];
}
