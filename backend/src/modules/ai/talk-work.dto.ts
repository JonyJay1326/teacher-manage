import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** 沟通话术生成 */
export class TalkScriptDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  scene!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  studentId?: number;

  @IsOptional()
  @IsBoolean()
  includeContext?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  promptId?: number;
}

/** 学期工作总结生成 */
export class WorkSummaryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  termId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  promptId?: number;
}
