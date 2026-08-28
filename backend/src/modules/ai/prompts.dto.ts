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
  ValidateNested,
} from 'class-validator';

/** 场景枚举（不含已取消的 incident_extract） */
export const PROMPT_SCENES = [
  'comment',
  'report',
  'talk_script',
  'work_summary',
  'data_qa',
] as const;

/** 风格参数 */
export class PromptStyleParamsDto {
  @IsOptional()
  @IsIn(['亲切', '朴实', '严肃'])
  tone?: '亲切' | '朴实' | '严肃';

  @IsOptional()
  @IsIn(['短', '中', '长'])
  length?: '短' | '中' | '长';

  @IsOptional()
  @IsBoolean()
  includeAdvice?: boolean;
}

/** 创建/克隆模板 */
export class CreatePromptDto {
  @IsIn(PROMPT_SCENES)
  scene!: (typeof PROMPT_SCENES)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  template!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PromptStyleParamsDto)
  styleParams?: PromptStyleParamsDto;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

/** 更新模板 */
export class UpdatePromptDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  template?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PromptStyleParamsDto)
  styleParams?: PromptStyleParamsDto;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

/** 列表查询 */
export class ListPromptsQueryDto {
  @IsOptional()
  @IsIn(PROMPT_SCENES)
  scene?: (typeof PROMPT_SCENES)[number];
}

/** 记录列表查询 */
export class ListAiRecordsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  scene?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  studentId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;
}
