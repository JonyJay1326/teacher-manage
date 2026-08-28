import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { KbQaService } from '../ai/kb-qa.service';
import { AppException, ErrorCodes } from '../../common/api';
import {
  CreateKbPasteDto,
  KbAskDto,
  ListKbDocumentsQueryDto,
  UpdateKbDocumentDto,
} from './knowledge.dto';
import { KnowledgeService, type UploadedKbFile } from './knowledge.service';

/** 知识库控制器 */
@Controller('v1/knowledge')
export class KnowledgeController {
  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly kbQaService: KbQaService,
  ) {}

  /** 分类列表 */
  @Get('categories')
  categories() {
    return this.knowledgeService.listCategories();
  }

  /** 文档列表 */
  @Get('documents')
  list(@Query() query: ListKbDocumentsQueryDto) {
    return this.knowledgeService.list({
      category: query.category,
      keyword: query.keyword,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    });
  }

  /** 文档详情 */
  @Get('documents/:id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.knowledgeService.getDetail(id);
  }

  /** 粘贴文本入库 */
  @Post('documents/paste')
  paste(@Body() dto: CreateKbPasteDto) {
    return this.knowledgeService.createFromPaste({
      title: dto.title,
      categoryPath: dto.categoryPath,
      tags: dto.tags,
      content: dto.content,
    });
  }

  /** 上传文件入库 */
  @Post('documents/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  async upload(
    @UploadedFile() file: UploadedKbFile | undefined,
    @Body() body: { title?: string; categoryPath?: string; tags?: string },
  ) {
    if (!file) {
      throw new AppException(ErrorCodes.VALIDATION, '请上传文件');
    }
    return this.knowledgeService.createFromUpload(file, {
      title: body.title,
      categoryPath: body.categoryPath,
      tags: body.tags,
    });
  }

  /** 更新元数据 */
  @Patch('documents/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateKbDocumentDto,
  ) {
    return this.knowledgeService.update(id, dto);
  }

  /** 软删除 */
  @Delete('documents/:id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.knowledgeService.remove(id);
  }

  /** RAG 问答 */
  @Post('ask')
  ask(@Body() dto: KbAskDto) {
    return this.kbQaService.ask(dto.question);
  }
}
