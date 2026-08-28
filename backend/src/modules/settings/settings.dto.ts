import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** 更新阈值 */
export class UpdateThresholdsDto {
  @IsNumber()
  @Min(0.05)
  @Max(0.95)
  lowScoreRatio!: number;

  @IsNumber()
  @Min(0.1)
  @Max(0.99)
  passRatio!: number;

  @IsNumber()
  @Min(0.2)
  @Max(1)
  excellentRatio!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  rankJumpThreshold!: number;
}

/** 审计日志查询 */
export class ListAuditLogsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;
}
