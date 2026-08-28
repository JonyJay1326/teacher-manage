import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** 花名册列表查询 */
export class ListStudentsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3)
  focusLevel?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

/** 新建学生 */
export class CreateStudentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  studentNo!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  gender?: number;

  @IsOptional()
  @IsString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  photoPath?: string;

  @IsOptional()
  @IsString()
  ethnicity?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  residence?: string;

  @IsOptional()
  @IsString()
  enrolledAt?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  boardType?: string;

  @IsOptional()
  @IsString()
  cadreRole?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3)
  focusLevel?: number;

  @IsOptional()
  @IsString()
  remark?: string;
}

/** 更新学生（部分字段） */
export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  studentNo?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  gender?: number | null;

  @IsOptional()
  @IsString()
  birthDate?: string | null;

  @IsOptional()
  @IsString()
  photoPath?: string | null;

  @IsOptional()
  @IsString()
  ethnicity?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsString()
  residence?: string | null;

  @IsOptional()
  @IsString()
  enrolledAt?: string | null;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  boardType?: string | null;

  @IsOptional()
  @IsString()
  cadreRole?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3)
  focusLevel?: number;

  @IsOptional()
  @IsString()
  remark?: string | null;
}

/** 替换学生标签 */
export class ReplaceTagsDto {
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  tagIds!: number[];
}

/** 新建监护人 */
export class CreateGuardianDto {
  @IsOptional()
  @IsString()
  relation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  wechat?: string;

  @IsOptional()
  @IsString()
  job?: string;

  @IsOptional()
  @IsString()
  contactPref?: string;

  @IsOptional()
  @IsString()
  bestTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  isPrimary?: number;

  @IsOptional()
  @IsString()
  remark?: string;
}

/** 更新监护人 */
export class UpdateGuardianDto {
  @IsOptional()
  @IsString()
  relation?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  wechat?: string | null;

  @IsOptional()
  @IsString()
  job?: string | null;

  @IsOptional()
  @IsString()
  contactPref?: string | null;

  @IsOptional()
  @IsString()
  bestTime?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  isPrimary?: number;

  @IsOptional()
  @IsString()
  remark?: string | null;
}

/** 粘贴导入预览 */
export class ImportPreviewDto {
  @IsString()
  @MinLength(1)
  text!: string;
}

/** 导入确认单行 */
export class ImportConfirmRowDto {
  @IsOptional()
  @IsString()
  studentNo?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  @IsIn(['create', 'skip', 'match'])
  action!: 'create' | 'skip' | 'match';
}

/** 粘贴导入确认 */
export class ImportConfirmDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ImportConfirmRowDto)
  rows!: ImportConfirmRowDto[];
}

/** 写入高敏内容 */
export class UpsertSensitiveDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  content!: string;
}

/** 保存班主任对学生的印象 */
export class UpsertImpressionDto {
  @IsString()
  @MaxLength(10000)
  content!: string;
}
