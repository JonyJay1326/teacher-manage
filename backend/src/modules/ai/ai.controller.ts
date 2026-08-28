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
} from '@nestjs/common';
import { AppException, ErrorCodes } from '../../common/api';
import { AiRepository } from './ai.repository';
import { AiService, type AiHealthView } from './ai.service';
import { DataAskDto } from './data-qa.dto';
import { DataQaService } from './data-qa.service';
import {
  CreatePromptDto,
  ListAiRecordsQueryDto,
  ListPromptsQueryDto,
  UpdatePromptDto,
} from './prompts.dto';
import { PromptsService } from './prompts.service';
import { TalkScriptDto, WorkSummaryDto } from './talk-work.dto';
import { TalkScriptService } from './talk-script.service';
import { WorkSummaryService } from './work-summary.service';

/** AI 控制器：健康 / 模板 / 生成历史 / 学情问答 / 话术 / 总结 */
@Controller('v1/ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly promptsService: PromptsService,
    private readonly aiRepository: AiRepository,
    private readonly dataQaService: DataQaService,
    private readonly talkScriptService: TalkScriptService,
    private readonly workSummaryService: WorkSummaryService,
  ) {}

  /** 健康与当月用量 */
  @Get('health')
  health(): AiHealthView {
    return this.aiService.getHealth();
  }

  /** 学情问答 */
  @Post('data-ask')
  dataAsk(@Body() dto: DataAskDto) {
    return this.dataQaService.ask({
      question: dto.question,
      studentId: dto.studentId,
    });
  }

  /** 沟通话术 */
  @Post('talk-script')
  talkScript(@Body() dto: TalkScriptDto) {
    return this.talkScriptService.generate({
      scene: dto.scene,
      studentId: dto.studentId,
      includeContext: dto.includeContext,
      promptId: dto.promptId,
    });
  }

  /** 学期工作总结 */
  @Post('work-summary')
  workSummary(@Body() dto: WorkSummaryDto) {
    return this.workSummaryService.generate({
      termId: dto.termId,
      promptId: dto.promptId,
    });
  }

  /** 模板列表 */
  @Get('prompts')
  listPrompts(@Query() query: ListPromptsQueryDto) {
    return {
      items: this.promptsService.list(query.scene),
      placeholders: this.promptsService.getPlaceholders(query.scene ?? 'comment'),
    };
  }

  /** 模板详情 */
  @Get('prompts/:id')
  getPrompt(@Param('id', ParseIntPipe) id: number) {
    return this.promptsService.getById(id);
  }

  /** 新建模板 */
  @Post('prompts')
  createPrompt(@Body() dto: CreatePromptDto) {
    return this.promptsService.create(dto);
  }

  /** 克隆模板 */
  @Post('prompts/:id/clone')
  clonePrompt(@Param('id', ParseIntPipe) id: number) {
    return this.promptsService.clone(id);
  }

  /** 更新模板 */
  @Patch('prompts/:id')
  updatePrompt(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePromptDto,
  ) {
    return this.promptsService.update(id, dto);
  }

  /** 设为默认 */
  @Post('prompts/:id/default')
  setDefault(@Param('id', ParseIntPipe) id: number) {
    return this.promptsService.setDefault(id);
  }

  /** 软删除模板 */
  @Delete('prompts/:id')
  removePrompt(@Param('id', ParseIntPipe) id: number) {
    return this.promptsService.remove(id);
  }

  /** 生成历史 */
  @Get('records')
  listRecords(@Query() query: ListAiRecordsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const { rows, total } = this.aiRepository.findPage({
      scene: query.scene,
      studentId: query.studentId,
      status: query.status,
      page,
      pageSize,
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        scene: r.scene,
        promptId: r.prompt_id,
        studentId: r.student_id,
        studentName: r.student_name,
        contextSnapshot: r.context_snapshot,
        outputText: r.output_text,
        model: r.model,
        tokensIn: r.tokens_in,
        tokensOut: r.tokens_out,
        status: r.status,
        createdAt: r.created_at,
      })),
      total,
      page,
      pageSize,
    };
  }

  /** 单条记录 */
  @Get('records/:id')
  getRecord(@Param('id', ParseIntPipe) id: number) {
    const row = this.aiRepository.findById(id);
    if (!row) {
      throw new AppException(ErrorCodes.NOT_FOUND, '记录不存在', 404);
    }
    return {
      id: row.id,
      scene: row.scene,
      studentId: row.student_id,
      contextSnapshot: row.context_snapshot,
      outputText: row.output_text,
      status: row.status,
      createdAt: row.created_at,
    };
  }
}
