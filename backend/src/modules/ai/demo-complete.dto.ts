import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** 演示/代理：仅转发 DeepSeek，不查学生、不写业务表 */
export class DemoCompleteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  systemPrompt!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80000)
  userPrompt!: string;

  /** 场景标记（仅日志/返回，不落库） */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  scene?: string;
}
