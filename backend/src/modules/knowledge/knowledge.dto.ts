import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/** 文档列表查询 */
export class ListKbDocumentsQueryDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

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
}

/** 粘贴文本入库 */
export class CreateKbPasteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoryPath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tags?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500000)
  content!: string;
}

/** 更新文档元数据 */
export class UpdateKbDocumentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoryPath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tags?: string;
}

/** 知识库问答 */
export class KbAskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  question!: string;
}
